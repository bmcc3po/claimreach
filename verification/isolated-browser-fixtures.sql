-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
-- Synthetic evidence only, no provider submission ID, document URL, key or outbound request.
begin;
insert into public.firms(id,slug,name) values('00000000-0000-4000-8000-000000000003','inno','SYNTHETIC Innovative Intake');
update public.app_users set firm_id='00000000-0000-4000-8000-000000000003' where id in ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000028');
update public.campaigns set esign_required=false where id='00000000-0000-4000-8000-000000000011';
insert into public.esign_submissions(id,firm_id,lead_id,claim_id,campaign_id,provider,signer_name,status,signed_at,completed_at,signed_notified_at,notify_state)
values('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','docuseal','SYNTHETIC TEST SIGNER','completed','2026-10-01','2026-10-01',now(),'sent');
commit;
