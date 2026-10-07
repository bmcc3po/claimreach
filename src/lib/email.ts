// Minimal email sender via Resend. Works on Cloudflare edge (single fetch).
// Requires env RESEND_API_KEY and EMAIL_FROM (e.g. "ClaimReach <noreply@claimreach.com>").
// Returns { ok, error? } so callers can report real delivery status.
//
// idempotencyKey (optional) rides as Resend's Idempotency-Key header: a retry
// with the same key and the same payload inside Resend's 24 hour window gets
// the first answer back instead of a second email. A retry with the same key
// and DIFFERENT content is refused by Resend (409). This makes a retry safe,
// not exactly-once: past the window, or with changed content, it can send again.

export async function sendEmail(opts: { to: string | string[]; cc?: string[]; subject: string; html: string; text?: string; replyTo?: string; attachments?: { filename: string; content: string }[]; idempotencyKey?: string }): Promise<{ ok: boolean; error?: string; uncertain?: boolean; providerId?: string }> {
  const key = (globalThis as any)?.process?.env?.RESEND_API_KEY;
  const from = (globalThis as any)?.process?.env?.EMAIL_FROM || "ClaimReach <noreply@claimreach.com>";
  if (!key) return { ok: false, error: "email not configured (RESEND_API_KEY missing)" };
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  const cc = (opts.cc || []).filter(Boolean);
  if (!to.length) return { ok: false, error: "no recipient email" };
  const headers: Record<string, string> = { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const idem = String(opts.idempotencyKey ?? "").trim();
  if (idem) headers["Idempotency-Key"] = idem;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers,
      body: JSON.stringify({
        from, to, cc: cc.length ? cc : undefined, subject: opts.subject, html: opts.html,
        text: opts.text || undefined, reply_to: opts.replyTo || undefined,
        // Files ride along base64 encoded (Resend's format).
        attachments: opts.attachments && opts.attachments.length ? opts.attachments : undefined,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, uncertain: r.status >= 500 || [408, 409].includes(r.status), error: (d as any)?.message || `email send failed (${r.status})` };
    }
    const sent = await r.json().catch(() => ({})) as { id?: string };
    return { ok: true, providerId: sent.id };
  } catch (e: any) {
    return { ok: false, uncertain: true, error: e?.message || "email send error" };
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
