-- The final INNO MVA handoff carries the same intake Q&A in its body, PDF
-- and CSV. Keep the existing manual/automatic delivery switch unchanged.
begin;

update public.campaigns
set attach_intake_pdf = true, attach_intake_csv = true
where id = public.cr_inno_mva_campaign_id()
  and firm_id = public.cr_inno_mva_firm_id();

commit;
