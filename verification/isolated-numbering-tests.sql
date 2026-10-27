-- TEST ONLY: qcrvjwwbtqbyrbiolfkf. Never run on production.
begin;set local role service_role;
do $test$ declare a jsonb;b jsonb;before_seq bigint;after_seq bigint;begin
select last_value into before_seq from public.netfly_lead_seq;
a:=public.cr_preview_netfly_numbers('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');b:=public.cr_preview_netfly_numbers('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');
select last_value into after_seq from public.netfly_lead_seq;assert a=b and before_seq=after_seq,'preview mutated sequence';
assert a->>'count'='0';
begin perform public.cr_preview_netfly_numbers('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011');raise exception 'ASSERT wrong scope accepted';exception when others then if sqlerrm not like '%Invalid NETFLY scope%' then raise;end if;end;
end $test$;
insert into public.leads(firm_id,campaign_id,lead_no,case_type,claimant_name) select '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','SYNTHETIC-BATCH-'||n,'mva','SYNTHETIC NUMBER TEST' from generate_series(1,20) n;
do $test$ begin assert (select count(distinct lead_no)=20 from public.leads where claimant_name='SYNTHETIC NUMBER TEST');
assert (select bool_and(lead_no like 'NF-TMP%' and cardinality(lead_no_aliases)=1) from public.leads where claimant_name='SYNTHETIC NUMBER TEST');
end $test$;
update public.leads set lead_no='SYNTHETIC-RENAMED' where id='00000000-0000-4000-8000-000000000032';
update public.leads set lead_no_aliases='{}' where id='00000000-0000-4000-8000-000000000032';
do $test$ declare a jsonb;b jsonb;begin
assert (select 'NF-TMP1001'=any(lead_no_aliases) and 'SYNTHETIC-32'=any(lead_no_aliases) from public.leads where id='00000000-0000-4000-8000-000000000032');
a:=public.cr_preview_netfly_numbers('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');assert a->>'count'='1';
update public.leads set archived_at=now() where id='00000000-0000-4000-8000-000000000032';
b:=public.cr_preview_netfly_numbers('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');assert b->>'count'='1';assert (b->'mapping'->0->>'archived')::boolean;
end $test$;
rollback;select 'PASS: 20 unique hosted allocations, aliases retained, exact tenant scope, read-only preview includes archived rows' as result;
