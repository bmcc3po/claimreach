"use client";
import { useId, useState } from "react";
import "./agent-help.css";

type Flow = "mva" | "netfly";
type Step = { title: string; brief: string; detail: string; picture: string[]; action: string };
const guides: Record<Flow, { title: string; intro: string; steps: Step[]; help: [string, string][] }> = {
  mva: {
    title: "INNO MVA", intro: "Talk → sign → finish the call → review → send.",
    steps: [
      { title: "Open the right client", brief: "Start with NEW LEADS or the scheduled callback.", detail: "Search before creating a file. Check the name and phone. Open the existing file for a callback; use CREATE NEW LEAD only for someone new. Use Call or Text when needed.", picture: ["NEW LEADS", "Client name · phone", "Calls: 0 · First call"], action: "Open the client" },
      { title: "Listen and fill the intake", brief: "Write their story. Tap answers as they come up.", detail: "Use the story box for what happened. Follow the next question and the missing-answer links. If a passenger wants representation, enter their details and send their own agreement from the passenger card.", picture: ["Tell me what happened", "Their story, in your words…", "✓ Answers captured"], action: "Follow NEXT" },
      { title: "Get the signature", brief: "Send the agreement. Stay with the client while they sign.", detail: "Check the client's delivery number or email, then send. When they say they signed, use Check signed status now. Open client-signed retainer, review it, and select Approve signed copy. A sent link is not a signature.", picture: ["Sent ✓", "Opened ✓", "Signed ✓"], action: "Check signed status now" },
      { title: "Finish the agreement and call", brief: "Complete the office step, then record the outcome.", detail: "Collect DOB and SSN, or record that the client will provide SSN to the firm. Complete the agreement. Finish the call, choose its actual outcome, and for a signed call use Save & review intake. If answers are still saving, keep the file open and retry when prompted.", picture: ["DOB · SSN or declined", "Complete the agreement", "Call outcome: Signed"], action: "Save & review intake" },
      { title: "Check your work", brief: "Review the answers and both PDFs on this screen.", detail: "Fix any missing answer using its link. Open 1. Review intake PDF and 2. Review signed retainer + HIPAA/HITECH. Close each preview to return to the same file. Check the three review boxes only after reviewing the file.", picture: ["1. Review intake PDF", "2. Review signed retainer + HIPAA/HITECH", "☑ Intake   ☑ Agreement   ☑ Criteria"], action: "Review both PDFs" },
      { title: "Send and look for confirmation", brief: "Check recipients, send the packet, and wait for Sent to firm.", detail: "Confirm the firm address and Copy to Brett. Add other recipients only if needed. Click FILE IS READY FOR FIRM — SEND PACKET and confirm. File sent! You're all done. and the sent time confirm success. Saving the call or approving the file alone does not send it. The seven-day return clock starts with confirmed delivery.", picture: ["To firm · Copy to Brett", "FILE IS READY FOR FIRM — SEND PACKET", "✓ Sent to firm · 7-day return window"], action: "Send packet → confirm" },
    ],
    help: [
      ["Client says they signed, but I’m stuck", "Use Check signed status now in the retainer section. Once confirmed, open and approve the client-signed copy, then complete the office step. If status remains unconfirmed, keep their answers and report the exact message; do not create another agreement just to change its status."],
      ["Send to a different phone number", "In the intake's Send agreement again section, choose Send to a different number. Enter the corrected number, confirm it with the client, and select Text agreement to this number. A signed agreement uses the correction flow; do not replace a completed agreement just to resend a copy."],
      ["Send a passenger their own agreement", "Add a passenger → Wants representation: Yes. Enter their name and contact details, then use their own agreement controls on that card. Each passenger needs their own file and signature; the driver's signature does not cover them."],
      ["The client doesn’t qualify", "Use Finish call and record outcome, choose the appropriate outcome and reason, and save. Do not choose Signed unless the agreement really is signed."],
      ["Did it actually go to the firm?", "Look for Sent to firm with a sent time and the seven-day return window. Dispo saved, signed, and ready for review are earlier steps. If sending fails, keep the file open, read the error, and retry after the issue is fixed."],
    ],
  },
  netfly: {
    title: "NETFLY", intro: "A warm welcome. Confirm what we know. Fill the small gaps.",
    steps: [
      { title: "Open their NETFLY file", brief: "Read the handoff note and confirm you have the right client.", detail: "Open the existing NETFLY file. For a new client, paste the whole NETFLY email, check the contact details it fills in, and select Create NETFLY file. The case details and original note carry over. Upload the signed PDF on the file. Mark I'm speaking with this client while connected. Confirm phone, email and address; correct anything that changed.", picture: ["Paste the NETFLY email", "Check name · phone · email", "Create NETFLY file"], action: "Open their file → welcome the client" },
      { title: "Welcome them and talk about care", brief: "Listen first. Keep shorthand in Call notes.", detail: "Follow the welcoming prompts: treatment already received, where and when, and help getting checked. Confirm the accident details from the note instead of starting over. Use the answer buttons while they talk. Fill from notes offers suggestions: check them before using them; it does not confirm facts for the client.", picture: ["Call notes · shorthand is fine", "Their words go here…", "Near home   Near work   Either"], action: "Fill from notes → check suggestions" },
      { title: "Fill the gaps naturally", brief: "Police, insurance, treatment preferences, passengers and photos.", detail: "Ask for missing report number, reporting agency, accident date and location; available insurance and claim details; treatment timing and place; and who else was in the car. Confirm convenient care times and location. Unknown details can stay marked for follow-up. Ask permission for the document text and use the photo tools for their replies.", picture: ["Details match / Record changes", "Police · Insurance · Treatment", "Photos and documents"], action: "Confirm what you already know" },
      { title: "Close warmly and record the call", brief: "Explain the 24–48 hour callback. Save the actual result.", detail: "Read the closing reminders, invite questions, and give the NETFLY office number: (205) 831-5040. After the call, mark complete or incomplete and its outcome, confirm the callback promise, then click Record call result. An incomplete file stays open for the callback.", picture: ["You’re in good hands", "Callback within 24–48 hours", "Ontake complete / Not complete"], action: "Record call result" },
      { title: "Review the signed PDF and hand off", brief: "Review the file, then send it for supervisor review.", detail: "Open signed PDF here, check it belongs to this client, and record the signed-PDF review. Resolve any correction and verify the handoff details. Select Send completed ontake to review. Ready for supervisor review confirms this handoff; it does not mean the file was emailed to the firm.", picture: ["Open signed PDF here", "Record signed-PDF review", "✓ Ready for supervisor review"], action: "Send completed ontake to review" },
      { title: "Confirm the firm received the file", brief: "Supervisor step: deliver the intake and signed originals.", detail: "The supervisor must check the completed intake and NETFLY's signed original packet, then confirm delivery to the firm and Brett. NETFLY currently ends at supervisor review; it does not yet offer the same final agent-send button as INNO MVA. Do not mark it sent based only on Ready for supervisor review. Keep it open until the actual firm handoff is confirmed.", picture: ["Intake + NETFLY signed originals", "Supervisor confirms firm handoff", "Ready for review ≠ Sent to firm"], action: "Supervisor confirms delivery" },
    ],
    help: [
      ["NETFLY already asked all this", "Read back the facts already on screen and use Details match. Ask only about gaps or changes. Keep notes while they speak; do not read every field as another questionnaire."],
      ["Can notes fill the boxes for me?", "Yes. Type shorthand in Call notes and use Fill from notes. Review the suggested answers, keep the accurate ones, then apply them. Existing answers stay intact. Missing or uncertain facts still need the client's confirmation."],
      ["The note or signed PDF is missing", "Keep the file and collect what you can. Paste the handoff note when available; upload the signed retainer through its upload control. The final review step explains what is still needed. Do not send the client a new retainer simply because the imported copy is missing."],
      ["The call is incomplete", "Choose Ontake not complete and Client needs callback to finish. Record the result and the callback promise. Use the missing-detail list on the next call; do not mark the file complete to clear a warning."],
      ["Which phone number do I give them?", "NETFLY: (205) 831-5040. INNO MVA uses (404) 348-4511. These are client contact numbers, not instructions to change your outbound caller ID."],
    ],
  },
};

export function AgentGuideContent({ flow }: { flow: Flow }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const guide = guides[flow], step = guide.steps[selected];
  return <div className="agent-guide">
    <a className="ag-back" href="/app/help">← Agent guides</a>
    <h2>{guide.title}: your quick guide</h2><p className="ag-intro">{guide.intro}</p>
    <div className="ag-layout"><ol className="ag-steps">{guide.steps.map((s, i) => <li key={s.title}><button type="button" aria-current={i === selected ? "step" : undefined} aria-controls={`${id}-detail`} onClick={() => setSelected(i)}><span className="ag-number">{i + 1}</span><span><strong>{s.title}</strong><small>{s.brief}</small></span></button></li>)}</ol>
      <section id={`${id}-detail`} className="ag-detail" aria-live="polite" aria-atomic="true"><p className="ag-eyebrow">STEP {selected + 1} OF {guide.steps.length}</p><h3>{step.title}</h3>
        <figure className="ag-picture"><figcaption>Simplified screen example</figcaption><div className="ag-picture-bar"><i/><i/><i/><span>ClaimReach Desk</span></div><div className="ag-picture-body">{step.picture.map((line, i) => <div className={`ag-picture-row${i === step.picture.length - 1 ? " ag-highlight" : ""}`} key={line}>{line}</div>)}</div></figure>
        <p>{step.detail}</p><div className="ag-next-click"><span aria-hidden="true">↗</span><div><small>YOUR NEXT CLICK</small><strong>{step.action}</strong></div></div>
        <div className="ag-pager"><button type="button" disabled={selected === 0} onClick={() => setSelected(selected - 1)}>← Previous</button><button type="button" disabled={selected === guide.steps.length - 1} onClick={() => setSelected(selected + 1)}>Next step →</button></div>
      </section></div>
    <section className="ag-help"><h3>Stuck? Start here.</h3>{guide.help.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    <p className="ag-footnote">This guide does not change or send anything in your client’s file.</p>
  </div>;
}
