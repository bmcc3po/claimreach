"use client";
import { useState, useEffect } from "react";
import { PERMISSIONS, PERM_GROUPS, ROLES, ROLE_DEFAULTS, type PermKey, type Role } from "@/lib/permissions";

export default function UserManager({ firms }: { firms: { id: string; name: string; slug: string }[] }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try { const r = await fetch("/api/users"); const d = await r.json(); setUsers(d.users ?? []); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (editing || creating) {
    return <UserEditor user={editing} firms={firms} onClose={() => { setEditing(null); setCreating(false); }} onSaved={(m) => { setMsg(m); setEditing(null); setCreating(false); load(); }} />;
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Users & Permissions</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => setCreating(true)}>+ Add user</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && (
        <div className="table-scroll">
          <table className="docket">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Title</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active === false ? 0.5 : 1 }}>
                  <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                  <td className="muted">{u.email}</td>
                  <td><span className="badge stage">{u.role}</span>{u.perm_overrides && Object.keys(u.perm_overrides).length > 0 && <span className="badge gold" style={{ marginLeft: 4, fontSize: 9 }}>custom</span>}</td>
                  <td className="muted">{u.title || "—"}</td>
                  <td>{u.active === false ? <span className="badge dq">Inactive</span> : <span className="badge signed">Active</span>}</td>
                  <td><button className="btn ghost sm" onClick={() => setEditing(u)}>Edit</button></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} className="muted">No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserEditor({ user, firms, onClose, onSaved }: { user: any; firms: any[]; onClose: () => void; onSaved: (m: string) => void }) {
  const isNew = !user;
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "agent");
  const [title, setTitle] = useState(user?.title ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [firmId, setFirmId] = useState(user?.firm_id ?? (firms[0]?.id ?? ""));
  const [overrides, setOverrides] = useState<Record<string, boolean>>(user?.perm_overrides ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const roleDefaults = new Set(ROLE_DEFAULTS[role] ?? []);
  function effective(key: PermKey): boolean { return key in overrides ? !!overrides[key] : roleDefaults.has(key); }
  function toggle(key: PermKey) {
    setOverrides((o) => {
      const next = { ...o };
      const cur = effective(key);
      // setting opposite of role default creates an override; matching default removes it
      if (!cur === roleDefaults.has(key)) delete next[key];
      else next[key] = !cur;
      return next;
    });
  }
  function resetOverrides() { setOverrides({}); }

  async function save() {
    setBusy(true); setErr("");
    if (isNew) {
      if (!email || !password) { setErr("Email and a temporary password are required."); setBusy(false); return; }
      const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", email, password, full_name: fullName, role, title, phone, firm_id: firmId, perm_overrides: overrides }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Create failed"); setBusy(false); return; }
      onSaved(`Created ${email}.`);
    } else {
      const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "update", id: user.id, full_name: fullName, role, title, phone, firm_id: firmId, perm_overrides: overrides }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Update failed"); setBusy(false); return; }
      if (password) await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set_password", id: user.id, password }) });
      onSaved(`Updated ${fullName}.`);
    }
    setBusy(false);
  }

  async function setActive(active: boolean) {
    await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: active ? "reactivate" : "deactivate", id: user.id }) });
    onSaved(active ? "Reactivated." : "Deactivated.");
  }

  return (
    <div>
      <button className="btn ghost sm" onClick={onClose}>← All users</button>
      <h1 style={{ marginTop: 10 }}>{isNew ? "Add user" : `Edit ${user.full_name}`}</h1>

      <div className="card" style={{ padding: 18, marginBottom: 16, maxWidth: 760 }}>
        <div className="form-grid2">
          <div><label className="fld-label">Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><label className="fld-label">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew} /></div>
          <div><label className="fld-label">{isNew ? "Temporary password" : "Reset password (optional)"}</label><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? "Set a temp password" : "Leave blank to keep"} /></div>
          <div><label className="fld-label">Role</label><select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}</select></div>
          <div><label className="fld-label">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="fld-label">Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="fld-label">Firm</label><select value={firmId} onChange={(e) => setFirmId(e.target.value)}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{ROLES.find((r) => r.role === role)?.desc}</p>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 16, maxWidth: 760 }}>
        <div className="row"><div className="section-title" style={{ margin: 0 }}>Permissions</div><span className="spacer" />{Object.keys(overrides).length > 0 && <button className="btn ghost sm" onClick={resetOverrides}>Reset to role defaults</button>}</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Toggles start at the role's defaults. Changing one creates a per-user override (shown in gold).</p>
        {PERM_GROUPS.map((g) => (
          <div key={g} style={{ marginTop: 12 }}>
            <div className="section-title">{g}</div>
            <div className="perm-grid">
              {PERMISSIONS.filter((p) => p.group === g).map((p) => {
                const on = effective(p.key);
                const overridden = p.key in overrides;
                return (
                  <button key={p.key} className={`perm-toggle ${on ? "on" : "off"} ${overridden ? "ovr" : ""}`} onClick={() => toggle(p.key)}>
                    <span className="perm-dot" />{p.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create user" : "Save changes"}</button>
        {!isNew && user.active !== false && <button className="btn ghost" onClick={() => setActive(false)}>Deactivate</button>}
        {!isNew && user.active === false && <button className="btn ghost" onClick={() => setActive(true)}>Reactivate</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
