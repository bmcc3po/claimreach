export const runtime = "edge";
import PacketSignPage from "@/components/PacketSignPage";
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  return <PacketSignPage group={group} />;
}
