-- ============================================================================
-- ClaimReach SANDBOX seed  —  demo data for Zach Peagler's evaluation instance
-- ----------------------------------------------------------------------------
-- Run this ONCE, in the Supabase SQL editor of the NEW/ISOLATED sandbox project,
-- AFTER all migrations (0001–0066) have been applied. It is idempotent: every
-- insert is guarded, so re-running it does nothing the second time.
--
-- It seeds, all under the existing "tmp" firm (Turnbull Moak & Pendergrass,
-- created by migration 0001):
--   • 3 campaigns  (Auto / Premises / Referral) so the console can OPEN files
--   • a retainer on each screening campaign so live-sign shows up
--   • ~12 demo leads + claims spread across intake → prelit → lit → settle → DQ
--   • a few intake_call rows so the calls view isn't empty
--
-- NOTHING here is real client data. All names, phones (702-555-01xx) and emails
-- (@example.com) are fictional.
--
-- Zach's OWNER login is created separately — see the bottom of this file
-- (STEP 2) and the runbook. Demo leads intentionally have no assigned agent, so
-- no auth user is required to seed them.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- CAMPAIGNS
-- The console refuses to open a file with no active campaign for the firm+type,
-- so these three unlock: MVA, Premises, and the catch-all Referral bucket that
-- the brief case types (employment/family/criminal/contract/other) route to.
insert into campaigns (firm_id, name, case_type, active, allow_live_sign, retainer_packet)
select f.id, v.name, v.case_type, true, v.live, '[]'::jsonb
from firms f
join (values
  ('TMP — Auto Accident',            'mva',      true),
  ('TMP — Premises / Slip & Fall',   'prem',     true),
  ('TMP — Referral Network',         'referral', false)
) as v(name, case_type, live) on true
where f.slug = 'tmp'
  and not exists (
    select 1 from campaigns c where c.firm_id = f.id and c.case_type = v.case_type
  );

-- A single retainer per screening campaign so "send retainer" is offerable in
-- the demo. template_id is a placeholder uuid (the column has no FK); actually
-- sending an e-sign packet needs SignWell keys, which the demo can skip.
insert into campaign_retainers (campaign_id, label, kind, template_id, is_default, active, sort)
select c.id, 'TMP Any-Claim Retainer', 'text', gen_random_uuid(), true, true, 0
from campaigns c
join firms f on f.id = c.firm_id and f.slug = 'tmp'
where c.case_type in ('mva','prem')
  and not exists (select 1 from campaign_retainers r where r.campaign_id = c.id);

-- ---------------------------------------------------------------- DEMO LEADS
-- Staged in a temp table, then fanned out into leads + claims so each demo file
-- gets both a lead row (identity + pipeline stage) and a claim row (status +
-- the guided answers). status and stage are set independently on purpose —
-- there is no status→stage mapping in the schema, and lit/settle exist only as
-- pipeline stages (there is no "settled" status key), so those are driven by
-- leads.stage while the claim stays "retained".
create temp table _demo (
  lead_no        text,
  case_type      text,
  stage          pipeline_stage,
  campaign_name  text,
  first_name     text,
  last_name      text,
  phone          text,
  email          text,
  claim_status   text,
  qualification  text,
  dq_reason_key  text,
  case_summary   text,
  answers        jsonb
) on commit drop;

insert into _demo values
-- (a) INTAKE — just opened, barely any answers yet
('TMP-9001','mva','intake_in_progress','TMP — Auto Accident','Dana','Carter','(702) 555-0101','dana.carter@example.com',
 'new','pending',null,'Auto accident. Dana. Just opened, still gathering the story.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"online","what_happened":"Rear-ended on Sahara, gathering details."}'::jsonb),

-- (a) INTAKE — mid-questionnaire, resume-able (exercises new questions partway)
('TMP-9002','mva','intake_in_progress','TMP — Auto Accident','Miguel','Torres','(702) 555-0102','miguel.torres@example.com',
 'contacting','pending',null,'Auto accident. Miguel. Mid-intake — resume from insurance questions.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"ref_friend","referral_source":"Coworker, Alan Reese","what_happened":"T-boned at an uncontrolled intersection.","collision_type":"side","agent_read":"yes","date":"2026-07-02","incident_time":"08:15","incident_city_state":"Henderson, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"still","treatment_followup":"yes","injuries":["neck_back","whiplash"],"surgery":"no","hosp":"no","fault":"other","police_report":"yes","police_agency":"Henderson Police Department","police_report_number":"HPD-2026-3312","citations":"other","commercial":"no","settled":"no","bills":"under_10k"}'::jsonb),

-- (b) PRELIT — qualified, QA verified, about to hand to the firm
('TMP-9003','mva','qa_verified','TMP — Auto Accident','Priya','Shah','(702) 555-0103','priya.shah@example.com',
 'approved','clear',null,'Auto accident. Priya. Qualified, QA verified, queued for firm delivery.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"ai","what_happened":"Rear-ended on the 215 during slow traffic.","collision_type":"rear_end","agent_read":"yes","date":"2026-06-20","incident_time":"16:45","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"still","treatment_followup":"yes","injuries":["neck_back"],"surgery":"no","hosp":"no","fault":"other","police_report":"yes","police_agency":"Nevada Highway Patrol","police_report_number":"NHP-2026-90021","citations":"other","commercial":"no","settled":"no","bills":"10k_50k","ins_other":"yes","ins_own":"yes","auto_policy_id":"PROG-55120","ins_uim":"yes","others_in_vehicle":"no","ins_forms":"no","case_manager_notes":"Clean liability, treating, UIM confirmed. Good file."}'::jsonb),

-- (b) PRELIT — delivered to the firm
('TMP-9004','mva','sent_to_firm','TMP — Auto Accident','Marcus','Webb','(702) 555-0104','marcus.webb@example.com',
 'delivered','clear',null,'Auto accident. Marcus. Delivered to the firm, awaiting retention.',
 '{"authority":"self","role":"passenger","attorney":"no","how_found_us":"ref_attorney","referral_source":"Referring atty: Lena Ortiz, Ortiz Law","what_happened":"Passenger in a rideshare that was hit head-on.","collision_type":"head_on","agent_read":"yes","date":"2026-06-05","incident_time":"22:10","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"finished","treatment_followup":"yes","willing_more":"yes","injuries":["broken","lig_tear"],"surgery":"no","hosp":"short","fault":"other","police_report":"yes","police_agency":"Las Vegas Metro PD","police_report_number":"LV-2026-51190","citations":"other","commercial":"yes","settled":"no","bills":"over_50k","ins_other":"yes","ins_own":"no","ins_uim":"unsure","others_in_vehicle":"yes","others_names":"Driver (rideshare)","others_injured":"no","ins_forms":"yes","ins_forms_signed":"no","case_manager_notes":"Commercial/rideshare policy, hospitalized, serious injuries. Elevated value."}'::jsonb),

-- (c) SIGNED / RETAINED — signed on the call, firm retained
('TMP-9005','mva','signed_retained','TMP — Auto Accident','Alicia','Nguyen','(702) 555-0105','alicia.nguyen@example.com',
 'retained','clear',null,'Auto accident. Alicia. Signed and retained.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"ref_marketing","referral_source":"Billboard — I-15 campaign","what_happened":"Rear-ended at a red light on Charleston.","collision_type":"rear_end","agent_read":"yes","date":"2026-06-28","incident_time":"12:30","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"still","treatment_followup":"yes","injuries":["neck_back","whiplash"],"surgery":"no","hosp":"no","fault":"other","police_report":"yes","police_agency":"Las Vegas Metro PD","police_report_number":"LV-2026-52233","citations":"other","commercial":"no","settled":"no","bills":"10k_50k","ins_other":"yes","ins_own":"yes","auto_policy_id":"GEICO-88213","ins_uim":"unsure","others_in_vehicle":"yes","others_names":"Maria Nguyen (spouse)","others_injured":"yes","others_injured_contact":"Maria Nguyen (702) 555-0140","others_need_help":"yes","ins_forms":"yes","ins_forms_signed":"no","case_manager_notes":"Spouse also injured and wants representation — open a second file."}'::jsonb),

-- (c) SIGNED / RETAINED — premises
('TMP-9006','prem','signed_retained','TMP — Premises / Slip & Fall','Robert','Ellis','(702) 555-0106','robert.ellis@example.com',
 'retained','clear',null,'Premises. Robert. Grocery slip-and-fall, signed and retained.',
 '{"presence":"yes","what_happened":"Slipped on an unmarked wet floor in a grocery aisle.","agent_read":"yes","date":"2026-06-12","incident_time":"18:00","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"still","injuries":["broken"],"surgery":"yes","bills":"over_50k","case_manager_notes":"Fractured wrist, surgery scheduled, incident report filed with the store."}'::jsonb),

-- (d) LITIGATION — retained, now in suit (driven by stage; status stays retained)
('TMP-9007','mva','in_litigation','TMP — Auto Accident','Sandra','Kim','(702) 555-0107','sandra.kim@example.com',
 'retained','clear',null,'Auto accident. Sandra. In litigation — complaint filed.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"return","what_happened":"Multi-vehicle pileup on the freeway.","collision_type":"multi","agent_read":"yes","date":"2026-01-18","incident_time":"07:45","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"finished","treatment_followup":"yes","willing_more":"yes","injuries":["head","lig_tear"],"surgery":"yes","hosp":"long","fault":"other","police_report":"yes","police_agency":"Nevada Highway Patrol","police_report_number":"NHP-2026-11002","citations":"other","commercial":"yes","settled":"no","bills":"over_50k","ins_other":"yes","ins_own":"yes","auto_policy_id":"ALLST-33019","ins_uim":"yes","others_in_vehicle":"no","ins_forms":"yes","ins_forms_signed":"yes","ins_forms_said":"Adjuster asked for a recorded statement and a medical authorization.","case_manager_notes":"TBI + surgery, commercial defendant, signed insurer forms BEFORE us — flag for the litigation team."}'::jsonb),

-- (e) SETTLED / CLOSED — retained, matter closed (stage=closed)
('TMP-9008','mva','closed','TMP — Auto Accident','Derek','Foster','(702) 555-0108','derek.foster@example.com',
 'retained','clear',null,'Auto accident. Derek. Settled and closed.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"ref_friend","referral_source":"Friend — prior client","what_happened":"Side-swiped changing lanes on Flamingo.","collision_type":"side","agent_read":"yes","date":"2025-11-02","incident_time":"14:20","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"no","treatment":"finished","treatment_followup":"no","willing_more":"no","injuries":["neck_back"],"surgery":"no","hosp":"no","fault":"other","police_report":"yes","police_agency":"Las Vegas Metro PD","police_report_number":"LV-2025-88771","citations":"other","commercial":"no","settled":"no","bills":"10k_50k","ins_other":"yes","ins_own":"yes","auto_policy_id":"STFRM-77213","ins_uim":"no","others_in_vehicle":"no","ins_forms":"no","case_manager_notes":"Resolved pre-suit. Closed."}'::jsonb),

-- DQ — already represented (terminal)
('TMP-9009','mva','declined','TMP — Auto Accident','Tanya','Brooks','(702) 555-0109','tanya.brooks@example.com',
 'dq','dq','already_rep','Auto accident. Tanya. Disqualified — already has an attorney.',
 '{"authority":"self","role":"driver","attorney":"yes","how_found_us":"online","case_manager_notes":"Already represented for this accident. Wished her well."}'::jsonb),

-- DQ — no injury (terminal, live-callback close)
('TMP-9010','mva','declined','TMP — Auto Accident','Owen','Pratt','(702) 555-0110','owen.pratt@example.com',
 'dq','dq','criteria','Auto accident. Owen. No injury reported — logged as a late-onset callback.',
 '{"authority":"self","role":"driver","attorney":"no","how_found_us":"online","what_happened":"Low-speed tap in a parking lot.","collision_type":"rear_end","agent_read":"no","date":"2026-07-08","incident_time":"11:00","incident_city_state":"Reno, NV","injured":"no","symptoms_ongoing":"no","fault":"other","police_report":"no","citations":"none","commercial":"no","settled":"no","ins_other":"yes","ins_own":"yes","ins_uim":"no","others_in_vehicle":"no","ins_forms":"no","case_manager_notes":"No injury. Told him to call back if neck/back pain shows up."}'::jsonb),

-- REFERRAL — family matter routed to the network (brief capture)
('TMP-9011','referral','sent_to_firm','TMP — Referral Network','Grace','Holloway','(702) 555-0111','grace.holloway@example.com',
 'delivered','clear',null,'Referral. Grace. Family-law matter routed to the network.',
 '{"what_happened":"Needs help with a custody modification.","state":"NV","incident_date":"2026-05-01","represented":"no","case_manager_notes":"Custody modification, other side has counsel. Routed to family-law network."}'::jsonb),

-- PRELIT — premises, qualified
('TMP-9012','prem','qa_verified','TMP — Premises / Slip & Fall','Hector','Ramos','(702) 555-0112','hector.ramos@example.com',
 'approved','clear',null,'Premises. Hector. Stairwell fall, qualified.',
 '{"presence":"yes","what_happened":"Fell on a broken stair with no handrail at an apartment complex.","agent_read":"yes","date":"2026-06-25","incident_time":"20:30","incident_city_state":"Las Vegas, NV","injured":"yes","symptoms_ongoing":"yes","treatment":"still","injuries":["broken","head"],"surgery":"no","bills":"10k_50k","case_manager_notes":"Code violation angle — no handrail. Photos available."}'::jsonb);

-- Fan out: leads first (identity + stage + campaign link), then claims.
insert into leads (firm_id, lead_no, case_type, stage, campaign_id, campaign,
                   first_name, last_name, claimant_name, phone, email, origin)
select f.id, d.lead_no, d.case_type, d.stage, c.id, d.campaign_name,
       d.first_name, d.last_name, trim(d.first_name || ' ' || d.last_name), d.phone, d.email, 'console'
from _demo d
join firms f on f.slug = 'tmp'
left join campaigns c on c.firm_id = f.id and c.name = d.campaign_name
where not exists (select 1 from leads l where l.firm_id = f.id and l.lead_no = d.lead_no);

insert into claims (firm_id, lead_id, claim_type, campaign, campaign_id,
                    status, qualification, dq_reason_key, case_summary, answers)
select f.id, l.id, d.case_type, d.campaign_name, c.id,
       d.claim_status, d.qualification, d.dq_reason_key, d.case_summary, coalesce(d.answers, '{}'::jsonb)
from _demo d
join firms f on f.slug = 'tmp'
join leads l on l.firm_id = f.id and l.lead_no = d.lead_no
left join campaigns c on c.firm_id = f.id and c.name = d.campaign_name
where not exists (select 1 from claims cl where cl.lead_id = l.id);

-- A few call rows so the calls/queue views aren't empty.
insert into intake_calls (firm_id, lead_id, agent_name, caller_id, first_name, callback,
                          call_type, matter, disposition, reason, summary, promoted_at)
select f.id, l.id, 'Demo Agent', d.phone, d.first_name, d.phone,
       'new_potential',
       case when d.case_type='mva' then 'auto' when d.case_type='prem' then 'gpi' else 'other' end,
       case d.claim_status
         when 'dq' then 'DISQUALIFY'
         when 'retained' then 'SIGN'
         when 'delivered' then 'REFER'
         when 'approved' then 'REFER'
         else 'CALLBACK' end,
       d.case_summary, d.case_summary, now()
from _demo d
join firms f on f.slug = 'tmp'
join leads l on l.firm_id = f.id and l.lead_no = d.lead_no
where d.lead_no in ('TMP-9003','TMP-9005','TMP-9007','TMP-9009','TMP-9011')
  and not exists (select 1 from intake_calls ic where ic.lead_id = l.id);

commit;

-- Quick check (optional): how many demo files landed, by stage.
-- select stage, count(*) from leads where lead_no like 'TMP-9%' group by stage order by 1;


-- ============================================================================
-- STEP 2 — Zach's OWNER login   (run AFTER creating his Supabase Auth user)
-- ----------------------------------------------------------------------------
-- Create the auth user first (Dashboard → Authentication → Users → Add user;
-- set a password and mark "Auto Confirm"). Then edit the email below to match
-- EXACTLY and run this block. It links that auth user to an internal OWNER
-- app_users row (full cross-instance access), and is safe to re-run.
--
--   Owner is an INTERNAL role, so Zach sees and can act on everything in this
--   sandbox — which is the whole point of the eval, and safe because every row
--   here is fake demo data.
-- ----------------------------------------------------------------------------
-- insert into app_users (id, firm_id, role, full_name, email, active)
-- select u.id, (select id from firms where slug = 'innovative-intake'),
--        'owner', 'Zach Peagler', u.email, true
-- from auth.users u
-- where lower(u.email) = lower('zach@REPLACE-ME.com')
-- on conflict (id) do update
--   set role = 'owner', active = true, full_name = excluded.full_name;
-- ============================================================================
