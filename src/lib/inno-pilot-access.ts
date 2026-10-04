// Until other campaigns are approved for launch, non-owner internal staff work
// INNO MVA only in the dashboard, queue and Desk. Database RLS is the data
// boundary; this route fence keeps unfinished site tools out of their workflow.
export function pilotStaffPageAllowed(path: string): boolean {
  return path === "/" || path === "/dashboard" || path === "/queue"
    || path === "/set-password"
    || path === "/app" || path.startsWith("/app/");
}

export function pilotStaffApiAllowed(path: string, method = "GET"): boolean {
  if (path === "/api/netfly") return method === "GET" || method === "POST";
  // These exact handlers enforce the internal organization, NETFLY matter,
  // document scope and current packet review. Let agents reach those checks.
  if (path === "/api/netfly/retainer") return ["GET", "HEAD", "POST"].includes(method);
  if (path === "/api/netfly/delivery") return ["GET", "HEAD", "POST"].includes(method);
  if (path === "/api/netfly/agreement-import") return method === "POST";
  if (path === "/api/netfly/notes") return method === "POST";
  if (path === "/api/netfly/documents") return ["GET", "POST", "PATCH"].includes(method);
  // The handler limits non-exporting agents to one RLS-visible intake preview.
  if (path === "/api/export/intake-pdf") return method === "GET" || method === "HEAD";
  if (path === "/api/me/password") return method === "POST";
  if (path === "/api/case/details") return method === "POST";
  if (path === "/api/calls/esign-setup") return false;
  if (path === "/api/statuses" || path === "/api/dq-reasons") return method === "GET" || method === "HEAD";
  return path === "/api/leads" || path === "/api/notes" || path === "/api/places"
    || path === "/api/firm-delivery" || path.startsWith("/api/calls/");
}

