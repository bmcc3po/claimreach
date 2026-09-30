-- Display wording only. Preserve the status key, workflow and custom labels.
begin;
update public.statuses set label='Signed: Finish intake'
where key='signed_grievous' and label='Signed: Grievous';
commit;
