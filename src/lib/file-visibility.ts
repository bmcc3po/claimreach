/** Archive is a file-wide visibility rule. Child rows and documents remain
 * intact; everyday lists must scope their parent lead before counting rows. */
export function isActiveFile(lead: { archived_at?: string | null } | null | undefined): boolean {
  return !!lead && !lead.archived_at;
}

/** A cleanup suggestion, never permission to delete or automatically archive.
 * Match complete words so real names such as Testerfield are not classified. */
export function isTestFile(lead: { claimant_name?: string | null; vendor_fields?: any }): boolean {
  return !!lead.vendor_fields?.signing_rehearsal || /\b(TEST|TESTER|NONBINDING|REHEARSAL)\b/i.test(lead.claimant_name || "");
}
