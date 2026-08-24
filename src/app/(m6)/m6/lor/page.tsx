export const runtime = "edge";
import Link from "next/link";

export const metadata = { title: "LOR / letters" };

export default function M6LorPage() {
  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>LOR / letters</h1>
        <p className="m6-sub">One click sends certified mail to G6 via PostGrid. Preview first. LawRuler is not in this path.</p>
      </div>
      <section className="m6-card">
        <p>Open a file, or use LOR on a Today / Cases row. Status lives on the file card. Send is the red LOR button.</p>
        <p><Link href="/m6">Today — LOR stack</Link></p>
        <p><Link href="/m6/cases">All files</Link></p>
      </section>
    </div>
  );
}
