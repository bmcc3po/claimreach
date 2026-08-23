import Link from "next/link";
import { ALWAYS_RULES, M6_CRISSI_GUIDANCE } from "@/lib/m6-cadence";

export default function CrissiRail({
  showFullLink = false,
}: {
  showFullLink?: boolean;
}) {
  return (
    <section className="m6-card m6-crissi">
      <div className="m6-card-head">
        <h2>{M6_CRISSI_GUIDANCE.title}</h2>
        {showFullLink && (
          <Link href="/crissi" className="m6-linkbtn">Open Crissi</Link>
        )}
      </div>
      <p className="m6-hint">
        Read-only for this campaign. Not sales coaching. If someone is in crisis,
        stay on the line and connect them.
      </p>
      <h3>Your role</h3>
      <ul className="m6-guide">{M6_CRISSI_GUIDANCE.role.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>Helpful things to say</h3>
      <ul className="m6-guide">{M6_CRISSI_GUIDANCE.say.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>What to avoid</h3>
      <ul className="m6-guide">{M6_CRISSI_GUIDANCE.avoid.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>On every touch</h3>
      <ul className="m6-guide">{ALWAYS_RULES.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3>If you need a number</h3>
      <ul className="m6-guide">
        {M6_CRISSI_GUIDANCE.resources.map((r) => (
          <li key={r.name}><strong>{r.name}.</strong> {r.value}</li>
        ))}
      </ul>
    </section>
  );
}
