-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','new','decision','other','Synthetic test status change.',null);
assert r->>'status'='new';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','new','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status new, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting','decision','other','Synthetic test status change.',null);
assert r->>'status'='contacting';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status contacting, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','scheduled_callback','decision','other','Synthetic test status change.','2099-01-01'::timestamptz);
assert r->>'status'='scheduled_callback';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status scheduled_callback, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','esign_sent','decision','other','Synthetic test status change.',null);
assert r->>'status'='esign_sent';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','esign_sent','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status esign_sent, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','signed_grievous','decision','other','Synthetic test status change.',null);
assert r->>'status'='signed_grievous';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','signed_grievous','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status signed_grievous, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','delivered','decision','other','Synthetic test status change.',null);
assert r->>'status'='delivered';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','delivered','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status delivered, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','retained','decision','other','Synthetic test status change.',null);
assert r->>'status'='retained';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','retained','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status retained, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','firm_rejected','decision','other','Synthetic test status change.',null);
assert r->>'status'='firm_rejected';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','firm_rejected','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status firm_rejected, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','bmc_rejected','decision','other','Synthetic test status change.',null);
assert r->>'status'='bmc_rejected';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','bmc_rejected','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status bmc_rejected, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','dq','decision','other','Synthetic test status change.',null);
assert r->>'status'='dq';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','dq','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status dq, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','dnc','decision','other','Synthetic test status change.',null);
assert r->>'status'='dnc';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','dnc','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';
assert (select not perm_call and not perm_text and not perm_email from public.leads where id='00000000-0000-4000-8000-000000000030');assert (select status='opted_out' from public.contact_points where lead_id='00000000-0000-4000-8000-000000000030');
end $test$;select 'PASS status dnc, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','wip','decision','other','Synthetic test status change.',null);
assert r->>'status'='wip';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','wip','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status wip, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz; r jsonb; n int; baseline int;begin
select count(*) into baseline from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040';
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','flag','decision','other','Synthetic test status change.',null);
assert r->>'status'='flag';assert (r->>'updated_at')::timestamptz is distinct from v;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','flag','decision','other','Synthetic test status change.',null);raise exception 'ASSERT stale save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;
select count(*) into n from public.claim_status_history where claim_id='00000000-0000-4000-8000-000000000040'; assert n=baseline+1,'one history record per save';
assert (select firm_sent_at is null from public.claims where id='00000000-0000-4000-8000-000000000040'),'unknown delivery date changed';

end $test$;select 'PASS status flag, stale rejection, atomic history' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz;begin select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000023','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Status permission denied%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000024','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Status permission denied%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000022','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Status permission denied%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000021','bmc_rejected','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%BMC permission denied%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting','decision','other','',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%One-sentence note required%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','scheduled_callback','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Callback date required%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','dq',null,'other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Reason required%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','unknown','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%Unmapped status%' then raise;end if;end;
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000020','contacting','decision','other','Synthetic test status change.',null);raise exception 'ASSERT invalid save accepted';exception when others then if sqlerrm not like '%stale claim%' then raise;end if;end;end $test$;select 'PASS denied actors, missing note/reason/callback, unknown status, wrong firm' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz;r jsonb;begin select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000021','contacting','decision','other','Synthetic test status change.',null);assert r->>'status'='contacting';end $test$;select 'PASS actor 21' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz;r jsonb;begin select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000025','contacting','decision','other','Synthetic test status change.',null);assert r->>'status'='contacting';end $test$;select 'PASS actor 25' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz;r jsonb;begin select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000026','contacting','decision','other','Synthetic test status change.',null);assert r->>'status'='contacting';end $test$;select 'PASS actor 26' as result;rollback;
begin;set local role service_role;do $test$ declare v timestamptz;r jsonb;begin select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';r:=public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000027','contacting','decision','other','Synthetic test status change.',null);assert r->>'status'='contacting';end $test$;select 'PASS actor 27' as result;rollback;
