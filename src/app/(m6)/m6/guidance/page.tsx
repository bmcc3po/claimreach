export const runtime = "edge";
import { redirect } from "next/navigation";

export default async function GuidancePage({
  searchParams,
}: {
  searchParams: Promise<{ file?: string; lead?: string }>;
}) {
  const sp = await searchParams;
  const id = sp.file || sp.lead;
  redirect(id ? `/m6/crissi?file=${encodeURIComponent(id)}` : "/m6/crissi");
}
