export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import CrissiRail from "@/components/m6/CrissiRail";
import { redirect } from "next/navigation";

export default async function GuidancePage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) redirect("/firm-login");
  const isStaff = isInternalRole(session.user.role);

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Guidance</h1>
        <p className="m6-sub">
          The always-rules from the run sheet, and Crissi’s Motel 6 SOP.
          {isStaff ? " Full Crissi stays on /crissi." : ""}
        </p>
      </div>
      <CrissiRail showFullLink={isStaff} />
    </div>
  );
}
