-- Only internal INNO intake staff may reserve an exceptional corrected
-- DocuSeal packet on the exact TMP NETFLY ONTAKE campaign. Routine NETFLY
-- intake still has no required e-sign. The trusted route must verify the
-- original signed PDF, correction reason, recipient, and contract choice.
begin;
create or replace function public.cr_esign_attempt_scope(p_actor_id uuid,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.claims%rowtype; l public.leads%rowtype; u public.app_users%rowtype;
begin
  select * into u from public.app_users where id=p_actor_id;
  if not found or u.active is distinct from true or u.role not in ('owner','admin','manager','agent','qa') then
    raise exception 'An active intake user is required.' using errcode='42501';
  end if;
  select * into c from public.claims where id=p_claim_id;
  if not found then raise exception 'Signing matter is unavailable.'; end if;
  select * into l from public.leads where id=c.lead_id;
  if not found or l.archived_at is not null or c.firm_id is distinct from l.firm_id or c.campaign_id is null
    or not exists(select 1 from public.campaigns where id=c.campaign_id and firm_id=c.firm_id and active) then
    raise exception 'Signing matter scope changed. Refresh before sending.';
  end if;
  if u.role<>'owner' and not (
    (c.campaign_id=public.cr_inno_mva_campaign_id()
      and c.firm_id=public.cr_inno_mva_firm_id() and c.claim_type='mva')
    or (c.claim_type='mva' and u.firm_id=public.cr_inno_mva_firm_id()
      and exists (
        select 1 from public.campaigns nf join public.firms f on f.id=nf.firm_id
        where nf.id=c.campaign_id and nf.firm_id=c.firm_id and nf.active
          and nf.name='NETFLY ONTAKE' and nf.path='secondary'
          and nf.esign_required=false and f.slug='tmp'
      ))
  ) then
    raise exception 'This signing matter is outside the intake pilot.' using errcode='42501';
  end if;
  return jsonb_build_object('lead_id',l.id,'claim_id',c.id,'firm_id',c.firm_id,'campaign_id',c.campaign_id,'external_id',l.external_id,'status',c.status);
end $$;
commit;
