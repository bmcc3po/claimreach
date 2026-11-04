import { dripChannelLabel } from "@/lib/drip-rules";
import type { DripWording } from "@/lib/m6-audit-server";

// Read-only: the exact words every Motel 6 drip step says, and whether it is
// on and approved. Editing stays on Drip settings (staff, admin only).
export default function DripWordingList({ steps }: { steps: DripWording[] }) {
  const approved = steps.filter((s) => s.approved).length;
  return (
    <section className="m6-card m6-drip-audit" aria-labelledby="drip-audit-h">
      <div className="m6-card-head">
        <h2 id="drip-audit-h">What the drip says</h2>
        <span className={`sb ${approved === steps.length && steps.length ? "good" : "warn"}`}>
          {approved} of {steps.length} approved
        </span>
      </div>
      <p className="m6-hint">
        Every scheduled Motel 6 message, word for word. A step that is not approved never sends on its own.
        An agent can still send it by hand from the file.
      </p>
      {steps.length === 0 ? (
        <p className="m6-empty">No drip steps are set up for Motel 6.</p>
      ) : (
        <ol className="m6-drip-list">
          {steps.map((s) => (
            <li key={s.id}>
              <details>
                <summary>
                  <span className="m6-drip-name">{s.name}</span>
                  <span className="m6-drip-meta">{dripChannelLabel(s.channel)}, {s.timing.toLowerCase()}</span>
                  <span className="m6-drip-tags">
                    {!s.active && <span className="sb neut">Off</span>}
                    <span className={`sb ${s.approved ? "good" : "warn"}`}>{s.approved ? "Approved" : "Not approved"}</span>
                  </span>
                </summary>
                {s.subject && <p className="m6-drip-subject">Subject: {s.subject}</p>}
                <p className="m6-drip-body">{s.body || "No wording yet."}</p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
