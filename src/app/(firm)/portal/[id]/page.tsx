export const runtime = "edge";
import { redirect } from "next/navigation";

export default async function FirmLeadLegacy({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/portal/cases/${id}`);
}
