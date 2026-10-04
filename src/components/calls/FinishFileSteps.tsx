/** Navigation guidance only. Callers supply their existing, verified workflow step. */
export default function FinishFileSteps({ current }: { current: "agreement" | "call" | "review" | "send" | "sent" }) {
  const steps = [
    ["agreement", "Finish agreement"], ["call", "Save call"],
    ["review", "Review answers"], ["send", "Send to firm"],
  ];
  const active = current === "sent" ? steps.length : steps.findIndex(([key]) => key === current);
  return <ol className="finish-file-steps" aria-label="Steps to finish this file">
    {steps.map(([key, label], index) => <li key={key} aria-current={index === active ? "step" : undefined} className={current === "sent" ? "is-done" : ""}>
      <span aria-hidden="true">{current === "sent" ? "✓" : index + 1}</span><span>{label}</span>
    </li>)}
  </ol>;
}
