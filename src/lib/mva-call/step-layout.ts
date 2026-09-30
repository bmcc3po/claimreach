import { INTAKE_SECTIONS, sectionOf } from './intake';

const questionsIn = (...sections: string[]) => INTAKE_SECTIONS
  .filter(section => sections.includes(section.id)).flatMap(section => section.questions);

/** Presentation groups only. The canonical question definitions and save paths
 * stay in intake.ts and the call engine. Vehicle and passengers share a stored
 * section, so the question position distinguishes their two screens. */
export const INTAKE_STEPS: readonly { id: string; label: string; questions: readonly string[] }[] = [
  { id: 'intro', label: 'Intro & incident', questions: questionsIn('incident', 'notes') },
  { id: 'care', label: 'Injury & treatment', questions: questionsIn('injury', 'treatment') },
  { id: 'coverage', label: 'Insurance & vehicle', questions: [...questionsIn('insurance'), 'car'] },
  { id: 'passengers', label: 'Other passengers', questions: ['people'] },
  { id: 'retainer', label: 'Retainer', questions: [] as string[] },
];

export function stepIndexForPosition(section: string | null, question: string | null): number {
  if (section === 'retainer') return INTAKE_STEPS.length - 1;
  const current = question && sectionOf(question) === section ? question : null;
  const index = INTAKE_STEPS.findIndex(step => current
    ? step.questions.includes(current)
    : step.questions.some(id => sectionOf(id) === section));
  return index < 0 ? 0 : index;
}

export function savedCallView(preference: string | null): 'chore' | 'form' | 'steps' {
  return preference === 'form' || preference === 'steps' ? preference : 'chore';
}
