-- Email retries must never create a second NETFLY matter or signed original.
-- No existing lead or document data is changed.
begin;
create unique index if not exists uq_leads_netfly_email_source
  on public.leads(firm_id, campaign_id, external_id)
  where external_id like 'netfly-email:%';
create unique index if not exists uq_claims_netfly_email_matter
  on public.claims(lead_id, campaign_id)
  where campaign = 'NETFLY ONTAKE'
    and (answers #>> '{netfly_secondary,handoffs,0,channel}') = 'email';
create unique index if not exists uq_case_docs_netfly_email_path
  on public.case_documents(storage_path)
  where doc_type = 'netfly_signed_retainer' and storage_path like '%/netfly-email-%';
create unique index if not exists uq_audit_netfly_email_source
  on public.audit_log(firm_id, lead_id, claim_id, (meta->>'source_id'))
  where description = 'NETFLY signed transfer imported from email; review required'
    and meta->>'source_id' like 'netfly-email:%';
commit;
