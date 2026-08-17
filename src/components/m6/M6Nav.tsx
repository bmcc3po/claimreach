"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Three links. This is a contact tool, not a CRM: every screen added here is a
// screen someone has to decide not to look at. If it grows a pipeline and a
// dashboard, people stop opening it and go back to LawRuler.
const LINKS = [
  { href: "/m6", label: "Today" },
  { href: "/m6/cases", label: "Cases" },
];

export default function M6Nav({
  userName, role, children,
}: { userName: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="m6-shell">
      <header className="m6-top">
        <div className="m6-top-in">
          <Link href="/m6" className="m6-mark">
            <span className="m6-mark-no">M6</span>
            <span className="m6-mark-txt">Client care</span>
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
