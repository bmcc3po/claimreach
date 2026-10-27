import { loadHistoricalSignatures } from './historical-signatures';
/** Same evidence as exports; a rejection never removes historical signing. */
export async function reportSignatures(db:any,claims:any[]) {
  const evidence=await loadHistoricalSignatures(db,claims);
  return new Set([...evidence].filter(([,e])=>e.ever_signed==='confirmed').map(([id])=>id));
}
