-- 0120 Secure identity capture (apply after 0119).
-- Full SSN is encrypted by Supabase Vault; public metadata carries no SSN value.
-- RPCs are service-role only; callers must first resolve the exact matter with RLS.
begin;

do $$
begin
  if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is required for secure identity storage.';
  end if;
end $$;

create table if not exists public.lead_identity_secrets (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  firm_id uuid not null references public.firms(id),
  vault_secret_id uuid not null unique references vault.secrets(id),
  mode text not null check (mode in ('full', 'last4')),
  version integer not null check (version > 0),
  saved_at timestamptz not null default now(),
  saved_by uuid references public.app_users(id) on delete set null
);
alter table public.lead_identity_secrets enable row level security;
revoke all on public.lead_identity_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.lead_identity_secrets to service_role;

-- Existing firm transfers update the lead and its related rows atomically, but
-- do not yet transfer this private identity association. Block the switch until
-- that transfer path explicitly handles it; never silently strand saved SSN.
create or replace function public.cr_guard_identity_firm_move()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.firm_id is distinct from old.firm_id and exists (
    select 1 from public.lead_identity_secrets i where i.lead_id = old.id
  ) then
    raise exception using errcode = '23514', message = 'This file has saved identity information. Secure identity transfer is required before changing firms.';
  end if;
  return new;
end $$;
revoke all on function public.cr_guard_identity_firm_move() from public, anon, authenticated;
drop trigger if exists cr_guard_identity_firm_move on public.leads;
create trigger cr_guard_identity_firm_move before update of firm_id on public.leads
for each row execute function public.cr_guard_identity_firm_move();

create or replace function public.cr_identity_metadata(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare saved public.lead_identity_secrets%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if not exists (
    select 1 from public.leads l join public.claims c on c.lead_id = l.id and c.firm_id = l.firm_id
    where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null and c.id = p_claim_id
  ) then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id;
  if not found then return jsonb_build_object('saved', false, 'mode', null, 'version', 0, 'saved_at', null); end if;
  if saved.firm_id is distinct from p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  return jsonb_build_object('saved', true, 'mode', saved.mode, 'version', saved.version, 'saved_at', saved.saved_at);
end $$;

create or replace function public.cr_save_identity(
  p_lead_id uuid, p_claim_id uuid, p_firm_id uuid, p_ssn text,
  p_mode text, p_expected_version integer, p_actor_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  saved public.lead_identity_secrets%rowtype;
  secret_id uuid;
  next_version integer;
  stamp timestamptz := now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_mode is null
     or p_mode not in ('full', 'last4') or p_ssn is null
     or (p_mode = 'full' and p_ssn !~ '^[0-9]{9}$')
     or (p_mode = 'last4' and p_ssn !~ '^[0-9]{4}$') then
    raise exception using errcode = '22023', message = 'Invalid identity input.';
  end if;
  if not exists (
    select 1 from public.app_users u where u.id = p_actor_id and u.active = true
      and u.role::text in ('owner', 'admin', 'manager', 'agent', 'qa')
  ) then raise exception using errcode = '42501', message = 'Active staff required.'; end if;
  -- Lock the lead even on first capture: two simultaneous version-zero saves
  -- cannot create orphan Vault secrets or overwrite one another.
  perform 1 from public.leads l
   where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null
     and exists (select 1 from public.claims c where c.id = p_claim_id and c.lead_id = l.id and c.firm_id = l.firm_id)
   for update;
  if not found then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id for update;
  if found and saved.firm_id <> p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  if coalesce(saved.version, 0) <> p_expected_version then
    raise exception using errcode = '40001', message = 'Identity version changed.';
  end if;
  -- Selecting last-four mode must never silently destroy an already captured
  -- full SSN. Correcting an existing full SSN requires a complete replacement.
  if saved.mode = 'full' and p_mode = 'last4' then
    raise exception using errcode = '40001', message = 'Full identity cannot be reduced to last four.';
  end if;
  next_version := coalesce(saved.version, 0) + 1;
  if saved.vault_secret_id is null then
    secret_id := vault.create_secret(p_ssn, 'claimreach_identity_' || p_lead_id::text, 'Private claimant identity');
    insert into public.lead_identity_secrets (lead_id, firm_id, vault_secret_id, mode, version, saved_at, saved_by)
    values (p_lead_id, p_firm_id, secret_id, p_mode, next_version, stamp, p_actor_id);
  else
    perform vault.update_secret(saved.vault_secret_id, p_ssn);
    update public.lead_identity_secrets set mode = p_mode, version = next_version, saved_at = stamp, saved_by = p_actor_id
      where lead_id = p_lead_id and firm_id = p_firm_id;
  end if;
  update public.leads set ssn_last4 = right(p_ssn, 4) where id = p_lead_id and firm_id = p_firm_id;
  -- Audit belongs in the same transaction and includes no value, last4 or hash.
  insert into public.lead_activity (firm_id, lead_id, kind, actor, body, meta)
  values (p_firm_id, p_lead_id, 'system', p_actor_id, 'Secure identity information saved.',
    jsonb_build_object('event', 'secure_identity_saved', 'claim_id', p_claim_id, 'mode', p_mode, 'version', next_version));
  return jsonb_build_object('saved', true, 'mode', p_mode, 'version', next_version, 'saved_at', stamp);
end $$;

create or replace function public.cr_read_identity_for_signing(p_lead_id uuid, p_claim_id uuid, p_firm_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare saved public.lead_identity_secrets%rowtype; identity_value text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service access required.';
  end if;
  if not exists (
    select 1 from public.leads l join public.claims c on c.lead_id = l.id and c.firm_id = l.firm_id
    where l.id = p_lead_id and l.firm_id = p_firm_id and l.archived_at is null and c.id = p_claim_id
  ) then raise exception using errcode = '42501', message = 'Identity scope unavailable.'; end if;
  select * into saved from public.lead_identity_secrets i where i.lead_id = p_lead_id;
  if not found then return null; end if;
  if saved.firm_id is distinct from p_firm_id then
    raise exception using errcode = '42501', message = 'Identity firm association requires review.';
  end if;
  select s.decrypted_secret into identity_value from vault.decrypted_secrets s where s.id = saved.vault_secret_id;
  if identity_value is null then raise exception using errcode = 'P0001', message = 'Secure identity unavailable.'; end if;
  return jsonb_build_object('ssn', identity_value, 'mode', saved.mode, 'version', saved.version);
end $$;

revoke all on function public.cr_identity_metadata(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cr_save_identity(uuid, uuid, uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.cr_read_identity_for_signing(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cr_identity_metadata(uuid, uuid, uuid) to service_role;
grant execute on function public.cr_save_identity(uuid, uuid, uuid, text, text, integer, uuid) to service_role;
grant execute on function public.cr_read_identity_for_signing(uuid, uuid, uuid) to service_role;

commit;
