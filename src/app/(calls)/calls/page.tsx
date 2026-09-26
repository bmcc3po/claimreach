export const runtime = "edge";
import { redirect } from "next/navigation";

// Calls moved to /app. Old links and bookmarks land in the right place.
export default async function OldCalls({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(`/app${qs ? `?${qs}` : ""}`);
}
