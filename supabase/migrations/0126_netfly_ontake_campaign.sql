-- Separate TMP secondary-intake campaign. Its workflow lives under /app/netfly;
-- it never creates a routine e-sign submission or outbound drip.
begin;
do $$
declare tmp_id uuid; existing_count integer;
begin
  select id into tmp_id from public.firms where slug='tmp';
  if tmp_id is null then raise exception 'TMP firm missing; NETFLY not activated'; end if;
  select count(*) into existing_count from public.campaigns where firm_id=tmp_id and name='NETFLY ONTAKE';
  if existing_count > 1 then raise exception 'Ambiguous NETFLY campaign'; end if;
  if existing_count = 0 then
    insert into public.campaigns (name, firm_id, case_type, intake_template, active,
      esign_required, allow_live_sign, firm_delivery_on, attach_intake_pdf,
      attach_intake_csv, attach_retainer, attach_certificate, retainer_packet)
    values ('NETFLY ONTAKE', tmp_id, 'mva', 'netfly_secondary', true,
      false, false, false, true, false, true, false, '[]'::jsonb);
  else
    if not exists(select 1 from public.campaigns where firm_id=tmp_id and name='NETFLY ONTAKE'
      and case_type='mva' and esign_required=false and allow_live_sign=false) then
      raise exception 'Existing NETFLY campaign is not the isolated secondary-intake configuration';
    end if;
  end if;
end $$;
commit;
