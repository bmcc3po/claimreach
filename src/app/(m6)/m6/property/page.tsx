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
          Find the motel. Copy the address onto the file, or type a file number and save the stay.
        </p>
      </div>
      <PropertyTool toolKey="" leadid={sp.leadid || ""} apiPath="/api/m6/property" surface="m6" />
    </div>
  );
}
