export const runtime = "edge";
import NetflyFile from "@/components/netfly/NetflyFile";
export default async function NetflyFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NetflyFile fileKey={id} />;
}
