"use client";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFieldAutosave } from "../useFieldAutosave";
import { splitUsAddress, joinUsAddress, mailColumnsFrom } from "@/lib/us-address";

type ContactSaveRef = MutableRefObject<(() => Promise<boolean>) | null>;
export default function ClientContact({ leadId, claimId, saveRef }: { leadId: string; claimId: string; saveRef: ContactSaveRef }) {
  const [contact, setContact] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setContact(null); setError("");
    const query = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
    const previousSave = saveRef.current;
    (async () => {
      if (previousSave && !(await previousSave())) throw new Error("Client details have not saved. Retry before reloading them.");
      return fetch(`/api/calls/file?${query}`, { cache: "no-store" });
    })().then(async (response) => {
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || "Client details did not load.");
      if (active) setContact(body.contact || {});
    }).catch((cause) => { if (active) setError(cause.message || "Client details did not load."); });
    return () => { active = false; };
  }, [leadId, claimId, retry]);
  return <section className="inline-client-contact ch-wide" aria-label="Client contact details">
    {contact ? <ContactCard key={`${leadId}:${claimId}`} leadId={leadId} initial={contact} saveRef={saveRef} /> : error ? <div role="alert">{error} <button type="button" className="cc-chip" onClick={() => setRetry((n) => n + 1)}>Retry client details</button></div> : <p>Loading client details…</p>}
  </section>;
}

function ContactCard({ leadId, initial, saveRef }: { leadId: string; initial: Record<string, string>; saveRef: ContactSaveRef }) {
  // A record that came in with the whole address on the street line
  // ("18475 Zurich Ln, Tinley Park, IL 60477") shows split. Merely opening
  // the file never writes contact data; normalization accompanies an address edit.
  const first = (() => {
    const f = {
      first_name: initial.first_name || "", last_name: initial.last_name || "", claimant_name: initial.claimant_name || "",
      phone: initial.phone || "", email: initial.email || "",
      home_phone: initial.home_phone || "", work_phone: initial.work_phone || "",
      mail_addr1: initial.mail_addr1 || "", mail_city: initial.mail_city || "",
      mail_state: initial.mail_state || "", mail_zip: initial.mail_zip || "",
    };
    const cols = mailColumnsFrom(f, f.mail_addr1);
    return { f: cols ? { ...f, ...cols } : f, tidy: cols };
  })();
  const [open, setOpen] = useState(false);
  // What the record holds, so the call's own copy follows a save exactly.
  const saved = useRef<Record<string, string>>({
    first_name: initial.first_name || "", last_name: initial.last_name || "", claimant_name: initial.claimant_name || "",
    phone: initial.phone || "", email: initial.email || "",
    home_phone: initial.home_phone || "", work_phone: initial.work_phone || "",
    mail_addr1: initial.mail_addr1 || "", mail_city: initial.mail_city || "",
    mail_state: initial.mail_state || "", mail_zip: initial.mail_zip || "",
  });
  const acknowledged = useRef<Record<string, string> | null>(null);
  // A save sends only the fields the agent changed, with what they hold when
  // it goes out, so the Activity Log says what really changed and a phone the
  // call just saved is never sent back as its old value (Astra round 7b).
  const { values: f, status, error: msg, edit, incoming, flushAndWait } = useFieldAutosave<Record<string, string>>(() => first.f, {
    delay: 900,
    send: async (patch) => {
      let r: Response;
      try {
        r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "save", lead_id: leadId, lead: patch }) });
      } catch {
        throw new Error("Could not reach the server. The contact did not save.");
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "The contact did not save.");
      acknowledged.current = j.contact || null;
    },
    onSaved: (patch) => {
      const prev = saved.current;
      const s = { ...prev, ...(patch as Record<string, string>) };
      const nameChanged = ["first_name", "last_name", "claimant_name"].some((k) => Object.prototype.hasOwnProperty.call(patch, k));
      if (nameChanged) {
        const canonical = acknowledged.current;
        for (const key of ["first_name", "last_name", "claimant_name"]) if (typeof canonical?.[key] === "string") s[key] = canonical[key];
        if (!canonical?.claimant_name) s.claimant_name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
        incoming({ first_name: s.first_name, last_name: s.last_name, claimant_name: s.claimant_name });
      }
      saved.current = s;
      // The call's own copy follows (the File step's home address, the send).
      try {
        window.dispatchEvent(new CustomEvent("cr:contact", { detail: {
          leadId, addr: joinUsAddress({ street: s.mail_addr1, city: s.mail_city, state: s.mail_state, zip: s.mail_zip }),
          phone: s.phone, email: s.email, prevPhone: prev.phone, prevEmail: prev.email,
          ...(nameChanged ? { name: s.claimant_name, previousName: prev.claimant_name || [prev.first_name, prev.last_name].filter(Boolean).join(" "), first_name: s.first_name, last_name: s.last_name, claimant_name: s.claimant_name } : {}),
        } }));
      } catch { /* the console is not on this page */ }
    },
  });
  useEffect(() => { saveRef.current = flushAndWait; }, [saveRef, flushAndWait]);
  // The call saved a contact field onto the record (the PNC's email typed on
  // the send step, the home address on the File step): show it here too. A
  // box with unsaved typing keeps it, and that typing still saves.
  useEffect(() => {
    const on = (e: any) => {
      const d = e?.detail || {};
      if (d.leadId !== leadId) return;
      const upd: Record<string, string> = {};
      for (const k of ["first_name", "last_name", "claimant_name", "phone", "email", "mail_addr1", "mail_city", "mail_state", "mail_zip"]) if (typeof d[k] === "string") upd[k] = d[k];
      if (!Object.keys(upd).length) return;
      saved.current = { ...saved.current, ...upd };
      incoming(upd);
    };
    window.addEventListener("cr:record", on);
    return () => window.removeEventListener("cr:record", on);
  }, [leadId, incoming]);
  const set = (k: string) => (e: any) => {
    const v = e.target.value;
    // Pasting a whole address into the street box fills city, state and ZIP.
    // A pasted address with no ZIP clears the old ZIP instead of keeping one
    // that belonged to the previous address.
    const split = k === "mail_addr1" ? splitUsAddress(v) : null;
    const tidy = k.startsWith("mail_") ? mailColumnsFrom(saved.current, saved.current.mail_addr1) : null;
    const patch = split
      ? { mail_addr1: split.street, mail_city: split.city, mail_state: split.state, mail_zip: split.zip }
      : { [k]: k === "mail_state" ? v.toUpperCase() : v };
    // Current displayed address values preserve earlier unsaved typing too.
    edit({ ...(tidy ? { ...tidy, mail_addr1: f.mail_addr1, mail_city: f.mail_city, mail_state: f.mail_state, mail_zip: f.mail_zip } : {}), ...patch });
  };
  const addr = joinUsAddress({ street: f.mail_addr1, city: f.mail_city, state: f.mail_state, zip: f.mail_zip });
  const gaps = [!f.phone && "cell", !f.mail_addr1 && "street", !f.mail_city && "city", !f.mail_state && "state", !f.mail_zip && "ZIP"].filter(Boolean) as string[];
  return (
    <div className="cc-card cc-contact-card">
      <div className="cc-contact-heading">
        <span className="cc-card-h">Client contact details</span>
        <button type="button" className="cc-chip cc-sm cc-contact-edit" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "Done" : "Edit contact"}</button>
      </div>
      {!open && (<>
        <div className="cc-chk"><span className="cc-chk-k">PNC name</span><span className="cc-chk-v">{[f.first_name, f.last_name].filter(Boolean).join(" ") || f.claimant_name || "Not on file"}</span></div>
        <div className="cc-chk"><span className="cc-chk-k">Cell</span><span className="cc-chk-v">{f.phone || "Not on file"}</span></div>
        {!!f.home_phone && <div className="cc-chk"><span className="cc-chk-k">Home phone</span><span className="cc-chk-v">{f.home_phone}</span></div>}
        {!!f.work_phone && <div className="cc-chk"><span className="cc-chk-k">Work phone</span><span className="cc-chk-v">{f.work_phone}</span></div>}
        <div className="cc-chk"><span className="cc-chk-k">Email</span><span className="cc-chk-v">{f.email || "Not on file"}</span></div>
        <div className="cc-chk"><span className="cc-chk-k">Address</span><span className="cc-chk-v">{addr || "Not on file"}</span></div>
        {gaps.length > 0 && <button type="button" className="cc-cue cc-red" style={{ background: "none", border: 0, padding: 0, marginTop: 6, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(true)}>Missing {gaps.join(", ")}. Tap to add.</button>}
      </>)}
      {open && (<>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ flex: 1, minWidth: 0 }}><span className="cc-lab">FIRST NAME</span><input className="cc-field" type="text" autoComplete="given-name" aria-label="PNC first name" value={f.first_name} onChange={set("first_name")} /></label>
          <label style={{ flex: 1, minWidth: 0 }}><span className="cc-lab">LAST NAME</span><input className="cc-field" type="text" autoComplete="family-name" aria-label="PNC last name" value={f.last_name} onChange={set("last_name")} /></label>
        </div>
        <div className="cc-cue" style={{ marginBottom: 8 }}>Correct the PNC's legal name here. An agreement already sent keeps its original name; send a corrected agreement and the original stays in history.</div>
        <div className="cc-lab">CELL</div>
        <input className="cc-field" type="tel" inputMode="tel" aria-label="Cell" value={f.phone} onChange={set("phone")} />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div className="cc-lab">HOME PHONE</div><input className="cc-field" type="tel" inputMode="tel" aria-label="Home phone" value={f.home_phone} onChange={set("home_phone")} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="cc-lab">WORK PHONE</div><input className="cc-field" type="tel" inputMode="tel" aria-label="Work phone" value={f.work_phone} onChange={set("work_phone")} /></div>
        </div>
        <div className="cc-lab" style={{ marginTop: 8 }}>EMAIL</div>
        <input className="cc-field" type="email" inputMode="email" autoComplete="off" aria-label="Email" value={f.email} onChange={set("email")} />
        <div className="cc-lab" style={{ marginTop: 8 }}>STREET</div>
        <input className="cc-field" type="text" placeholder="Street, or paste the whole address" aria-label="Street address" value={f.mail_addr1} onChange={set("mail_addr1")} />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input className="cc-field" style={{ flex: 2, minWidth: 0 }} type="text" placeholder="City" aria-label="City" value={f.mail_city} onChange={set("mail_city")} />
          <input className="cc-field" style={{ flex: 1, minWidth: 0 }} type="text" placeholder="ST" maxLength={2} aria-label="State" value={f.mail_state} onChange={set("mail_state")} />
          <input className="cc-field" style={{ flex: 1, minWidth: 0 }} type="text" inputMode="numeric" placeholder="ZIP" maxLength={10} aria-label="ZIP" value={f.mail_zip} onChange={set("mail_zip")} />
        </div>
      </>)}
      {status === "saving" && <div className="cc-cue" style={{ marginTop: 6 }}>Saving</div>}
      {status === "saved" && <div className="cc-cue" style={{ marginTop: 6 }}>Saved to the file.</div>}
      {status === "error" && <div className="cc-cue cc-red" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

