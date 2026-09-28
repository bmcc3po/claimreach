-- ============================================================================
-- 0104 — Credentials boundary (Astra round 4, Sep 28 2026).
--
-- The four integration tables carried provider secrets behind is_internal()
-- ALL policies, so ANY active internal login — an agent — could read and
-- rewrite API keys and webhook secrets through the Data API. The admin
-- screens are owner/admin, but the DATABASE was not. These tables now answer
-- only to a user manager (owner/admin, or an explicit users.manage override),
-- through the same active-aware definer helper the app_users guard uses.
-- The server (service role) is unaffected.
--
-- Also: enroll_drips_for_lead ran as SECURITY DEFINER and was executable by
-- any authenticated user with no ownership validation. Only the server may
-- call it now.
-- ============================================================================

drop policy if exists api_keys_internal on public.api_keys;
create policy api_keys_admin on public.api_keys
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists webhook_ep_internal on public.webhook_endpoints;
create policy webhook_ep_admin on public.webhook_endpoints
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists jc_internal on public.justcall_accounts;
create policy jc_admin on public.justcall_accounts
  for all using (public.can_manage_users()) with check (public.can_manage_users());

drop policy if exists esign_acct_internal on public.esign_accounts;
create policy esign_acct_admin on public.esign_accounts
  for all using (public.can_manage_users()) with check (public.can_manage_users());

revoke execute on function public.enroll_drips_for_lead(uuid, uuid) from anon, authenticated;

-- ============================================================================
-- STATUS: APPLIED to the live database on Sep 28 2026 and probe-verified with
-- impersonated JWTs (rolled back): an active agent reads zero rows from all
-- four tables; the owner still reads them. Record only, nothing to run.
-- ============================================================================
