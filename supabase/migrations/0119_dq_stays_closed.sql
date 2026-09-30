-- 0119 DQ stays closed (apply after 0118).
-- Missing source reasons are data cleanup, never QA or a reason to call again.
-- Preserve the imported status key/reason history and all genuine sibling work.
begin;

update public.statuses
set label = 'DQ: reason missing', track = 'terminal', phase = 'terminal',
    tone = 'bad', qualify = 'disqualify', is_final = true,
    requires_esign = false, unlocks_firm = false, updated_at = now()
where key = 'external_dq_review';

update public.claims
set qualification = 'dq'
where status = 'external_dq_review'
  and qualification is distinct from 'dq';

with affected as (
  select l.id, l.firm_id
  from public.leads l
  where exists (
    select 1 from public.claims c
    where c.lead_id = l.id and c.firm_id = l.firm_id
      and c.status = 'external_dq_review'
  )
), flags as (
  select a.id,
    exists (
      select 1 from public.claims c join public.statuses s on s.key = c.status
      where c.lead_id = a.id and c.firm_id = a.firm_id
        and s.phase = 'in_qa' and s.qualify <> 'disqualify'
        and c.status not in ('wip', 'signed_wip')
    ) as qa_pending,
    exists (
      select 1 from public.claims c join public.statuses s on s.key = c.status
      where c.lead_id = a.id and c.firm_id = a.firm_id
        and s.phase = 'in_qa' and s.qualify <> 'disqualify'
        and c.status in ('wip', 'signed_wip')
    ) as wip_pending
  from affected a
)
update public.leads l
set qa_pending = f.qa_pending, wip_pending = f.wip_pending,
    qa_entered_at = case when f.qa_pending or f.wip_pending then l.qa_entered_at else null end
from flags f
where l.id = f.id;

commit;
