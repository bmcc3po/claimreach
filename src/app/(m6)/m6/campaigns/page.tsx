export const runtime = "edge";
import Link from "next/link";

export const metadata = { title: "Email campaigns" };

export default function M6CampaignsPage() {
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Email campaigns</h1>
        <p className="m6-sub">This desk does not send mass email. Motel 6 stays one person, one file.</p>
      </div>
      <section className="m6-card">
        <p>There is no blast tool here. Scheduled emails live with the other Motel 6 sequences.</p>
        <p><Link href="/m6/drips">Open drip settings</Link></p>
        <p className="m6-hint">To write one email now, open the file and use the compose panel. Approved words only.</p>
        <p><Link href="/m6/cases">Open a file to write</Link></p>
      </section>
    </div>
  );
}
