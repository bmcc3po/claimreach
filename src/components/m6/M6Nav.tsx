"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Three links plus property and guidance. This is a contact tool, not a CRM:
// every screen added here is a screen someone has to decide not to look at.
const LINKS = [
  { href: "/m6", label: "Today" },
  { href: "/m6/cases", label: "Cases" },
  { href: "/m6/property", label: "Property" },
  { href: "/m6/guidance", label: "Guidance" },
];

export default function M6Nav({
  userName, role, children,
}: { userName: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="m6-shell">
      <header className="m6-top">
        <div className="m6-top-in">
          <Link href="/m6" className="m6-lockup" aria-label="Motel 6 client care — Innovative Intake, ClaimReach, Turnbull Moak & Pendergrass">
            <span className="m6-logo-pad m6-logo-pad-inno">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/innovative-intake.png"
                alt="Innovative Intake"
                className="m6-logo m6-logo-inno"
              />
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/innovative-mark-on-dark.png"
              alt=""
              aria-hidden="true"
              className="m6-logo m6-logo-inno-mark"
            />
            <span className="m6-lockup-rule" aria-hidden="true" />
            <span className="m6-logo-pad m6-logo-cr-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cr-mark.png" alt="ClaimReach" className="m6-logo m6-logo-cr" />
            </span>
            <span className="m6-lockup-rule" aria-hidden="true" />
            <span className="m6-logo-pad m6-logo-pad-tmp">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/tmp-wordmark-ink.png"
                alt="Turnbull Moak & Pendergrass"
                className="m6-logo m6-logo-tmp"
              />
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/tmp-mark-on-dark.png"
              alt=""
              aria-hidden="true"
              className="m6-logo m6-logo-tmp-mark"
            />
          </Link>
          <nav className="m6-links">
            {LINKS.map((l) => {
              const on = l.href === "/m6" ? path === "/m6" : path.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={`m6-link${on ? " on" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="m6-who">
            <span className="m6-who-name">{userName}</span>
            <span className="m6-who-role">{role === "firm" ? "Turnbull" : "Innovative"}</span>
          </div>
        </div>
      </header>
      <main className="m6-main">{children}</main>
    </div>
  );
}
