/** A documented refusal leaves the legal form blank; it never prints zeros. */
export function SsnRefusal({ v }: { v: any }) {
  return <label className="ssn-refusal">
    <input type="checkbox" checked={!!v.ssnRefused} disabled={!!v.identitySavedMode || !!v.agreementClosed} onChange={v.refuseSsn} />
    <span>Client refused SSN; will give it to the firm.</span>
    {v.identitySavedMode && <small>An SSN is already saved securely. Review it before completing the agreement.</small>}
  </label>;
}
