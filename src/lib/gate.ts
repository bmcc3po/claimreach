// ============================================================================
// Server-side permission gate. Routes call gateUser(sb) once to resolve the
// current user's role + overrides, then check capabilities with a single helper
// instead of hand-rolling ["owner","admin"].includes(role) || overrides?.[key]
// at every call site. Effective permission = override if set, else role default
// (see src/lib/permissions.ts, the single source of truth).
// ============================================================================
import { can, canSeeMoney, type PermKey } from "@/lib/permissions";

export interface GatedUser {
  id: string;
  role: string;
  overrides: Record<string, boolean>;
  firmId: string | null;
  name: string | null;
  // capability checks bound to this user
  can: (key: PermKey) => boolean;
  seesMoney: () => boolean;
}

// Resolve the signed-in user into a gated object. Returns null if unauthenticated.
export async function gateUser(sb: any): Promise<GatedUser | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await sb.from("app_users")
    .select("id, role, perm_overrides, firm_id, full_name")
    .eq("id", auth.user.id).maybeSingle();
  if (!me) return null;
  const overrides = (me.perm_overrides ?? {}) as Record<string, boolean>;
  return {
    id: me.id,
    role: me.role,
    overrides,
    firmId: me.firm_id ?? null,
    name: me.full_name ?? null,
    can: (key: PermKey) => can(me.role, overrides, key),
    seesMoney: () => canSeeMoney(me.role, overrides),
  };
}

// Convenience for routes: returns the user if they have the permission, or an
// object describing the failure so the route can return the right status.
export async function requirePerm(sb: any, key: PermKey): Promise<
  { ok: true; user: GatedUser } | { ok: false; status: 401 | 403; error: string }
> {
  const user = await gateUser(sb);
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!user.can(key)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, user };
}
