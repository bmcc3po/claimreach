// Firm post-login home. retention_alert_recipients (campaign motel6) is the
// m6 landing flag — adding an m6 firm user means adding them to that table
// (lowercase email, active). firm_access still provisions the account.
// Recipients are internal-RLS; landing uses is_m6_landing_email() (0087).

import { firmLandingPath } from "@/lib/m6";

export async function resolveFirmHome(
  sb: any,
  opts: { role: string | null | undefined; email: string | null | undefined; requestedNext?: string | null },
): Promise<string | null> {
  let isM6Recipient = false;
  if (opts.role === "firm" && opts.email) {
    try {
      const { data } = await sb.rpc("is_m6_landing_email", { p_email: opts.email });
      isM6Recipient = data === true;
    } catch {
      isM6Recipient = false;
    }
  }
  return firmLandingPath({
    role: opts.role ?? null,
    isM6Recipient,
    requestedNext: opts.requestedNext,
  });
}
