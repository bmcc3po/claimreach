// Generic legacy drips. Motel 6 has a separate walker. This is not the INNO
// minute-by-minute call cadence. SMS/email stay held until durable sending is wired.
export type DueDrip = Record<string, any> & { enrollment_id: string; lead_id: string; firm_id: string; next_due: string };
export type DripHold = { lead_id: string; reason: string };
export type DueDripPage = { rows: DueDrip[]; limit: number; truncated: boolean };

/** Read the caller's base tables through RLS. drips_due is deliberately service-only. */
export async function loadDueDripPage(db: any, limit = 200, now = new Date(), channel?: "call_reminder"): Promise<DueDripPage> {
  let ruleQuery = db.from("drip_rules").select("*").is("campaign", null).eq("active", true);
  // Unconfigured SMS/email must not occupy every slot ahead of runnable reminders.
  if (channel) ruleQuery = ruleQuery.eq("channel", channel);
  const rules = await ruleQuery.limit(1000);
  if (rules.error || !Array.isArray(rules.data) || rules.data.length >= 1000) throw new Error("Could not verify drip rules.");
  if (!rules.data.length) return { rows: [], limit, truncated: false };
  const enrollments = await db.from("drip_enrollments").select("*")
    .in("rule_id", rules.data.map((r: any) => r.id)).eq("active", true)
    .lte("next_due", now.toISOString().slice(0, 10)).order("next_due").order("id").limit(limit + 1);
  if (enrollments.error || !Array.isArray(enrollments.data)) throw new Error("Could not load due drips.");
  if (!enrollments.data.length) return { rows: [], limit, truncated: false };
  const truncated = enrollments.data.length > limit;
  const candidates = enrollments.data.slice(0, limit);
  const leads = await db.from("leads").select("id, firm_id, claimant_name, phone, email")
    .in("id", [...new Set(candidates.map((e: any) => e.lead_id))]);
  if (leads.error || !Array.isArray(leads.data)) throw new Error("Could not verify the files due for follow-up.");
  const rows = candidates.flatMap((e: any) => {
    const rule = rules.data.find((r: any) => r.id === e.rule_id);
    const lead = leads.data.find((l: any) => l.id === e.lead_id && l.firm_id === e.firm_id);
    // Do not reveal a service result for a file the caller cannot see.
    if (!lead || !rule) return [];
    return [{ ...rule, ...lead, enrollment_id: e.id, lead_id: lead.id, firm_id: lead.firm_id, rule_id: rule.id, next_due: e.next_due }];
  });
  return { rows, limit, truncated };
}

export async function loadDueDrips(db: any, limit = 200, now = new Date(), channel?: "call_reminder"): Promise<DueDrip[]> {
  return (await loadDueDripPage(db, limit, now, channel)).rows;
}

export async function inspectDueDrip(admin: any, row: DueDrip): Promise<{ allowed: boolean; reason: string; claim_id?: string }> {
  const result = await admin.rpc("cr_check_drip_enrollment", { p_enrollment: row.enrollment_id, p_expected_due: row.next_due });
  if (result.error || !result.data || typeof result.data.allowed !== "boolean") throw new Error("Could not verify drip eligibility. Nothing was dispatched.");
  return result.data;
}

export async function processDueDrips(admin: any, due: DueDrip[]) {
  let fired = 0;
  const held: DripHold[] = [];
  const errors: DripHold[] = [];
  for (const row of due) {
    try {
      const checked = await inspectDueDrip(admin, row);
      if (!checked.allowed) { held.push({ lead_id: row.lead_id, reason: checked.reason }); continue; }
      if (row.channel !== "call_reminder") {
        held.push({ lead_id: row.lead_id, reason: `${row.channel} delivery is not configured for scheduled drips.` });
        continue;
      }
      // One transaction rechecks current eligibility, locks the enrollment,
      // inserts its matter-scoped note and advances the date. A timeout may
      // have committed; retrying the old expected due date cannot repeat it.
      const result = await admin.rpc("cr_fire_drip_reminder", { p_enrollment: row.enrollment_id, p_expected_due: row.next_due });
      if (result.error || !result.data || typeof result.data.fired !== "boolean") {
        errors.push({ lead_id: row.lead_id, reason: "The reminder result could not be confirmed. Refresh before retrying." });
      } else if (result.data.fired) fired++;
      else held.push({ lead_id: row.lead_id, reason: result.data.reason || "The enrollment changed before processing." });
    } catch {
      errors.push({ lead_id: row.lead_id, reason: "Could not verify or record this drip. Nothing is reported as sent." });
    }
  }
  return { ok: errors.length === 0, fired, held, errors };
}
