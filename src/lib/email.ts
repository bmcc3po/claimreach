// Minimal email sender via Resend. Works on Cloudflare edge (single fetch).
// Requires env RESEND_API_KEY and EMAIL_FROM (e.g. "ClaimReach <noreply@claimreach.com>").
// Returns { ok, error? } so callers can report real delivery status.

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  const key = (globalThis as any)?.process?.env?.RESEND_API_KEY;
  const from = (globalThis as any)?.process?.env?.EMAIL_FROM || "ClaimReach <noreply@claimreach.com>";
  if (!key) return { ok: false, error: "email not configured (RESEND_API_KEY missing)" };
  if (!opts.to) return { ok: false, error: "no recipient email" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [opts.to], subject: opts.subject, html: opts.html,
        text: opts.text || undefined, reply_to: opts.replyTo || undefined,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: (d as any)?.message || `email send failed (${r.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "email send error" };
  }
}

// A simple signing-link email body.
export function signingEmailHtml(opts: { clientName: string; link: string; message?: string; firmName?: string }): string {
  const safe = (s: string) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const msg = opts.message ? `<p style="margin:0 0 16px;color:#334155">${safe(opts.message)}</p>` : "";
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#10243f;margin:0 0 12px">Your document is ready to sign</h2>
    <p style="margin:0 0 8px;color:#334155">Hi ${safe(opts.clientName || "there")},</p>
    ${msg}
    <p style="margin:0 0 20px;color:#334155">Please review and sign your document. It only takes a minute on your phone.</p>
    <a href="${safe(opts.link)}" style="display:inline-block;background:#f5b301;color:#10243f;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:10px">Review &amp; Sign</a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">Or paste this link into your browser:<br>${safe(opts.link)}</p>
    ${opts.firmName ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Sent on behalf of ${safe(opts.firmName)}.</p>` : ""}
  </div>`;
}
