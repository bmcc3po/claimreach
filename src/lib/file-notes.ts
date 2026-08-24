// One notes thread on the ClaimReach file. Staff writes `notes`.
// The desk writes `lead_notes` because firm RLS cannot insert `notes`.
// Both loaders must merge. Do not invent a third table.

export type FileNote = {
  id: string;
  body: string;
  created_at: string;
  author?: string | null;
  author_name?: string | null;
  scope?: string | null;
  source?: string | null;
  pinned?: boolean | null;
};

export function mergeFileNotes(
  staffNotes: any[] | null | undefined,
  deskNotes: any[] | null | undefined,
  nameOf?: Map<string, string>,
): FileNote[] {
  const names = nameOf ?? new Map<string, string>();
  const fromStaff = (staffNotes ?? []).map((n: any) => ({
    ...n,
    author_name: n.author_name || names.get(n.author) || n.author || "Staff",
    scope: n.scope || "file",
  }));
  const fromDesk = (deskNotes ?? []).map((n: any) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    author: n.author,
    author_name: n.author_name || names.get(n.author) || "File",
    scope: "file",
    source: n.source || "m6",
    pinned: n.pinned,
  }));
  return [...fromStaff, ...fromDesk].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
}

export async function loadFileNotes(
  sb: any,
  leadId: string,
  firmId: string | null | undefined,
): Promise<{ notes: any[]; deskNotes: any[] }> {
  const [{ data: notes }, { data: deskNotes }] = await Promise.all([
    sb.from("notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
    firmId
      ? sb.from("lead_notes").select("id, body, created_at, author, pinned, source")
          .eq("lead_id", leadId).eq("firm_id", firmId)
          .order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  return { notes: notes ?? [], deskNotes: deskNotes ?? [] };
}
