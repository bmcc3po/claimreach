import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

function parse(text: string): any[] | null {
  let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("["), e = t.lastIndexOf("]");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { const a = JSON.parse(t); return Array.isArray(a) ? a : null; } catch { return null; }
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { pages } = await req.json();
  // Trim the payload: keep lines likely to anchor fields (signatures, dates, names, blanks).
  const compact = (pages || []).map((p: any) => ({
    page: p.page,
    lines: (p.items || []).filter((it: any) => /sign|signature|date|name|client|attorney|initial|_{2,}|\u2014{2,}|x_{2,}/i.test(it.s) || /_{3,}/.test(it.s))
      .slice(0, 40).map((it: any) => ({ t: it.s.slice(0, 60), x: it.xPct, y: it.yPct })),
  })).filter((p: any) => p.lines.length);

  const system = `You place form fields on a legal retainer PDF. You are given text lines with page-relative positions (x,y as percentages, origin top-left). Return ONLY a JSON array of fields to place:
[{"page":N,"type":"signature|date|text|initials","role":"client|agent","xPct":N,"yPct":N,"label":"...","mapTo":"contact.full_name|contact.address|case.lead_no|today|..."}]
Rules: put a "signature" field on signature lines (usually near "Signature", "Client", "Sign here", or a long underscore blank at the bottom). Put "date" on date lines. Put "text" with a mapTo on name/address blanks (mapTo "contact.full_name" for client name, "contact.address" for address, "today" for date-typed blanks). Client signs most fields; attorney/agent signs attorney lines. Position xPct slightly right of the label text. Output ONLY the JSON array, max 12 fields.`;
  const user = `Pages and candidate lines:\n${JSON.stringify(compact).slice(0, 6000)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const rr = await fetch(new URL("/api/ai", req.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ system, user }), signal: ctrl.signal,
    });
    const dd = await rr.json();
    const answer = dd.answer || "";
    clearTimeout(timer);
    const fields = parse(answer);
    if (!fields) return NextResponse.json({ error: "AI did not return placeable fields. Place manually." }, { status: 200 });
    // sanitize
    const clean = fields.filter((f) => f && typeof f === "object").slice(0, 12).map((f) => ({
      page: Number(f.page) || 1,
      type: ["signature", "date", "text", "initials", "checkbox"].includes(f.type) ? f.type : "text",
      role: f.role === "agent" ? "agent" : "client",
      xPct: Math.max(0, Math.min(95, Number(f.xPct) || 10)),
      yPct: Math.max(0, Math.min(97, Number(f.yPct) || 10)),
      label: String(f.label || f.type || "Field").slice(0, 40),
      mapTo: typeof f.mapTo === "string" ? f.mapTo : undefined,
    }));
    return NextResponse.json({ fields: clean });
  } catch (e: any) {
    clearTimeout(timer);
    return NextResponse.json({ error: e?.name === "AbortError" ? "AI ran long. Place fields manually." : "Request failed." }, { status: 200 });
  }
}
