export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";

export const metadata = { title: "Add a user" };

export default async function M6UsersPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return null;
  const staff = isInternalRole(session.user.role);
  const canUsers = staff && ["owner", "admin"].includes(session.user.role);

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Add a user</h1>
        <p className="m6-sub">TMP firm logins are provisioned. This desk does not make its own accounts.</p>
      </div>
      <section className="m6-card">
        <p>
          Add the lowercase email on <code>firm_access</code>. For Motel 6 alerts, add it on{" "}
          <code>retention_alert_recipients</code> with campaign motel6 and active.
        </p>
        <p className="m6-hint">Do not send every TMP login to /m6 — only the Motel 6 desk people.</p>
        {canUsers && (
          <p>
            Staff user list lives on the main site:{" "}
            <Link href="/users">Open Users</Link>
          </p>
        )}
        {!canUsers && staff && (
          <p className="m6-hint">Ask an admin if someone new needs a login.</p>
        )}
      </section>
    </div>
  );
}
