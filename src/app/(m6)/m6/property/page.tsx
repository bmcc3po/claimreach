export const runtime = "edge";
import PropertyTool from "@/components/PropertyTool";

export const metadata = { title: "Property lookup" };

export default async function M6PropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ leadid?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Property lookup</h1>
        <p className="m6-sub">
          Find the motel. Copy the address or save it to a file. This is ClaimReach&apos;s lookup — LawRuler does not have one.
        </p>
      </div>
      <PropertyTool toolKey="" leadid={sp.leadid || ""} apiPath="/api/m6/property" surface="m6" />
    </div>
  );
}
