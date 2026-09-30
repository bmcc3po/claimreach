// Until other campaigns are approved for launch, non-owner internal staff work
// INNO MVA only in the dashboard, queue and Desk. Database RLS is the data
// boundary; this route fence keeps unfinished site tools out of their workflow.
export function pilotStaffPageAllowed(path: string): boolean {
  return path === "/" || path === "/dashboard" || path === "/queue"
    || path === "/set-password"
    || path === "/app" || path.startsWith("/app/");
}

export function pilotStaffApiAllowed(path: string, method = "GET"): boolean {
  if (path === "/api/me/password") return method === "POST";
  if (path === "/api/case/details") return method === "POST";
  if (path === "/api/calls/esign-setup") return false;
  if (path === "/api/statuses" || path === "/api/dq-reasons") return method === "GET" || method === "HEAD";
  return path === "/api/leads" || path === "/api/notes" || path === "/api/places"
    || path === "/api/firm-delivery" || path.startsWith("/api/calls/");
}

