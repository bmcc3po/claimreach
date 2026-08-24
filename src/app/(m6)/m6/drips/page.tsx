export const runtime = "edge";
import Link from "next/link";
import { M6_SENDING_NUMBER } from "@/lib/m6-cadence";

export const metadata = { title: "Drip settings" };

export default function M6DripsPage() {
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Drip settings</h1>
        <p className="m6-sub">Same sender, same person, same cadence. Scripts live on the file compose panel.</p>
      </div>
      <section className="m6-card">
        <p>Sending number: {M6_SENDING_NUMBER}</p>
        <p className="m6-hint">Heartbeat is fourteen days for the first ninety, then thirty. Quiet hours 8am–8pm. Firm users do not edit master drip rules here.</p>
        <p><Link href="/m6">Back to Today</Link></p>
      </section>
    </div>
  );
}
