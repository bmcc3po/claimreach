import { INTAKE_SECTIONS, sectionOf } from './intake';

/** Presentation order and phase grouping are shared, including optional fields.
 * Persisted names are unchanged; this is the UI contract, not the export catalog. */
export const QUESTION_ORDER = INTAKE_SECTIONS.flatMap(section => section.questions);
export function questionPhase(id: string): 'story' | 'body' | 'car' {
  const section = sectionOf(id);
  return section === 'incident' ? 'story' : section === 'vehicle' || section === 'notes' ? 'car' : 'body';
}

export const QUESTION_PATHS: Record<string, string[]> = {
  city: ['story.city'], when: ['story.when', 'story.date'], seat: ['story.seat', 'story.seatOther'],
  fault: ['story.fault'], police: ['story.police'], report: ['file.report'],
  pain: ['body.pain', 'body.done.pain', 'body.painNote'], work: ['body.work'],
  seen: ['body.seen', 'body.done.seen'], providers: ['body.providers'], firstAt: ['body.firstAt'],
  lastAt: ['body.lastAt'], stretch: ['body.stretch'], willing: ['body.willing'],
  carrier: ['file.carrier'], exchanged: ['body.exchanged'], coverage: ['body.coverage'],
  uim: ['body.uim'], check: ['body.check'], rep: ['body.rep', 'body.repUnhappy', 'body.repKind'],
  people: ['car.justMe', 'car.people'], car: ['file.vYear', 'file.vMake', 'file.vModel'], notes: ['story.text'],
};
