export const runtime = "edge";
import { redirect } from "next/navigation";

// Calls moved to /app.
export default async function OldCallPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ claim?: string }> }) {
  const { id } = await params;
  const { claim } = await searchParams;
  redirect(`/app/${encodeURIComponent(id)}/print${claim ? `?claim=${encodeURIComponent(claim)}` : ""}`);
}
