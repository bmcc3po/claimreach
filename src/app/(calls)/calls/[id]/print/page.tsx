export const runtime = "edge";
import { redirect } from "next/navigation";

// Calls moved to /app.
export default async function OldCallPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/${encodeURIComponent(id)}/print`);
}
