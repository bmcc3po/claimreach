export const runtime = "edge";
import TurnFileApp from "@/components/turn/TurnFileApp";

export default async function TurnFilePage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return <TurnFileApp fileId={fileId} />;
}
