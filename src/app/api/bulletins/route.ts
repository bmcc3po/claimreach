import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// POST { board_id, title?, body } — RLS + board.post_roles enforce who can post.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const { board_id, title, body } = await req.json();
  if (!board_id || !body) return NextResponse.json({ error: "board_id and body required" }, { status: 400 });

  // Check the board allows this role to post.
  const { data: board } = await sb.from("boards").select("post_roles").eq("id", board_id).maybeSingle();
  if (!board) return NextResponse.json({ error: "board not found" }, { status: 404 });
  if (!board.post_roles.includes(me.role)) {
    return NextResponse.json({ error: "not permitted to post to this board" }, { status: 403 });
  }

  const { error } = await sb.from("bulletins").insert({
    board_id, firm_id: me.firm_id, author: auth.user.id,
    author_name: me.full_name ?? "Staff", title: title ?? null, body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
