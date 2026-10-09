"use client";
import { FileHeaderDialog } from './FileHeader';
import SignedDecline from './SignedDecline';
import FirmDecision from './FirmDecision';
import { isSignedKey } from '@/lib/statuses';

/** Presentation of existing actions only. Their APIs still verify role,
 * campaign, signature evidence, recipient and the exact matter. */
export default function FileOutcomeActions({ claimId, campaign, status, role, archived = false, onChanged }: {
  claimId: string; campaign?: string | null; status: string; role?: string; archived?: boolean; onChanged?: (status: string) => void;
}) {
  if (archived) return null;
  const inno = campaign === 'INNO MVA';
  return <>
    {inno && isSignedKey(status) && ['owner', 'admin'].includes(role || '') && <FileHeaderDialog key={'bmc:' + claimId} label={status === 'signed_dropped' ? 'Decline details' : 'BMC declined'}>
      <SignedDecline claimId={claimId} statusAction embedded onChanged={onChanged} />
    </FileHeaderDialog>}
    {role === 'owner' && ['delivered', 'retained'].includes(status) && <FileHeaderDialog key={'firm:' + claimId} label="Firm decision">
      <FirmDecision claimId={claimId} onChanged={onChanged} />
    </FileHeaderDialog>}
  </>;
}
