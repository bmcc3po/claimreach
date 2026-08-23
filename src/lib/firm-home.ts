// Firm post-login home. retention_alert_recipients (campaign motel6) is the
// m6 landing flag — adding an m6 firm user means adding them to that table
// (lowercase email, active). firm_access still provisions the account.
// Recipients are internal-RLS; landing uses is_m6_landing_email() (0087).
// First-login app_users insert is 0088a: auth callback RPC
// provision_self_from_firm_access. No auth.users triggers on this platform.

import { firmLandingPath } from "@/lib/m6";

export function firmAccessEmailMatch(stored: string, incoming: string): boolean {
  return stored.trim().toLowerCase() === incoming.trim().toLowerCase();
}

export function needsFirmProvision(
  userId: string | null | undefined,
  me: { role?: string } | null | undefined,
): boolean {
  return !!userId && !me;
}

export function wouldProvisionFromAllowlist(opts: {
  userId: string | null | undefined;
  email: string | null | undefined;
  allowlist: { email: string; firm_slug: string } | null;
}): boolean {
  if (!opts.userId || !opts.email || !opts.allowlist) return false;
  return firmAccessEmailMatch(opts.allowlist.email, opts.email);
}

export function provisionRpcFailed(error: { message?: string } | null | undefined): string | null {
  if (!error) return null;
  return (error.message && error.message.trim()) || "Could not set up your account.";
}

export async function ensureAppUser(
  sb: any,
  user: { id: string; email?: string | null } | null,
): Promise<{ role: string } | null> {
  if (!user) return null;
  const first = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (first.error) {
    throw new Error(first.error.message || "Could not read your account.");
  }
  const me = first.data ?? null;
  if (!needsFirmProvision(user.id, me)) return me;

  const { data, error } = await sb.rpc("provision_self_from_firm_access");
  const fail = provisionRpcFailed(error);
  if (fail) throw new Error(fail);

  const again = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (again.error) {
    throw new Error(again.error.message || "Could not read your account.");
  }
  if (data === true && !again.data) {
    throw new Error("Account was not created. Try signing in again.");
  }
  return again.data ?? null;
}

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
