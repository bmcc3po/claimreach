-- ============================================================================
-- 0071 CAMPAIGN NAMES READ LIKE NAMES
--
-- 0069 derived campaign names as slug + upper(case_type), which is right in
-- principle (the name is generated, never typed, so two setup scripts can never
-- again produce 'TMP MVA' and 'Turnbull Moak and Pendergrass PREM' for the same
-- kind of thing) but produced 'TMP MOTEL_TRAFFICKING'.
--
-- The registry already holds the human label for every case type. Use it.
--
-- Note on the shape: the registry lookup is a scalar subquery, not a join in the
-- FROM clause. In UPDATE ... FROM, a joined table cannot be matched against the
-- target table, which is what made the first version of this fail with
-- "invalid reference to FROM-clause entry for table c". A subquery can reference
-- the target, and it also leaves campaigns whose case_type has no registry row
-- intact instead of skipping them.
-- Idempotent.
-- ============================================================================
update campaigns c
   set name = upper(f.slug) || ' ' ||
              coalesce(
                (select r.label from case_type_registry r where r.key = c.case_type),
                initcap(replace(c.case_type, '_', ' '))
              )
  from firms f
 where f.id = c.firm_id;

-- Verify.
select upper(f.slug) as firm, c.name, c.case_type, c.active
  from campaigns c join firms f on f.id = c.firm_id
 where c.active
 order by f.slug, c.case_type;
