-- A phone can be ringing or connected in JustCall even when the agent has
-- navigated away from ClaimReach. Keep a short, shared lease per provider SID
-- and an atomic pre-dial reservation. Only the server's service role may read
-- or write these phone/agent records.
create table if not exists public.cr_call_presence (
  call_sid text primary key,
  phone_norm text not null check (phone_norm ~ '^[0-9]{10}$'),
  state text not null check (state in ('ringing', 'connected', 'ended')),
  agent_name text,
  agent_email text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists cr_call_presence_active_phone_idx on public.cr_call_presence (phone_norm, expires_at) where ended_at is null;
alter table public.cr_call_presence enable row level security;
revoke all on public.cr_call_presence from public, anon, authenticated;
grant select, insert, update on public.cr_call_presence to service_role;

create table if not exists public.cr_call_reservations (
  phone_norm text primary key check (phone_norm ~ '^[0-9]{10}$'),
  agent_id uuid not null,
  agent_name text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.cr_call_reservations enable row level security;
revoke all on public.cr_call_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.cr_call_reservations to service_role;

-- Terminal is monotonic. A late ringing/answered event for the same SID can
-- enrich the name, but cannot resurrect a completed call.
create or replace function public.cr_record_call_presence(
  p_sid text, p_phone text, p_state text, p_agent_name text, p_agent_email text
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if length(coalesce(p_sid, '')) < 2 or p_phone !~ '^[0-9]{10}$'
    or p_state not in ('ringing', 'connected', 'ended') then
    raise exception 'Invalid call presence event';
  end if;
  insert into public.cr_call_presence
    (call_sid, phone_norm, state, agent_name, agent_email, ended_at, expires_at)
  values (p_sid, p_phone, p_state, nullif(p_agent_name, ''), nullif(p_agent_email, ''),
    case when p_state = 'ended' then now() else null end,
    case when p_state = 'connected' then now() + interval '4 hours'
         when p_state = 'ringing' then now() + interval '15 minutes' else now() end)
  on conflict (call_sid) do update set
    state = case when public.cr_call_presence.ended_at is not null then 'ended'
                 when excluded.state = 'ended' then 'ended'
                 when excluded.state = 'connected' then 'connected'
                 else public.cr_call_presence.state end,
    agent_name = coalesce(excluded.agent_name, public.cr_call_presence.agent_name),
    agent_email = coalesce(excluded.agent_email, public.cr_call_presence.agent_email),
    ended_at = case when excluded.state = 'ended' then coalesce(public.cr_call_presence.ended_at, now())
                    else public.cr_call_presence.ended_at end,
    expires_at = case when public.cr_call_presence.ended_at is not null or excluded.state = 'ended' then now()
                      when excluded.state = 'connected' then now() + interval '4 hours'
                      else greatest(public.cr_call_presence.expires_at, excluded.expires_at) end,
    updated_at = now();
  if p_state = 'ended' then
    -- Clear only the reservation that predates this call. A duplicate late
    -- terminal webhook must not erase a new agent's later reservation.
    delete from public.cr_call_reservations r
    where r.phone_norm = p_phone
      and r.created_at <= (select started_at from public.cr_call_presence where call_sid = p_sid);
  end if;
end;
$$;
revoke all on function public.cr_record_call_presence(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.cr_record_call_presence(text,text,text,text,text) to service_role;

-- Transaction advisory lock closes the two-agent click race for the same
-- phone. The lease bridges the period before JustCall's webhook arrives.
create or replace function public.cr_reserve_call_phone(
  p_phone text, p_agent_id uuid, p_agent_name text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  live record;
  held record;
begin
  if p_phone !~ '^[0-9]{10}$' or p_agent_id is null then raise exception 'Invalid call reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_phone));
  select state, agent_name, agent_email into live from public.cr_call_presence
    where phone_norm = p_phone and ended_at is null and expires_at > now()
    order by case state when 'connected' then 0 else 1 end, updated_at desc limit 1;
  if found then
    return jsonb_build_object('reserved', false, 'state', live.state, 'agent_name', live.agent_name, 'agent_email', live.agent_email);
  end if;
  select agent_name into held from public.cr_call_reservations
    where phone_norm = p_phone and expires_at > now();
  if found then
    return jsonb_build_object('reserved', false, 'state', 'starting', 'agent_name', held.agent_name);
  end if;
  insert into public.cr_call_reservations (phone_norm, agent_id, agent_name, expires_at)
    values (p_phone, p_agent_id, nullif(p_agent_name, ''), now() + interval '2 minutes')
    on conflict (phone_norm) do update set agent_id = excluded.agent_id,
      agent_name = excluded.agent_name, expires_at = excluded.expires_at, created_at = now();
  return jsonb_build_object('reserved', true, 'state', 'starting', 'agent_name', p_agent_name);
end;
$$;
revoke all on function public.cr_reserve_call_phone(text,uuid,text) from public, anon, authenticated;
grant execute on function public.cr_reserve_call_phone(text,uuid,text) to service_role;
