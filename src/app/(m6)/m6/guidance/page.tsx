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
          Crissi’s Motel 6 SOP and the always-rules from the run sheet.
          {isStaff ? " Full Crissi stays on /crissi. Maverick is not here." : " This is the firm copy — no sales coaching."}
        </p>
      </div>
      <CrissiRail showFullLink={isStaff} />
    </div>
  );
}
