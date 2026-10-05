# Cloud firm-access review, October 5, 2026

Status: draft proposal and isolated role proof. No production DDL, firm accounts, packet deliveries or email links changed. PR136 remains application-layer protection only. The cloud refresh also requires active=true in the live status catalog, with download/upload/page regression tests for inactive release statuses.

## October 5 follow-up

The document endpoint previously retained legacy claim-null documents for a sole-matter firm file, conflicting with this proposal's exact-matter rule. Firm downloads now require an explicit matching claim ID on each document. Internal staff retain their existing sole-matter legacy review path, so they can review and correctly associate old files. The updated actual-route tests prove both behaviors (16 document tests and 9 firm-page tests pass; TypeScript passes). This is still a draft and does not repair production RLS by itself.

Navigation PR133 is now merged at `4496445fc37daacd12efdef46f4dbbf02e3a5dc9`; its production build passed with 220 Edge Function Routes. Preserve that navigation when refreshing this draft. Firm portal provisioning remains pending exact team email addresses and the complete isolation checks below.

## Fresh authoritative reads

Independent cloud clone of bmcc3po/claimreach default main: 9fb7010cfda5dd96da5ee45e4f9e56ca4a21f26f. AGENTS.md read before changes. Production Supabase project `gvtafevoisfxcfkugvoj` reached through the connected Supabase API. Metadata-only queries read pg_policies, column names/types, function names/grants, views/grants, and bucket visibility. No real client row was accessed to demonstrate the problem.

Claims and case_documents permissive firm policies still grant own-firm rows without checking release. leads_firm_read grants raw aggregate leads; answers/vendor fields can contain sibling matter data. lead-wide firm SELECT also exists for audit_log, call_schedule, communications, contact_points, firm_deliveries, lead_activity, lead_lor, lead_notes, lead_tags and status_events. claim_notes, claim_properties and notes also have own-firm reads. call_logs and case_documents have permissive firm ALL policies, so a final proposal must review write operations as well as SELECT.

All six inspected public views are security_invoker=true. automation_queue_due, drips_due and leads_purgeable are service-role-only. cr_mva_dial_summary is authenticated but checks is_internal. lead_contact_health and lead_contact_status are authenticated and depend on raw Motel 6 lead data. The three buckets case-docs, retainer-pdfs and signed-docs are private; no storage policies appeared in pg_policies. Privileged server URL issuance remains an independent application authorization boundary.

PR136's narrowed page still reads the raw leads table, as do portal lists/home/reports and the existing M6 pages. Restricting raw lead rows without replacing those consumers would break them. An approved sibling cannot safely authorize a raw aggregate row. Do not apply a partial lead wall to production.

## Concrete policy/projection prototype

`verification/fixtures/firm-release-candidate.sql` is TEST ONLY, not a migration. It uses an active auth.uid-bound app_users row, exact claim/lead/firm ownership, unarchived lead and the current active statuses.unlocks_firm catalog. No caller firm ID authorizes access. Unknown/inactive/missing status denies. Restrictive policies AND with existing permissive policies. Raw lead rows are denied to firm accounts; internal access still depends on its existing permissive policies. Claim-null documents are denied to firms, including on a multi-matter file.

The prototype demonstrates a fixed-column selected-matter projection. The privileged implementation resides in a nonexposed schema with fixed pg_catalog search_path and fully qualified references. The public RPC wrapper is SECURITY INVOKER. PUBLIC/anon execution is revoked. It returns identity/contact fields and only the selected released claim's answers, never lead.answers or vendor_fields. The private helper still requires the live active firm actor when called directly.

26 actual isolated PostgreSQL checks passed in `verification/firm-release-candidate-test.cjs`. They first reproduce broad same-firm pending-sibling/aggregate access with synthetic rows, then verify owner, agent, correct firm, other firm, inactive account, missing account, anonymous, released plus pending sibling, archive, unknown/inactive catalog, claim-null and mismatched document, fixed-column projection and revoked release. This is not a complete production policy test and does not test browser/provider behavior or concurrent policy revocation.

## Remaining before a deployable migration

1. Finish table/column lineage and grants for every exposed lead/claim surface, including indirect relationships, notes, call payloads, report cards, signing indexes, notifications, views and authenticated RPCs. Review PUBLIC-executable trigger functions separately; trigger-only signatures are not assumed to be data retrieval endpoints.
2. Replace firm raw-lead consumers with projected list/detail data. Scope client messages, export/PDF routes and storage issuance by the selected released matter. Review all `FirmCaseWorkbench` tabs and actions; the existing Export intake link is lead-only and does not preserve selected claim.
3. Keep M6 allowlist/provisioning/landing intact; existing 175 M6 source regressions pass on the refreshed PR136 tree, but do not prove compatibility with the proposed raw-lead wall. Build a dedicated M6 membership/projection role fixture and adapt its list/detail/health consumers before rollout. TMP membership alone must not expand Motel 6 access.
4. Extend restrictive boundaries to every sensitive row and write operation. Lead-wide or claim-null rows need a deliberate projected/reviewed path, not approved-sibling inheritance. Preserve internal pilot RLS, signed evidence and canonical statuses.
5. The next repository migration number observed is 0128 (0127 is latest). Recheck before writing the final append-only migration in RUN_THESE_MIGRATIONS.sql and its numbered standalone file. This prototype reserves no number and is not production DDL.
6. Run role fixtures on the complete migration and adapters, TypeScript, engines and Cloudflare build gate. Obtain review/authorization for that exact migration scope; do not execute it from this task.
7. After authorized application, use an actual controlled firm login for UI and direct permitted API denial checks, exact intake/signed packet downloads and expired URL refresh. Then identify Carol/team accounts explicitly and provision only those authorized people. Add an authenticated exact-matter email link only after this passes. No tokens/public URLs in email.

## Fresh application regression evidence

Against main plus PR136: TypeScript zero errors; 15 actual document route tests; 9 actual firm page tests; INNO MVA engine 69; intake-console engine 78; matter selection 9; seven-day delivery clock 2; M6 source regressions 175. Historical live rehearsals are not fresh cloud browser acceptance. No successful delivered test packet was resent.

## Sources

Current Supabase official RLS and database function documentation reviewed:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions

The changelog.md lookup was attempted but the search service rejected its Markdown content type. This draft does not rely on unverified new Supabase SDK features.
