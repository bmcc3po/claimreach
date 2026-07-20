export const runtime = "edge";
import RetainerEditor from "@/components/RetainerEditor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RetainerEditor id={id} />;
}
