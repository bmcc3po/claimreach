"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useM6Crissi } from "./M6CrissiContext";

const LINKS = [
  { href: "/m6", label: "Today" },
  { href: "/m6/cases", label: "Cases" },
  { href: "/m6/property", label: "Property lookup" },
  { href: "/m6/brand", label: "Brand & owner" },
  { href: "/m6/guidance", label: "Crissi" },
  { href: "/m6/drips", label: "Drip settings" },
  { href: "/m6/pfs", label: "Questionnaire" },
  { href: "/m6/campaigns", label: "Email campaigns" },
  { href: "/m6/users", label: "Add a user" },
  { href: "/m6/lor", label: "LOR / letters" },
];

function linkOn(path: string, href: string) {
  if (href === "/m6") return path === "/m6";
  if (href === "/m6/cases") return path === "/m6/cases" || path.startsWith("/m6/cases/");
  if (href === "/m6/guidance") return path === "/m6/guidance" || path.startsWith("/m6/guidance/") || path === "/m6/crissi";
  return path === href || path.startsWith(`${href}/`);
}

export default function M6Nav({
  userName, role, children,
}: { userName: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { openCrissi } = useM6Crissi();

  useEffect(() => { setOpen(false); }, [path]);

  const links = LINKS.map((l) => (
    <Link key={l.href} href={l.href} className={`m6-side-link${linkOn(path, l.href) ? " on" : ""}`}>
      {l.label}
    </Link>
  ));

  return (
    <div className={`m6-shell${open ? " nav-open" : ""}`}>
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
          <div className="m6-who">
            <span className="m6-who-name">{userName}</span>
            <span className="m6-who-role">{role === "firm" ? "Turnbull" : "Innovative"}</span>
          </div>
          <button
            type="button"
            className="m6-burger"
            aria-expanded={open}
            aria-controls="m6-side"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      {open && <button type="button" className="m6-nav-back" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="m6-body">
        <nav id="m6-side" className="m6-side" aria-label="M6">
          {links}
          <button type="button" className="m6-side-link m6-side-crissi" onClick={() => { setOpen(false); openCrissi(null); }}>
            Crissi (crisis)
          </button>
          <span className="m6-menu-who">{userName} · {role === "firm" ? "Turnbull" : "Innovative"}</span>
        </nav>
        <main className="m6-main">{children}</main>
      </div>
    </div>
  );
}
