export const runtime = "edge";
import Link from "next/link";

export const metadata = { title: "Email campaigns" };

export default function M6CampaignsPage() {
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Email campaigns</h1>
        <p className="m6-sub">Motel 6 is the campaign. This desk does not rewrite a live signed campaign.</p>
      </div>
      <section className="m6-card">
        <p>Compose from the file. Approved words only. No case subject if comms are monitored.</p>
        <p><Link href="/m6/cases">Open a file to write</Link></p>
        <p className="m6-hint"><Link href="/settings/campaigns">Staff: campaign templates</Link></p>
      </section>
    </div>
  );
}
