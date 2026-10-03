import "@/components/calls/agent-help.css";
export const runtime = 'edge';
export default function AgentHelpPage() {
  return <main className="ag-full-page"><div className="agent-guide"><a className="ag-back" href="/app">← Back to my calls</a><h1>Agent guides</h1><p className="ag-intro">Pick your call. One page, from new lead to firm handoff.</p><div className="ag-guide-cards"><a href="/app/help/inno-mva"><span aria-hidden="true">01</span><h2>INNO MVA</h2><p>Intake → signatures → review → send to firm.</p><strong>Open INNO MVA guide →</strong></a><a href="/app/help/netfly"><span aria-hidden="true">02</span><h2>NETFLY</h2><p>Warm welcome → case details → review → firm handoff.</p><strong>Open NETFLY guide →</strong></a></div><p className="ag-footnote">Tap any step for a screen example and the exact next click.</p></div></main>;
}
