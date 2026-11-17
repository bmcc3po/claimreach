import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptAgeCohorts, datePreset, inReportRange } from './partner-report-view';
import type { PartnerReportRow } from './partner-report';
const row = (receivedAt: string|null) => ({receivedAt}) as PartnerReportRow;
test('Pacific midnight boundaries partition recent, older, unknown and future without overlap', () => {
  const rows = [row('2026-11-16T07:59:59Z'), row('2026-11-16T08:00:00Z'), row('2026-11-10T08:00:00Z'), row('2026-11-10T07:59:59Z'), row('2026-11-17T08:00:00Z'),row(null),row('bad date')];
  const c = receiptAgeCohorts(rows,'2026-11-16T20:00:00Z');
  assert.deepEqual([c.recent.length,c.older.length,c.unknown.length,c.future.length],[3,1,2,1]);
  assert.equal(new Set(Object.values(c).flat()).size,rows.length);
  for(const [key,preset] of [['recent','Last 7 days'],['older','Leads 7 days plus']] as const){
    const range = datePreset(preset,'2026-11-16T20:00:00Z');
    assert.deepEqual(rows.filter(r=>inReportRange(r,range.from,range.to)),c[key]);
  }
});
test('calendar-only receipt dates retain their day and DST does not shift the seven-day split', () => {
  const rows = [row('2026-10-26'),row('2026-10-25'),row('2026-11-01T08:30:00Z'),row('2026-11-01T09:30:00Z')];
  const c = receiptAgeCohorts(rows,'2026-11-02T07:59:59Z');
  assert.equal(c.recent.length,3); assert.equal(c.older.length,1);
  assert.deepEqual(datePreset('Leads 7 days plus','2026-11-02T07:59:59Z'),{from:'',to:'2026-10-25'});
});
