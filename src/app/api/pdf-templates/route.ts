import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

async function me(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data: u } = await sb.from("app_users").select("id, role, firm_id").eq("id", auth.user.id).maybeSingle();
  return u ? { ...u, uid: auth.user.id } : null;
}

// GET -> list PDF templates for the firm
export async function GET() {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("pdf_templates").select("id, name, doc_type, file_name, page_count, fields, certified, campaign_id, case_type, is_default, updated_at").order("updated_at", { ascending: false });
  return NextResponse.json({ templates: data ?? [] });
}

// POST multipart (upload) OR json (save layout)
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u || !["owner", "admin", "manager"].includes(u.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = supabaseAdmin();
  const ctype = req.headers.get("content-type") || "";

  // --- file upload (multipart) ---
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const name = (form.get("name") as string) || "Retainer PDF";
    const pageCount = parseInt((form.get("page_count") as string) || "1", 10);
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${u.firm_id || "master"}/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await admin.storage.from("retainer-pdfs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data, error } = await admin.from("pdf_templates").insert({
      firm_id: u.firm_id, name, file_path: path, file_name: file.name, page_count: pageCount, fields: [], created_by: u.uid,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // --- json ops ---
  const b = await req.json();
  if (b.op === "save_fields") {
    const patch: any = { fields: b.fields, name: b.name, page_count: b.page_count };
    if (b.campaign_id !== undefined) patch.campaign_id = b.campaign_id || null;
    if (b.case_type !== undefined) patch.case_type = b.case_type === "any" ? null : b.case_type;
    if (b.is_default !== undefined) patch.is_default = !!b.is_default;
    if (b.page_dims) patch.page_dims = b.page_dims;
    const { error } = await admin.from("pdf_templates").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "delete") {
    const { data: tpl } = await admin.from("pdf_templates").select("file_path").eq("id", b.id).maybeSingle();
    if (tpl?.file_path) await admin.storage.from("retainer-pdfs").remove([tpl.file_path]);
    await admin.from("pdf_templates").delete().eq("id", b.id);
    return NextResponse.json({ ok: true });
  }
  if (b.op === "signed_url") {
    const { data: tpl } = await admin.from("pdf_templates").select("file_path").eq("id", b.id).maybeSingle();
    if (!tpl?.file_path) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data } = await admin.storage.from("retainer-pdfs").createSignedUrl(tpl.file_path, 3600);
    return NextResponse.json({ url: data?.signedUrl });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
