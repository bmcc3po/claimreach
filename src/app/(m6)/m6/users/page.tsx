export const runtime = "edge";
import Link from "next/link";

export const metadata = { title: "Add a user" };

export default function M6UsersPage() {
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Add a user</h1>
        <p className="m6-sub">TMP firm logins are provisioned. This desk does not self-serve accounts.</p>
      </div>
      <section className="m6-card">
        <p>Ask Innovative to add the lowercase email on <code>firm_access</code> and, for Motel 6 alerts, <code>retention_alert_recipients</code>.</p>
        <p className="m6-hint">Do not send every TMP login to /m6 — only the Motel 6 desk people.</p>
        <p className="m6-hint"><Link href="/users">Staff: Users</Link></p>
      </section>
    </div>
  );
}
