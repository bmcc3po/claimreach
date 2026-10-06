import PropertyTreatmentHelp from "@/components/calls/PropertyTreatmentHelp";
import "@/components/calls/agent-help.css";
export const runtime = "edge";
export default function PropertyTreatmentGuidePage() {
  return <main className="ag-full-page"><div className="agent-guide"><a className="ag-back" href="/app/help">← Agent guides</a><PropertyTreatmentHelp /></div></main>;
}
