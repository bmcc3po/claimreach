export const runtime = "edge";
import SignedNotifyManager from "@/components/SignedNotifyManager";

// Who gets an email when a client signs. Staff can see it; owners and admins
// change it (the API enforces that).
export default function SignedNotifyPage() {
  return <SignedNotifyManager />;
}
