-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
begin;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000021","role":"authenticated"}',true);
do $test$ declare n int;begin
update public.claims set status='contacting' where id='00000000-0000-4000-8000-000000000041';get diagnostics n=row_count;assert n=0,'cross-firm update allowed';
begin perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',null,'00000000-0000-4000-8000-000000000021','contacting',null,null,'Synthetic denied RPC.',null);
raise exception 'ASSERT authenticated RPC allowed';exception when insufficient_privilege then null;end;
begin perform count(*) from public.claim_status_history;raise exception 'ASSERT private history readable';exception when insufficient_privilege then null;end;
end $test$;rollback;select 'PASS actual authenticated RPC/history denial and cross-firm zero-row update' as result;
