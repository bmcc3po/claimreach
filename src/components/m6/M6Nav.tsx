"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/m6", label: "Today" },
  { href: "/m6/cases", label: "Cases" },
  { href: "/m6/call", label: "Call" },
  { href: "/m6/crissi", label: "Crissi" },
];

function linkOn(path: string, href: string) {
  if (href === "/m6") return path === "/m6";
  if (href === "/m6/call") return path === "/m6/call";
  if (href === "/m6/cases") return path === "/m6/cases" || path.startsWith("/m6/cases/");
  return path === href || path.startsWith(`${href}/`);
}

export default function M6Nav({
  userName, role, children,
}: { userName: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

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
          <nav className="m6-links m6-links-desk" aria-label="M6">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`m6-link${linkOn(path, l.href) ? " on" : ""}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="m6-who">
            <span className="m6-who-name">{userName}</span>
            <span className="m6-who-role">{role === "firm" ? "Turnbull" : "Innovative"}</span>
          </div>
          <button
            type="button"
            className="m6-burger"
            aria-expanded={open}
            aria-controls="m6-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open && (
          <nav id="m6-menu" className="m6-menu" aria-label="M6 menu">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`m6-menu-link${linkOn(path, l.href) ? " on" : ""}`}>
                {l.label}
              </Link>
            ))}
            <Link href="/m6/property" className="m6-menu-link">Property</Link>
            <span className="m6-menu-who">{userName} · {role === "firm" ? "Turnbull" : "Innovative"}</span>
          </nav>
        )}
      </header>
      <main className="m6-main">{children}</main>
    </div>
  );
}
