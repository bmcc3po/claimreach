import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClaimReach",
  description: "Intake and case management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
