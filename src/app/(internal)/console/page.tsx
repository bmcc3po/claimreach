export const runtime = "edge";
import { redirect } from "next/navigation";

// "Take a call" now opens the App (the MVA call screen, wide on a desktop).
// The old firm picker and its forms are archived at /console/archive, kept
// reachable by link but out of the menu.
export default function ConsolePage() {
  redirect("/app?new=1");
}
