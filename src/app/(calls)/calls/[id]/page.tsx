export const runtime = "edge";
import { redirect } from "next/navigation";

// Calls moved to /app. A link in an old dispo email still opens the file.
export default async function OldCall({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(`/app/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`);
}
