"use client";

import { useEffect, useRef } from 'react';
import ChoreList from './ChoreList';

/** Five screens over the existing All Questions renderer. Filtering resolved
 * questions preserves its controls, branching, scripts and retainer actions. */
export default function StepByStep({ v }: { v: any }) {
  const step = v.fi.step;
  const heading = useRef<HTMLHeadingElement | null>(null);
  const jump = useRef<HTMLDetailsElement | null>(null);
  const previousStep = useRef<number | null>(null);
  useEffect(() => {
    const arriving = previousStep.current === null;
    if (previousStep.current !== step.index && jump.current) jump.current.open = false;
    previousStep.current = step.index;
    if (arriving || !v.fi.target) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [step.index, v.fi.jump]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = v.fi.sections.map((section: any) => ({
    ...section, questions: section.questions.filter((question: any) => step.questions.includes(question.id)),
  })).filter((section: any) => section.questions.length);
  const rows = v.fi.chore.rows.filter((row: any) => row.id === 'retainer'
    ? step.id === 'retainer' : sections.some((section: any) => section.id === row.id))
    .map((row: any) => {
      const questions = sections.find((section: any) => section.id === row.id)?.questions;
      const required = questions?.filter((question: any) => !question.optional);
      const done = required?.length ? required.every((question: any) => question.answered)
        : questions?.some((question: any) => question.answered);
      return { ...row, label: row.id === 'vehicle' && step.id === 'passengers' ? 'Other passengers' : row.label,
        status: questions ? (done ? 'done' : 'now') : row.status,
        enter: () => step.enterSection(row.id) };
    });
  const filtered = { ...v, fi: { ...v.fi, sections, chore: { ...v.fi.chore, rows } } };

  return <div className="step-intake" data-intake-step={step.id}>
    <header className="step-intake-heading">
      <span className="step-intake-count">Training Mode · Step {step.number} of {step.total}</span>
      <h1 ref={heading} tabIndex={-1}>{step.label}</h1>
      <details ref={jump} className="step-intake-jump">
        <summary>Jump to another call step</summary>
        <nav className="step-intake-nav" aria-label="Intake stages">
          {step.items.map((item: any, index: number) => <button key={item.id} type="button"
            className={item.on ? 'step-intake-current' : ''} aria-current={item.on ? 'step' : undefined}
            onClick={item.go}><b>{index + 1}</b><span>{item.label}</span></button>)}
        </nav>
      </details>
    </header>
    {step.id === 'retainer' && !v.sendReady && <p className="step-intake-note">DOB and SSN are optional before sending. You can collect them now or after the client signs.</p>}
    <ChoreList v={filtered} sectionActions={false} scrollSections={false} />
    {step.id === 'retainer' && v.fi.chore.finish.ask && <div className="ch-note ch-note-bad" role="alert">{v.fi.chore.finish.askText}</div>}
  </div>;
}
