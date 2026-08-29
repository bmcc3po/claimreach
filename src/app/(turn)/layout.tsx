export const runtime = "edge";
import "@/components/turn/turn.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClaimTurn — TMP Vegas",
  description: "TMP file desk demo. Fake people. Not Motel 6.",
};

export default function TurnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
