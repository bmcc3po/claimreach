// ============================================================================
// Files linked by the same wreck. A passenger's file is created with
// external_id "<parent lead id>:pax:<passenger key>", so the link is already
// in the data: this is the ONE place that reads it in both directions. Shown
// on the lead workspace and the call console, so when the passenger calls in,
// the agent sees the driver's file right there ("How's Niko doing?") — Brett,
// Sep 28.
//
// Round 7 (Astra round 6): the passenger key is a stable id the console gives
// each passenger when added (legacy files keep their numeric index), both
// directions are scoped to the SAME firm, and only the shared crash facts
// ever cross from one person's intake to another's.
// ============================================================================

export interface LinkedFile { id: string; lead_no: string | null; name: string; label: string }

const PAX_RE = /^([0-9a-f-]{36}):pax:([A-Za-z0-9_-]{1,40})$/i;

/** The parent lead id when this lead IS a passenger file, else null. */
export function paxParentId(externalId: string | null | undefined): string | null {
  const m = String(externalId || "").match(PAX_RE);
  return m ? m[1] : null;
}

/**
 * The facts two people in the same car share: when and where it happened,
 * and whether police came. NEVER fault, seat, injuries, representation or
 * the narrative — those are each person's own answers.
 */
export function sharedCrashFacts(story: any): Record<string, any> | null {
  if (!story || typeof story !== "object") return null;
  const out: Record<string, any> = {};
  for (const k of ["when", "date", "city", "police"]) if (story[k] != null && story[k] !== "") out[k] = story[k];
  return Object.keys(out).length ? out : null;
}

/** Every other file on the same wreck: the driver/caller and co-passengers. */
export async function linkedFilesFor(
  db: any,
  lead: { id: string; external_id?: string | null; firm_id: string },
): Promise<LinkedFile[]> {
  const out: LinkedFile[] = [];
  try {
    const parentId = paxParentId(lead.external_id) ?? lead.id;
    if (parentId !== lead.id) {
      const { data: parent } = await db.from("leads").select("id, lead_no, claimant_name")
        .eq("id", parentId).eq("firm_id", lead.firm_id).maybeSingle();
      if (parent) out.push({ id: parent.id, lead_no: parent.lead_no, name: parent.claimant_name || "The caller", label: "same wreck, their file opened this one" });
    }
    const { data: kids } = await db.from("leads").select("id, lead_no, claimant_name")
      .eq("firm_id", lead.firm_id).like("external_id", `${parentId}:pax:%`).is("archived_at", null).limit(10);
    for (const k of kids ?? []) {
      if (k.id === lead.id) continue;
      out.push({ id: k.id, lead_no: k.lead_no, name: k.claimant_name || "Passenger", label: parentId === lead.id ? "passenger in this wreck" : "in the same car" });
    }
  } catch { /* linking is context, never load-bearing */ }
  return out;
}

/** Normalized name for "is this the same passenger?" checks. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: any) => String(x || "").toLowerCase().replace(/[^a-z]/g, "");
  return !!n(a) && n(a) === n(b);
}
