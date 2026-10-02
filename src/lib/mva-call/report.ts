// ============================================================================
// The whole case on one page: an automatic summary in plain sentences, the six
// qualifiers, every intake question the way the agent asks it with the answer,
// the PNC's details from after signing, and where the agreement stands.
//
// Built by running the saved answers through the call engine itself, so the
// questions, answers and lights here are exactly what the agent saw on the
// call. One report, used by the print page, "Email the case", the dispo email
// and the signing email. Never the SSN.
// ============================================================================
import { CallEngine, FINE, crashIsoOf } from "./engine";

export interface ReportRow { q: string; a: string; missing?: boolean; flag?: boolean }
export interface ReportSection { id: string; title: string; rows: ReportRow[] }
export interface CaseReport {
  name: string;
  sub: string;
  summary: string[];
  lights: { label: string; state: string; word: string }[];
  sections: ReportSection[];
  agreement: { line: string; signed: boolean; hasPdf: boolean };
}

const LIGHT_WORD: Record<string, string> = { ok: "Good", bad: "Problem", flag: "Check", "": "Not yet" };
const FLAG_WORD: Record<string, string> = { Fault: "fault", Ins: "coverage", Check: "injury payment", Treat: "treatment", Gap: "30-day gap", SOL: "deadline" };
const AGREEMENT: Record<string, string> = { TX: "Texas", FL: "Florida", OTHER: "AL/GA" };

const fmtPhone = (raw: any) => { const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || ""); };
const longDay = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
const when = (ts: any) => { const d = ts ? new Date(ts) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : ""; };
const andList = (xs: string[]) => xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

export function caseReport(lead: any, answers: any, esign?: any, opts: { includeAgreement?: boolean } = {}): CaseReport {
  const sub = esign || null;
  const engineStatus = sub?.status === "completed" || sub?.status === "signed" ? "signed" : sub?.status === "opened" ? "opened" : sub?.status === "sent" ? "sent" : "ready";
  const noop = () => {};
  const e = new CallEngine({
    callerName: lead?.claimant_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "",
    callerPhone: lead?.phone || "", agentName: "", firmSpoken: "", textFrom: "", startedAt: Date.now(),
    saved: answers && typeof answers === "object" ? answers : null,
    reasons: { esign: [], dq: [], callback: [], ni: [] }, notifyDefaults: [],
    esign: { status: engineStatus, configured: true, pax: {} },
  } as any, { sendAgreement: noop, sendPax: noop, completeAgreement: noop, resendLink: noop, sendText: noop, saveDispo: noop, home: noop, ask: noop } as any);
  e.setState({ view: "full", phase: "story" });
  const v = e.renderVals();
  const fi = v.fi;
  const st = e.state.story, b = e.state.body, f = e.state.file, car = e.state.car;
  const name = String(sub?.injured_name || lead?.claimant_name || e.props.callerName || "The client").trim();
  const first = name.split(/\s+/)[0] || "The client";
  const val = (id: string) => { for (const s of fi.sections) for (const q of s.questions) if (q.id === id) return q; return null as any; };
  // A body answer counts only while its question applies (the same rule the call screen uses).
  const ans = (id: string) => (val(id)?.answered ? b[id] : null);

  // ---- the automatic summary: short plain sentences, only what is known ----
  const crash: string[] = [], hurt: string[] = [], ins: string[] = [], close: string[] = [];
  const role = ({ Driver: "the driver", Passenger: "a passenger", Pedestrian: "a pedestrian", Other: "involved" } as any)[st.seat] || "";
  const iso = crashIsoOf(st);
  const where = val("city")?.answered ? val("city").value : "";
  const ago = e.daysAgo();
  if (role || where || iso) {
    crash.push(`${first} was ${role || "in a crash"}${role ? " in a crash" : ""}${st.seat === "Other" && st.seatOther ? ` (${st.seatOther})` : ""}${where ? ` in ${where}` : ""}${iso ? ` on ${longDay(iso)}${ago != null ? `, ${ago === 0 ? "today" : ago === 1 ? "1 day ago" : ago + " days ago"}` : ""}` : ""}.`);
  }
  if (st.fault === "Other driver") crash.push("The other driver was at fault.");
  if (st.fault === "Caller") crash.push(`${first} was at fault.`);
  if (st.fault === "Not clear") crash.push("Fault is not clear yet.");
  if (st.police === "Came out") crash.push(`Police came to the scene${String(f.report || "").trim() ? `, report ${String(f.report).trim()}` : ""}.`);
  if (st.police === "No") crash.push("Police did not come out.");

  const pain = (b.pain || []).filter((p: string) => p !== FINE);
  if (pain.length) hurt.push(`${first} is hurting in the ${andList(pain.map((p: string) => p.toLowerCase()))}.`);
  else if ((b.pain || []).includes(FINE)) hurt.push(`${first} says the pain is minor so far.`);
  if (String(b.painNote || "").trim()) hurt.push(`Pain notes: ${String(b.painNote).trim()}`);
  const seen = (b.seen || []).filter(Boolean);
  const prov = (b.providers || []).filter(Boolean);
  if (seen.includes("Not yet")) hurt.push("Not seen by anyone yet.");
  else if (seen.length) hurt.push(`Seen at ${andList(seen)}${prov.length ? ` (${prov.join(", ")})` : ""}.`);
  const fa = val("firstAt"), la = val("lastAt");
  if (fa?.answered || la?.answered) hurt.push([fa?.answered ? `First seen ${fa.value}` : "", la?.answered ? `last seen ${la.value}` : ""].filter(Boolean).join(", ").replace(/^l/, "L") + ".");
  if (ans("stretch") === "Yes") hurt.push("Has gone more than a month without a visit.");
  if (ans("willing") === "Yes") hurt.push("Willing to get treated.");
  if (ans("willing") === "Maybe") hurt.push("Maybe willing to get treated.");
  if (ans("willing") === "No") hurt.push("Not willing to get treated right now.");
  if (v.gapCard?.show && v.gapCard.value) hurt.push(`30-day check: ${v.gapCard.value}.`);
  if (ans("work") === "Yes") hurt.push("Has missed work.");
  if (ans("work") === "No") hurt.push("No missed work.");
  if (ans("work") === "Not working") hurt.push("Not working.");

  const carrier = f.carrier && f.carrier !== "Pick one" ? f.carrier : "";
  if (carrier) ins.push(`The other driver's insurance is ${carrier}.`);
  if (ans("exchanged") === "Hit and run") ins.push("It was a hit and run.");
  if (ans("exchanged") === "No") ins.push("No information was exchanged.");
  if (ans("exchanged") === "Police handled it") ins.push("Police took the insurance information.");
  const cov = ({ "Full coverage": "has full coverage", "Just liability": "has liability only", "No insurance": "has no insurance" } as any)[ans("coverage")];
  if (cov) ins.push(`${first} ${cov}${ans("uim") === "Yes" ? " with UM/UIM" : ans("uim") === "No" ? " and no UM/UIM" : ""}.`);
  else if (ans("uim") === "Yes") ins.push(`${first} has UM/UIM.`);
  if (ans("check") === "Yes, for injuries") ins.push("Already took a payment for the injuries.");
  if (ans("check") === "Only for the car") ins.push("Paid for the car only, nothing for the injuries.");
  if (ans("check") === "No") ins.push("No injury payment yet.");
  if (ans("rep") === "No") ins.push("Not signed with another attorney.");
  if (ans("rep") === "Yes") ins.push(e.repGood(b) ? "Has another attorney, is unhappy with them, and it sounds like a good case." : "Already has an attorney.");

  if (car.justMe) close.push("No passengers.");
  else if ((car.people || []).length) {
    const n = car.people.length, h = car.people.filter((p: any) => p.hurt === "Yes").length;
    close.push(`${n} ${n === 1 ? "passenger" : "passengers"}${h ? `, ${h} hurt` : ""}.`);
  }
  const vehicle = [f.vYear !== "Year" ? f.vYear : "", f.vMake, f.vModel].filter(Boolean).join(" ");
  if (vehicle) close.push(`Vehicle: ${vehicle}.`);
  const agrName = AGREEMENT[sub?.template_key] ? `${AGREEMENT[sub.template_key]} agreement` : "agreement";
  const signedOn = when(sub?.signed_at || sub?.completed_at);
  const signed = sub?.status === "signed" || sub?.status === "completed";
  const agreementLine = signed
    ? `${sub?.signer_name && sub?.injured_name && sub.signer_name !== sub.injured_name ? `${sub.signer_name} signed the ${agrName} for ${sub.injured_name}` : `Signed the ${agrName}`}${signedOn ? ` on ${signedOn}` : ""}.${sub?.status === "completed" ? " Complete, with DOB and SSN." : " DOB and SSN are added at step 2."}`
    : sub?.status === "sent" || sub?.status === "opened" ? `The ${agrName} was sent${when(sub.sent_at) ? ` on ${when(sub.sent_at)}` : ""} and is not signed yet.` : "No agreement sent yet.";
  // Live intake summaries leave signing to the verified Agreement card. Report
  // exports retain their existing agreement sentence by default.
  if (opts.includeAgreement !== false) close.push(agreementLine.replace(/^Signed/, `${first} signed`));
  const red = (fi.lights?.rows || []).length ? e.gates().filter((g: any) => g.cls.indexOf("bad") >= 0).map((g: any) => FLAG_WORD[g.label] || g.label) : [];
  if (red.length) close.push(`Red flags: ${andList(red)}.`);

  const summary = [crash, hurt, ins, close].map((p) => p.join(" ")).filter(Boolean);

  // ---- every question, as asked, with the answer ----
  const sections: ReportSection[] = fi.sections.map((s: any) => ({
    id: s.id,
    title: s.id === "vehicle" ? "Vehicle and passengers" : s.label,
    rows: s.questions.flatMap((q: any) => {
      const answer = q.id === "when" && q.answered && iso ? `${longDay(iso)}${ago != null ? `, ${ago === 0 ? "today" : ago === 1 ? "1 day ago" : ago + " days ago"}` : ""}` : String(q.value);
      const row: ReportRow = { q: q.id === "fault" ? "Who was at fault" : (q.ask || q.label), a: q.answered ? answer : "Not answered", missing: !q.answered && !q.optional, flag: q.tone === "bad" };
      if (q.id === "notes") return q.answered ? [{ q: "Accident story (agent notes)", a: String(st.text || "").trim() }] : [{ q: "Accident story (agent notes)", a: "None" }];
      if (q.id === "people" && (car.people || []).length) {
        return [row, ...car.people.map((p: any, i: number) => ({ q: `Passenger ${i + 1}`, a: [p.name || "No name yet", p.age, p.hurt === "Yes" ? "hurt" : p.hurt === "No" ? "not hurt" : ""].filter(Boolean).join(", ") }))];
      }
      if (q.id === "rep" && ans("rep") === "Yes") {
        return [row, { q: "Unhappy with them", a: b.repUnhappy ? "Yes" : "Not said" }, ...(b.repKind ? [{ q: "Sounds like", a: b.repKind }] : [])];
      }
      return [row];
    }),
  }));
  if (v.gapCard?.show) {
    const t = sections.find((s) => s.id === "treatment");
    if (t) t.rows.unshift({ q: "30-day check", a: [v.gapCard.value, v.gapCard.sub].filter(Boolean).join(". "), flag: /bad/.test(String(v.gapCard.cls)) });
  }
  const contact: ReportRow[] = [
    { q: "Name", a: name },
    { q: "Phone", a: fmtPhone(lead?.phone) },
    { q: "Email", a: lead?.email || "" },
    { q: "Date of birth", a: f.dob || lead?.dob || "" },
    { q: "Home address", a: f.addr || "" },
    { q: "Driver's license", a: f.dl || "" },
    { q: "Emergency contact", a: [f.ecName, fmtPhone(f.ecPhone), f.ecRel].filter(Boolean).join(", ") },
  ].filter((r) => String(r.a || "").trim());
  sections.unshift({ id: "contact", title: "Client", rows: contact });
  // The file step captures details beyond the intake questionnaire. Keep those
  // saved values in every shared report/export without including the SSN.
  const fileRows: ReportRow[] = [
    { q: "Other driver's insurance", a: carrier },
    { q: "Police report number", a: String(f.report || "").trim() },
    { q: "Vehicle year", a: f.vYear !== "Year" ? String(f.vYear || "") : "" },
    { q: "Vehicle make", a: String(f.vMake || "") },
    { q: "Vehicle model", a: String(f.vModel || "") },
  ].filter((r) => r.a.trim());
  if (fileRows.length) sections.push({ id: "file-details", title: "File details", rows: fileRows });

  return {
    name,
    sub: [lead?.lead_no, lead?.campaign].filter(Boolean).join(", "),
    summary,
    lights: (fi.lights?.rows || []).map((r: any) => ({ label: r.label, state: r.state || "", word: LIGHT_WORD[r.state || ""] })),
    sections,
    agreement: { line: agreementLine, signed, hasPdf: !!sub?.completed_pdf_path },
  };
}

function esc(s: any): string {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

/** The report as an email: plain tables and boxes, prints clean, no heavy ink. */
export function caseReportHtml(r: CaseReport, opts: { link: string; note?: string; attached?: boolean }): string {
  const ink = "#0F2240", sub = "#5F6F87", line = "#E3E8F0", navy = "#14305C";
  const dot: Record<string, string> = { ok: "#16A34A", bad: "#DC2626", flag: "#D97706", "": "#CBD5E1" };
  const lights = r.lights.map((l) => `<td style="padding:4px 12px 4px 0;font-size:13px;color:${l.state === "bad" ? "#B42318" : ink};white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${dot[l.state]};margin-right:6px"></span>${esc(l.label)}: <b>${esc(l.word)}</b></td>`);
  const lightRows = [lights.slice(0, 3), lights.slice(3, 6)].map((row) => `<tr>${row.join("")}</tr>`).join("");
  const sections = r.sections.filter((s) => s.rows.length).map((s) => `
<h3 style="margin:22px 0 8px;font-size:15px;color:${navy}">${esc(s.title)}</h3>
<table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid ${line};border-radius:10px">
${s.rows.map((row, i) => `<tr><td style="padding:9px 12px;color:${sub};vertical-align:top;width:48%;${i ? `border-top:1px solid ${line};` : ""}">${esc(row.q)}</td><td style="padding:9px 12px;vertical-align:top;font-weight:600;color:${row.flag ? "#B42318" : row.missing ? "#94A3B8" : ink};${i ? `border-top:1px solid ${line};` : ""}white-space:pre-wrap">${esc(row.a)}</td></tr>`).join("")}
</table>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:${ink}">
<h2 style="color:${navy};margin:0 0 4px;font-size:22px">${esc(r.name)}</h2>
${r.sub ? `<div style="color:${sub};font-size:13px;margin:0 0 4px">${esc(r.sub)}</div>` : ""}
${opts.note ? `<div style="color:${sub};font-size:13px;margin:0 0 14px">${esc(opts.note)}</div>` : ""}
<div style="border:1px solid ${line};border-radius:12px;padding:14px 16px;background:#F8FAFD;margin:12px 0 14px">
<div style="font-size:13px;font-weight:700;color:${navy};margin:0 0 6px">Case summary</div>
${r.summary.map((p) => `<p style="margin:0 0 8px;font-size:14.5px;line-height:1.5">${esc(p)}</p>`).join("")}
</div>
<table style="border-collapse:collapse;margin:0 0 4px">${lightRows}</table>
${sections}
<h3 style="margin:22px 0 8px;font-size:15px;color:${navy}">Agreement</h3>
<div style="border:1px solid ${line};border-radius:10px;padding:10px 12px;font-size:14px">${esc(r.agreement.line)}${opts.attached ? `<br><span style="color:${sub};font-size:13px">The signed agreement is attached. It has the client's date of birth and SSN on it, so keep it inside the firm.</span>` : ""}</div>
<p style="margin:20px 0 0"><a href="${esc(opts.link)}" style="display:inline-block;background:#22C55E;color:#06290F;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:10px">Open the file in ClaimReach</a></p>
</div>`;
}

/** A short plain-text version, for email clients that do not show HTML. */
export function caseReportText(r: CaseReport, link: string): string {
  const out = [r.name, r.sub, "", ...r.summary, ""];
  for (const s of r.sections) { if (!s.rows.length) continue; out.push(s.title.toUpperCase()); for (const row of s.rows) out.push(`${row.q}: ${row.a}`); out.push(""); }
  out.push("Agreement: " + r.agreement.line, "", link);
  return out.filter((x) => x != null).join("\n");
}
