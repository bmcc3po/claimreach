-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
begin;set local role service_role;do $t$ declare v timestamptz;begin
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000021','signed_grievous',null,null,'Synthetic QA propagation.',null);
assert (select qa_pending and not wip_pending from public.leads where id='00000000-0000-4000-8000-000000000030');
end $t$;rollback;
begin;set local role service_role;do $t$ declare v timestamptz;begin
select updated_at into v from public.claims where id='00000000-0000-4000-8000-000000000040';
perform public.cr_save_current_status('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010',v,'00000000-0000-4000-8000-000000000021','wip','decision','other','Synthetic WIP propagation.',null);
assert (select not qa_pending and wip_pending from public.leads where id='00000000-0000-4000-8000-000000000030');
end $t$;rollback;select 'PASS QA/WIP lead flags derive from saved claim statuses and seeded catalog' as result;
