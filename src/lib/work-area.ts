/** A view boundary, never an authorization grant. Existing RLS and role gates remain. */
export type WorkArea = 'mva' | 'other';
export const MVA_WORK_TYPES = ['mva', 'netfly_secondary'];
export const workArea = (value?: string | null): WorkArea => value === 'other' ? 'other' : 'mva';
export const inWorkArea = (type: string | null | undefined, area: WorkArea) => MVA_WORK_TYPES.includes(type || '') === (area === 'mva');
export function scopeWorkArea(query: any, area: WorkArea, column = 'case_type') {
  return area === 'mva' ? query.in(column, MVA_WORK_TYPES) : query.or(`${column}.is.null,${column}.not.in.(${MVA_WORK_TYPES.join(',')})`);
}
export function areaHref(href: string, area: WorkArea) {
  return area === 'other' ? `${href}${href.includes('?') ? '&' : '?'}area=other` : href;
}
