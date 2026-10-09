import { pilotStaffApiAllowed } from './inno-pilot-access';

// UI availability mirrors the existing route fence as well as permission.
// This does not grant access or replace enforcement at the API.
export function archiveControlAvailable(role: string, permission: boolean): boolean {
  return permission && (role === 'owner' || pilotStaffApiAllowed('/api/leads/bulk', 'POST'));
}
