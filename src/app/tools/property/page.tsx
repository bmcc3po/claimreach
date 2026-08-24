export const runtime = "edge";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import PropertyTool from "@/components/PropertyTool";
import { cleanLeadid, propertyToolKeyOk } from "@/lib/property-tool";

export const metadata = { title: "Property lookup" };

export default async function PropertyToolPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; leadid?: string }>;
}) {
  const sp = await searchParams;
  if (!propertyToolKeyOk(sp.k)) {
    const q = cleanLeadid(sp.leadid);
    redirect(q ? `/m6/property?leadid=${encodeURIComponent(q)}` : "/m6/property");
  }
  return <PropertyTool toolKey={sp.k!} leadid={cleanLeadid(sp.leadid)} />;
}
