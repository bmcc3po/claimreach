import { CallEngine, type CallApi, type CallProps } from "./engine";

const noAction = () => {};
const noApi: CallApi = {
  sendAgreement: noAction, sendPax: noAction, completeAgreement: noAction,
  resendLink: noAction, sendText: noAction, saveDispo: noAction,
  home: noAction, ask: noAction,
};

/** Server and agent UI use the same intake question rules. Missing saved
 * answers fail closed; a signed packet does not make the intake complete. */
export function missingRequiredMvaIntake(saved: unknown): string[] {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return ["Intake answers"];
  return mvaIntakeReview(saved).missing.map((item: { label: string }) => item.label);
}

/** Same engine and persisted answers as the agent's review sheet. */
export function mvaIntakeReview(saved: unknown) {
  const props: CallProps = {
    callerName: "Client", agentName: "Reviewer", firmSpoken: "Firm", textFrom: "",
    startedAt: Date.now(), saved, reasons: { esign: [], dq: [], callback: [], ni: [] },
    notifyDefaults: [], esign: { status: "completed", configured: true, pax: {} },
  };
  const engine = new CallEngine(props, noApi);
  return engine.renderVals().fi;
}
