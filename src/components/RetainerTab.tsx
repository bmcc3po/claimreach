"use client";
import { useState } from "react";
import { isFirmAudience, type FileFence } from "@/lib/file-fence";
import CaseSigning from "./CaseSigning";

const STATUS_FLOW = ["draft", "sent", "viewed", "signed", "declined"];
const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent for eSign", viewed: "Viewed", signed: "Signed", declined: "Declined" };

function FirmRetainerView({ retainers, signables }: { retainers: any[]; signables: any[] }) {
  const [preview, setPreview] = useState<any | null>(null);
  if (preview) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setPreview(null)}>← Back to retainers</button>
        <div className="row" style={{ margin: "10px 0", gap: 8 }}>
          <span className="badge stage">{STATUS_LABEL[preview.status] ?? preview.status}</span>
        </div>
        <div className="card" style={{ padding: 22, whiteSpace: "pre-wrap", fontFamily: "Georgia, serif", lineHeight: 1.55 }}>{preview.rendered_body}</div>
      </div>
    );
  }
  const signed = signables.filter((s) => !["voided", "cancelled"].includes(s.status) && !s.voided_at && (s.status === "signed" || s.completed_pdf_url));
  return (
    <div>
      {signed.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="section-title">Signed documents</div>
          <table className="docket" style={{ marginTop: 8 }}>
            <thead><tr><th>Document</th><th>Status</th><th>Signed</th><th></th></tr></thead>
            <tbody>
              {signed.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.title}</td>
                  <td><span className="badge signed">{s.status}</span></td>
                  <td className="muted">{s.signed_at ? new Date(s.signed_at).toLocaleString() : "—"}</td>
                  <td>
                    {s.completed_pdf_url && <a className="btn ghost sm" href={s.completed_pdf_url} target="_blank" rel="noopener noreferrer">Signed PDF</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="section-title">Retainers on this file</div>
      {retainers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None on file yet.</p>}
      {retainers.map((r) => (
        <div key={r.id} className="cd-event">
          <div><strong>{STATUS_LABEL[r.status] ?? r.status}</strong> <span className="muted">· {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span></div>
          {r.rendered_body && <button className="btn ghost sm" onClick={() => setPreview(r)}>Open</button>}
        </div>
      ))}
    </div>
  );
}

export default function RetainerTab({
  leadId, claimId, role, fence, initialRetainers, initialSignables,
}: {
  leadId: string; claimId?: string; role?: string;
  fence?: FileFence;
  initialRetainers?: any[];
  initialSignables?: any[];
}) {
  if (isFirmAudience(fence)) {
    return <FirmRetainerView retainers={initialRetainers ?? []} signables={initialSignables ?? []} />;
  }
  return <CaseSigning key={claimId || leadId} leadId={leadId} claimId={claimId} role={role} />;
}
