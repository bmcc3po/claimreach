// Until other campaigns are approved for launch, non-owner internal staff work
// INNO MVA only in the dashboard, queue and Desk. Database RLS is the data
// boundary; this route fence keeps unfinished site tools out of their workflow.
export function pilotStaffPageAllowed(path: string): boolean {
  return path === "/" || path === "/dashboard" || path === "/queue"
    || path === "/app" || path.startsWith("/app/");
}

export function pilotStaffApiAllowed(path: string): boolean {
  if (path === "/api/calls/esign-setup") return false;
  return path === "/api/leads" || path === "/api/notes" || path === "/api/places"
    || path === "/api/firm-delivery" || path.startsWith("/api/calls/");
}
