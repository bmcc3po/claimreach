import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { isInternalRole } from "@/lib/permissions";
import "@/components/calls/calls.css";
import KeyboardFit from "@/components/calls/KeyboardFit";
import DeskChrome from "@/components/calls/DeskChrome";

// The call console runs full screen on a phone: no side nav, safe areas on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default async function CallsLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  if ((user.app_metadata as any)?.must_change_password) redirect("/set-password");
  const { data: me } = await sb.from("app_users").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");
  if (!isInternalRole(me.role)) redirect("/portal");
  return <div className="cc-page cc-shelled"><KeyboardFit /><DeskChrome name={me.full_name || ""} role={me.role} />{children}</div>;
}
