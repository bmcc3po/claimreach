"use client";
import { useState } from "react";

const COLORS = ["#16324f", "#d9982a", "#2f8a52", "#c0392f", "#6d4aff", "#0891b2", "#c2540c"];

export default function ProfileEditor({ me, email }: { me: any; email: string }) {
  const [f, setF] = useState({
    full_name: me?.full_name ?? "", title: me?.title ?? "", phone: me?.phone ?? "",
    bio: me?.bio ?? "", avatar_color: me?.avatar_color ?? COLORS[0], calendly_slug: me?.calendly_slug ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initials = (f.full_name || email).split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  async function save() {
    setSaving(true);
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => {});
    setSaving(false); setSaved(true);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Your profile</h1>
      <div className="card" style={{ padding: 20 }}>
        <div className="row" style={{ gap: 16, marginBottom: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: f.avatar_color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>{initials}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{f.full_name || "Your name"}</div>
            <div className="muted">{f.title || "Add a title"} · {email}</div>
          </div>
        </div>

        <div className="grid2">
          <div className="field"><label>Full name</label><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="field"><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Case Manager / Attorney" /></div>
          <div className="field"><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="field"><label>Calendly slug</label><input value={f.calendly_slug} onChange={(e) => setF({ ...f, calendly_slug: e.target.value })} placeholder="yourname" /></div>
        </div>
        <div className="field" style={{ marginTop: 10 }}><label>Bio</label><textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>

        <div className="field" style={{ marginTop: 10 }}>
          <label>Avatar color</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, avatar_color: c })} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: f.avatar_color === c ? "3px solid var(--ink)" : "2px solid var(--line)", cursor: "pointer" }} />
            ))}
          </div>
        </div>

        <button className="btn" style={{ marginTop: 16 }} onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save profile"}</button>
      </div>
    </div>
  );
}
