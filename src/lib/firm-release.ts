import { unlocksFirm, type StatusDef } from "@/lib/statuses";

/** Authorization requires the live catalog; display fallbacks are not grants. */
export async function firmMatterReleased(db: any, status: string | null | undefined): Promise<boolean> {
  if (!status) return false;
  const { data, error } = await db.from("statuses").select("*").eq("key", status).eq("active", true).maybeSingle();
  return !error && !!data && unlocksFirm(status, [data as StatusDef]);
}
