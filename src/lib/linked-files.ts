// ============================================================================
// Files linked by the same wreck. A passenger's file is created with
// external_id "<parent lead id>:pax:<n>", so the link is already in the data:
// this is the ONE place that reads it in both directions. Shown on the lead
// workspace and the call console, so when the passenger calls in, the agent
// sees the driver's file right there ("How's Niko doing?") — Brett, Sep 28.
// ============================================================================

export interface LinkedFile { id: string; lead_no: string | null; name: string; label: string }

const PAX_RE = /^([0-9a-f-]{36}):pax:(\d+)$/i;

/** The parent lead id when this lead IS a passenger file, else null. */
export function paxParentId(externalId: string | null | undefined): string | null {
  const m = String(externalId || "").match(PAX_RE);
  return m ? m[1] : null;
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
        .eq("id", parentId).maybeSingle();
      if (parent) out.push({ id: parent.id, lead_no: parent.lead_no, name: parent.claimant_name || "The caller", label: "same wreck, their file opened this one" });
    }
    const { data: kids } = await db.from("leads").select("id, lead_no, claimant_name")
      .eq("firm_id", lead.firm_id).like("external_id", `${parentId}:pax:%`).limit(10);
    for (const k of kids ?? []) {
      if (k.id === lead.id) continue;
      out.push({ id: k.id, lead_no: k.lead_no, name: k.claimant_name || "Passenger", label: parentId === lead.id ? "passenger in this wreck" : "in the same car" });
    }
  } catch { /* linking is context, never load-bearing */ }
  return out;
}
