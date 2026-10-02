import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";

export const runtime = "edge";

// Owner/admin manual export of an uploaded original. RLS first confines the
// row to files this account may read; the private storage path never leaves us.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sb = await supabaseServer();
  const staff = await requireStaff(sb);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(staff.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { data: doc, error } = await sb.from("case_documents").select("id, file_name, storage_path").eq("id", id).maybeSingle();
  if (error || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!/\.pdf$/i.test(doc.file_name || "")) return NextResponse.json({ error: "Only PDF originals can be exported here." }, { status: 400 });
  const { data: file, error: storageError } = await supabaseAdmin().storage.from("case-docs").download(doc.storage_path);
  if (storageError || !file) return NextResponse.json({ error: "Document unavailable" }, { status: 502 });
  const safeName = String(doc.file_name || "original.pdf").replace(/[\r\n"\\/]/g, "_");
  return new Response(file, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName}"`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
