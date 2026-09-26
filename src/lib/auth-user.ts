import { cache } from "react";
import { supabaseServer } from "@/lib/supabase-server";

// One Auth server check per page load. The layout and the page each used to
// ask on their own, one after the other, on top of the check middleware
// already does. Same call, same cookies, same answer; React's cache() just
// shares it between them for the life of one request. Pages and layouts only:
// API routes are outside middleware and keep calling getUser() themselves.
export const authUser = cache(async () => {
  const sb = await supabaseServer();
  return sb.auth.getUser();
});
