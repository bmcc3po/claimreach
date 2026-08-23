export const runtime = "edge";
import { redirect } from "next/navigation";

// Live bot lives on /m6/guidance. Keep this path so old row links still work.
export default async function M6CrissiRedirect({
  searchParams,
}: {
  searchParams: Promise<{ file?: string; lead?: string }>;
}) {
  const sp = await searchParams;
  const id = sp.file || sp.lead;
  redirect(id ? `/m6/guidance?file=${encodeURIComponent(id)}` : "/m6/guidance");
}
