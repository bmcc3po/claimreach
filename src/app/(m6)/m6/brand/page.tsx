export const runtime = "edge";
import BrandOwner from "@/components/m6/BrandOwner";

export const metadata = { title: "Brand & owner" };

export default async function M6BrandPage({
  searchParams,
}: {
  searchParams: Promise<{ g6?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Brand &amp; owner</h1>
        <p className="m6-sub">
          Pick the building and the stay year. Hunt looks up the LLC. You review and save. We never invent a filing.
        </p>
      </div>
      <BrandOwner g6Only={sp.g6 !== "0"} />
    </div>
  );
}
