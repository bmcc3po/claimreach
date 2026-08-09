export const runtime = "edge";
import FormBuilder from "@/components/FormBuilder";
export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div><h1 style={{ marginTop: 0 }}>Edit intake form</h1><FormBuilder formId={id} /></div>;
}
