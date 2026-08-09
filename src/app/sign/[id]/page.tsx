export const runtime = "edge";
import SignPage from "@/components/SignPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SignPage id={id} />;
}
