-- 0129: PR Digital read-only sheet. Independent of held payroll migration 0128.
-- No staff/firm auth profile, no access for anon/authenticated, no lead changes.
begin;
create table public.partner_report_access (
  report_key text primary key check (report_key = 'pr-digital'),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  scope text not null default 'approved_sources' check (scope in ('approved_sources', 'campaign')),
  active boolean not null default false,
  password_salt text not null check (password_salt ~ '^[0-9a-f]{32}$'),
  password_hash text not null check (password_hash ~ '^[0-9a-f]{64}$'),
  token_secret text not null check (token_secret ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.partner_report_access enable row level security;
revoke all on public.partner_report_access from public, anon, authenticated;
grant select, insert, update on public.partner_report_access to service_role;

create table public.partner_report_attempts (
  report_key text not null references public.partner_report_access(report_key),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (report_key, client_hash)
);
alter table public.partner_report_attempts enable row level security;
revoke all on public.partner_report_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.partner_report_attempts to service_role;
create index partner_report_attempts_window on public.partner_report_attempts(window_start);

-- Shared across edge instances; attempted logins consume the allowance even
-- when successful. Only a keyed IP hash is stored, never the IP or password.
create function public.consume_partner_report_attempt(p_report_key text, p_client_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; stamp timestamptz := clock_timestamp();
begin
  if p_report_key <> 'pr-digital' or p_client_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.partner_report_attempts where report_key = p_report_key and window_start < stamp - interval '1 day';
  insert into public.partner_report_attempts(report_key, client_hash, window_start, attempts)
  values(p_report_key, p_client_hash, stamp, 1)
  on conflict(report_key, client_hash) do update set
    attempts = case when partner_report_attempts.window_start <= stamp - interval '15 minutes' then 1 else least(partner_report_attempts.attempts + 1, 1000) end,
    window_start = case when partner_report_attempts.window_start <= stamp - interval '15 minutes' then stamp else partner_report_attempts.window_start end
  returning attempts into n;
  return n <= 12;
end;
$$;
revoke all on function public.consume_partner_report_attempt(text, text) from public, anon, authenticated;
grant execute on function public.consume_partner_report_attempt(text, text) to service_role;
commit;
