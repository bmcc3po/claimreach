-- ============================================================================
-- 0081 THE SIX WAYS A CALL ACTUALLY ENDS
--
-- Three of the six already had statuses: disqualified (dq, with a reason),
-- e-sign sent but not signed (esign_sent), and signed (the signed_ track).
-- Three did not exist at all, so agents had nowhere to record them and those
-- calls were being filed as something else:
--
--   transferred          qualified and live transferred to the firm
--   transfer_no_answer   qualified, transfer attempted, no answer after 2 tries
--   network_referred     referred out to the network (Lexamica)
--
-- Field choices worth stating, because they drive money and reporting:
--
-- `billable` is true on all three. Innovative did the intake work in every case,
-- and whether the firm picked up the phone is not the agent's doing.
--
-- `unlocks_firm` is true for the two transfers, so the intake packet follows the
-- caller to the firm. It is FALSE for network_referred: that case went to
-- Lexamica, and auto-mailing the firm a case they did not take would be noise
-- at best and confusing at worst.
--
-- transfer_no_answer is deliberately NOT final. The caller qualified and nobody
-- picked up, which is the most valuable file in the pile to chase, and marking
-- it final would drop it out of the work queue.
--
-- Idempotent. Uses the same upsert style as 0030 so re-running keeps any later
-- edits an owner made in Settings, Statuses.
-- ============================================================================

insert into statuses
  (key, label, track, phase, tone, side, qualify, requires_esign, billable, unlocks_firm, is_final, lawruler_group, sort, system_locked)
values
  ('transferred',        'Transferred to Firm',      'nosig', 'post_qa',  'good', 'firm',  'qualify',      false, true,  true,  false, 'Clients',        142, true),
  ('transfer_no_answer', 'Transfer, No Answer',      'nosig', 'post_qa',  'warn', 'agent', 'qualify',      false, true,  true,  false, 'Wanted/Chasing', 143, true),
  ('network_referred',   'Referred to Network',      'nosig', 'terminal', 'info', 'firm',  'qualify',      false, true,  false, true,  'Clients',        144, true)
on conflict (key) do update
  set label = excluded.label, track = excluded.track, phase = excluded.phase,
      tone = excluded.tone, side = excluded.side, qualify = excluded.qualify,
      billable = excluded.billable, unlocks_firm = excluded.unlocks_firm,
      is_final = excluded.is_final, lawruler_group = excluded.lawruler_group,
      sort = excluded.sort, active = true, updated_at = now();

-- ---------------------------------------------------------------- dq reasons
-- The agent picks these from a list, so the list has to cover the real reasons
-- a call dies or they will all land on "Other" and the pile tells you nothing.
insert into dq_reasons (key, label, category, sort) values
  ('no_injury',      'No injury',                 'Eligibility',    15),
  ('no_treatment',   'Never treated, unwilling',  'Medical',        25),
  ('at_fault',       'Caller at fault',           'Eligibility',    35),
  ('out_of_venue',   'Outside firm venue',        'Eligibility',    45),
  ('settled',        'Already settled or signed', 'Representation', 55),
  ('minor_damage',   'Damage only, no claim',     'Eligibility',    65),
  ('wrong_number',   'Wrong number',              'Contact',        75),
  ('language',       'Language barrier',          'Contact',        85)
on conflict (key) do update
  set label = excluded.label, category = excluded.category, active = true;

-- ---------------------------------------------------------------- verify
select key, label, qualify, billable, unlocks_firm, is_final
  from statuses
 where key in ('dq','esign_sent','signed_approved','transferred','transfer_no_answer','network_referred')
 order by sort;

select category, count(*) as reasons from dq_reasons where active group by category order by category;
