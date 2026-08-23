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
          Same tool as LawRuler, fenced to this app. Search a city, save the stay to the file.
        </p>
      </div>
      <PropertyTool toolKey="" leadid={sp.leadid || ""} apiPath="/api/m6/property" surface="m6" />
    </div>
  );
}
