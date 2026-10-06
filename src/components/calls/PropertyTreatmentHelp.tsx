"use client";
import { useId, useState } from "react";
import { matchingCoachingTopics, PROPERTY_TREATMENT_SOURCE } from "@/lib/property-treatment-coaching";
import "./property-treatment-help.css";

export default function PropertyTreatmentHelp({ compact = false, query }: { compact?: boolean; query?: string }) {
  const [search, setSearch] = useState("");
  const id = useId();
  const term = query ?? search;
  const topics = matchingCoachingTopics(term);
  return <section className={`pt-help${compact ? " pt-compact" : ""}`} aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>Property damage &amp; treatment</h2><p>A little reassurance. One clear next step.</p></header>
    {query === undefined && <label className="pt-search">Find a talking point<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try rental, no insurance, or missed treatment" /></label>}
    {!compact && <p className="pt-intro">Listen first. Open the question that fits, use the short response in your own voice, and return to the conversation. These talking points are shared by INNO MVA and NETFLY.</p>}
    <div className="pt-topics">{(["Car & insurance", "Treatment"] as const).map(category => {
      const group = topics.filter(topic => topic.category === category);
      return group.length ? <div key={category}><h3>{category}</h3>{group.map(topic => <details key={topic.id} className="pt-topic">
        <summary>{topic.question}</summary><div className="pt-answer"><p className="pt-say">{topic.say}</p><p className="pt-note"><strong>For the agent:</strong> {topic.note}</p></div>
      </details>)}</div> : null;
    })}</div>
    {!topics.length && <p className="pt-empty" role="status">No talking point matches. Try “rental” or “treatment”.</p>}
    <footer>{compact ? <a href="/app/help/property-treatment" target="_blank" rel="noopener noreferrer">Open the full training guide ↗</a> : <>
      <p>Based on Innovative Intake’s <a href={PROPERTY_TREATMENT_SOURCE} target="_blank" rel="noopener noreferrer">original training PDF ↗</a>. The responses above are adapted for live calls. Confirm firm policy with a supervisor and leave medical decisions to a clinician.</p>
      <details><summary>Reference checks</summary><ul>
        <li><a href="https://content.naic.org/consumer/auto-insurance.htm" target="_blank" rel="noopener noreferrer">NAIC: auto insurance and rental coverage</a></li>
        <li><a href="https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_8_current_clients_specific_rules/" target="_blank" rel="noopener noreferrer">ABA Model Rule 1.8: financial assistance and exceptions</a> — state rules and firm policy govern.</li>
        <li><a href="https://medlineplus.gov/ency/article/001927.htm" target="_blank" rel="noopener noreferrer">MedlinePlus: recognizing medical emergencies</a></li>
      </ul></details>
    </>}</footer>
  </section>;
}
