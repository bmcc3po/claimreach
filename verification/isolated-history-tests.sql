-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
-- Run after the concurrent-save verification has left one history row.
begin;set local role service_role;
insert into public.lead_activity(firm_id,lead_id,kind,body,meta,created_at) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','note','Synthetic acceptance','{"event":"firm_file_review","claim_id":"00000000-0000-4000-8000-000000000040","campaign_id":"00000000-0000-4000-8000-000000000010","action":"accepted"}','2099-01-02');
do $test$ begin assert (select status='retained' and firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040');end $test$;
insert into public.lead_activity(firm_id,lead_id,kind,body,meta,created_at) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','note','Synthetic older decline','{"event":"firm_file_review","claim_id":"00000000-0000-4000-8000-000000000040","campaign_id":"00000000-0000-4000-8000-000000000010","action":"turned_down"}','2099-01-01');
do $test$ begin assert (select status='retained' from public.claims where id='00000000-0000-4000-8000-000000000040');end $test$;
insert into public.lead_activity(firm_id,lead_id,kind,body,meta,created_at) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000030','note','Synthetic later decline','{"event":"firm_file_review","claim_id":"00000000-0000-4000-8000-000000000040","campaign_id":"00000000-0000-4000-8000-000000000010","action":"turned_down"}','2099-01-03');
do $test$ begin assert (select status='firm_rejected' from public.claims where id='00000000-0000-4000-8000-000000000040');
assert (select count(*)=3 from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040');
end $test$;
update public.leads set archived_at=now() where id='00000000-0000-4000-8000-000000000030';
do $test$ declare v timestamptz;begin assert (select count(*)=3 from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040');
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting',null,null,'Synthetic archived test.',null);raise exception 'ASSERT archived save accepted';exception when others then if sqlerrm not like '%File unavailable%' then raise;end if;end;
end $test$;
rollback;select 'PASS: later decisions project, old decision ignored, unknown delivery date retained, archive preserves history and blocks edits' as result;
