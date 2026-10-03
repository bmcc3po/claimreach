import { extractNetflyEmail } from '@/lib/netfly-handoff';

export default function HandoffEvidence({ note, hasPdf = false }: { note: string; hasPdf?: boolean }) {
  const { agreementLinks, warnings } = extractNetflyEmail(note);
  if (!agreementLinks.length && !warnings.length) return null;
  return <div className="nf-handoff-evidence">
    {warnings.map(warning => <p className="nf-alert" role="status" key={warning}>{warning}</p>)}
    {agreementLinks.map(url => <a key={url} className="nf-secondary" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open NETFLY agreement ↗</a>)}
    {!!agreementLinks.length && !hasPdf && <p className="nf-muted">Open the agreement, choose Download PDF, then upload that PDF here. The link alone does not attach or approve the signed packet.</p>}
  </div>;
}
