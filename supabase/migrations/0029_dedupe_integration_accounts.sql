-- ============================================================================
-- ClaimReach — 0029: clean up duplicate integration-account rows created by the
-- old insert-on-save behavior, keeping the most complete/recent row per scope.
-- After this, saving Integrations updates one row instead of stacking new ones.
-- ============================================================================

-- JustCall: keep the newest row per firm scope that has a sending number if any,
-- otherwise the newest row. Delete the rest.
with ranked as (
  select id, firm_id,
    row_number() over (
      partition by firm_id
      order by (justcall_number is not null) desc, created_at desc
    ) as rn
  from justcall_accounts
)
delete from justcall_accounts j
using ranked r
where j.id = r.id and r.rn > 1;

-- eSign: keep the newest row per firm scope that has an api_key if any.
with ranked as (
  select id, firm_id,
    row_number() over (
      partition by firm_id
      order by (api_key is not null and api_key <> '') desc, created_at desc
    ) as rn
  from esign_accounts
)
delete from esign_accounts e
using ranked r
where e.id = r.id and r.rn > 1;

-- Make sure all surviving rows are active.
update justcall_accounts set active = true where active is distinct from true;
update esign_accounts set active = true where active is distinct from true;
