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
          Today&apos;s Google pin is one fact. The flag and LLC in the stay year is another. We record what we know. We do not invent a Secretary of State filing.
        </p>
      </div>
      <BrandOwner g6Only={sp.g6 !== "0"} />
    </div>
  );
}
