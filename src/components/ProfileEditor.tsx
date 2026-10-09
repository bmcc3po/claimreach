"use client";
import { useRef, useState } from "react";

const COLORS = ["#16324f", "#2563eb", "#2f8a52", "#c0392f", "#6d4aff", "#0891b2", "#c2540c"];

export default function ProfileEditor({ me, email }: { me: any; email: string }) {
  const [f, setF] = useState({
    full_name: me?.full_name ?? "", title: me?.title ?? "", phone: me?.phone ?? "",
    bio: me?.bio ?? "", avatar_color: me?.avatar_color ?? COLORS[0], calendly_slug: me?.calendly_slug ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const initials = (f.full_name || email).split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  async function save() {
    if (sending.current) return;
    sending.current = true; setSaving(true); setSaved(false); setError("");
    try {
      const response = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const result = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Sign in again to save your profile. Your edits are still here.");
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || "Your profile did not save. Your edits are still here; try again.");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "Your profile did not save. Your edits are still here; try again.");
    } finally { sending.current = false; setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Your profile</h1>
      <div className="card" style={{ padding: 20 }} onChange={() => { setSaved(false); setError(""); }}>
        <div className="row" style={{ gap: 16, marginBottom: 18 }}>
          <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: "50%", background: f.avatar_color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>{initials}</div>
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{f.full_name || "Your name"}</div>
            <div className="muted">{f.title || "Add a title"} · {email}</div>
          </div>
        </div>

        <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div className="grid2">
          <div className="field"><label htmlFor="profile-name">Full name</label><input id="profile-name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="field"><label htmlFor="profile-title">Title</label><input id="profile-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Case Manager / Attorney" /></div>
          <div className="field"><label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label htmlFor="profile-calendly">Calendly slug</label><input id="profile-calendly" value={f.calendly_slug} onChange={(e) => setF({ ...f, calendly_slug: e.target.value })} placeholder="yourname" /></div>
        </div>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="profile-bio">Bio</label><textarea id="profile-bio" rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>

        <div className="field" style={{ marginTop: 10 }}>
          <label>Avatar color</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {COLORS.map((c, i) => (
              <button key={c} type="button" aria-label={`Avatar color ${i + 1}`} aria-pressed={f.avatar_color === c} onClick={() => { setF({ ...f, avatar_color: c }); setSaved(false); setError(""); }} style={{ width: 36, height: 36, borderRadius: "50%", background: c, border: f.avatar_color === c ? "3px solid var(--ink)" : "2px solid var(--line)", cursor: "pointer" }} />
            ))}
          </div>
        </div>
        </fieldset>

        {error && <p role="alert">{error}</p>}
        <button className="btn" style={{ marginTop: 16 }} onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save profile"}</button>
      </div>
    </div>
  );
}
