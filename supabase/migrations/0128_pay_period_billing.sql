-- 0128 Owner-only weekly billing/payroll. Append-only history; no money moves.
begin;
create table public.cr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  period_start date not null,
  period_end date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null default auth.uid() references public.app_users(id),
  snapshot jsonb not null,
  check (extract(isodow from period_start)=1 and period_end=period_start+6),
  check (jsonb_typeof(snapshot)='object'),
  unique(firm_id,period_start), unique(id,firm_id)
);
create table public.cr_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  claim_id uuid not null references public.claims(id),
  run_id uuid,
  period_start date not null check (extract(isodow from period_start)=1),
  kind text not null check (kind in ('billing','commission','firm_credit','clawback')),
  source_line_id uuid,
  data jsonb not null check (jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_users(id),
  check ((kind in ('billing','commission') and source_line_id is null) or (kind in ('firm_credit','clawback') and source_line_id is not null)),
  unique(id,firm_id,claim_id,campaign_id),
  foreign key(run_id,firm_id) references public.cr_payroll_runs(id,firm_id),
  foreign key(source_line_id,firm_id,claim_id,campaign_id) references public.cr_payroll_lines(id,firm_id,claim_id,campaign_id)
);
create unique index cr_payroll_once_positive on public.cr_payroll_lines(firm_id,claim_id,kind) where kind in ('billing','commission');
create unique index cr_payroll_once_reversal on public.cr_payroll_lines(source_line_id) where source_line_id is not null;
create index cr_payroll_line_firm_period on public.cr_payroll_lines(firm_id,period_start);
create index cr_payroll_line_run on public.cr_payroll_lines(run_id,firm_id);
create index cr_payroll_line_campaign on public.cr_payroll_lines(campaign_id);
create table public.cr_payroll_notes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id),
  campaign_id uuid not null references public.campaigns(id),
  claim_id uuid not null references public.claims(id),
  kind text not null check(kind in ('attorney_hold','attorney_release','signature_date','agent_credit','reconcile')),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.app_users(id)
);
create index cr_payroll_note_matter on public.cr_payroll_notes(firm_id,claim_id,created_at desc);
create index cr_payroll_note_campaign on public.cr_payroll_notes(campaign_id);

alter table public.cr_payroll_runs enable row level security;
alter table public.cr_payroll_lines enable row level security;
alter table public.cr_payroll_notes enable row level security;
revoke all on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes from public,anon,authenticated;
grant select,insert on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes to authenticated;
grant all on public.cr_payroll_runs,public.cr_payroll_lines,public.cr_payroll_notes to service_role;
create policy payroll_run_read on public.cr_payroll_runs for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_run_write on public.cr_payroll_runs for insert to authenticated with check ((select public.cr_is_owner()) and closed_by=(select auth.uid()));
create policy payroll_line_read on public.cr_payroll_lines for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_line_write on public.cr_payroll_lines for insert to authenticated with check (
  (select public.cr_is_owner()) and created_by=(select auth.uid()) and exists (
    select 1 from public.claims c where c.id=cr_payroll_lines.claim_id and c.firm_id=cr_payroll_lines.firm_id and c.campaign_id=cr_payroll_lines.campaign_id
  ));
create policy payroll_note_read on public.cr_payroll_notes for select to authenticated using ((select public.cr_is_owner()));
create policy payroll_note_write on public.cr_payroll_notes for insert to authenticated with check (
  (select public.cr_is_owner()) and created_by=(select auth.uid()) and exists (
    select 1 from public.claims c where c.id=cr_payroll_notes.claim_id and c.firm_id=cr_payroll_notes.firm_id and c.campaign_id=cr_payroll_notes.campaign_id
  ));

-- Authenticated invoker: RLS applies. One transaction closes all selected firms,
-- records both sides, and rejects repeat billing or repeat clawbacks atomically.
create function public.cr_close_payroll(p_runs jsonb,p_lines jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb; affected integer;
begin
  if not coalesce(public.cr_is_owner(),false) then raise exception 'Owner access required'; end if;
  if p_runs is null or p_lines is null or jsonb_typeof(p_runs)<>'array' or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_runs)=0 then raise exception 'Choose an open period'; end if;
  for r in select * from jsonb_array_elements(p_runs) loop
    perform pg_advisory_xact_lock(hashtextextended('payroll:'||(r->>'firm_id'),0));
    if (r->>'period_end')::date+3 > (now() at time zone 'America/Los_Angeles')::date then raise exception 'Close on or after Wednesday'; end if;
    if exists(select 1 from public.cr_payroll_runs where firm_id=(r->>'firm_id')::uuid and period_start >= (r->>'period_start')::date) then raise exception 'Period already closed or predates a closed payroll'; end if;
    if r->'snapshot'->>'start' <> r->>'period_start' or r->'snapshot'->>'end' <> r->>'period_end' then raise exception 'Snapshot period mismatch'; end if;
    insert into public.cr_payroll_runs(id,firm_id,period_start,period_end,snapshot)
      values((r->>'id')::uuid,(r->>'firm_id')::uuid,(r->>'period_start')::date,(r->>'period_end')::date,r->'snapshot');
  end loop;
  for r in select * from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from jsonb_array_elements(p_runs) run where run->>'id'=r->>'run_id' and run->>'firm_id'=r->>'firm_id' and run->>'period_start'=r->>'period_start') then raise exception 'Line is outside this payroll'; end if;
    if r->>'kind' in ('firm_credit','clawback') and not exists (
      select 1 from public.cr_payroll_lines source where source.id=(r->>'source_line_id')::uuid and source.firm_id=(r->>'firm_id')::uuid
        and source.claim_id=(r->>'claim_id')::uuid and source.campaign_id=(r->>'campaign_id')::uuid and source.period_start<(r->>'period_start')::date
        and source.kind=case r->>'kind' when 'firm_credit' then 'billing' else 'commission' end
    ) then raise exception 'Adjustment has no matching prior billing/payment'; end if;
    insert into public.cr_payroll_lines(firm_id,campaign_id,claim_id,run_id,period_start,kind,source_line_id,data)
      values((r->>'firm_id')::uuid,(r->>'campaign_id')::uuid,(r->>'claim_id')::uuid,(r->>'run_id')::uuid,(r->>'period_start')::date,r->>'kind',(r->>'source_line_id')::uuid,r->'data');
  end loop;
  affected:=jsonb_array_length(p_runs);
  return affected;
end $$;
revoke all on function public.cr_close_payroll(jsonb,jsonb) from public,anon;
grant execute on function public.cr_close_payroll(jsonb,jsonb) to authenticated;
commit;
