"use client";
// The App on a computer gets the same spine as the rest of the site: a slim
// navy rail on the left (home, calls, leads, signed, queue) and a bar across the
// top with search, new call and the full site. On a phone neither is shown (the
// App's own back arrow and home screen do that job).
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import GlobalFileSearch from "../GlobalFileSearch";
import SignOut from "@/components/SignOut";
import { primaryNavigation, activeNavigation } from "@/lib/navigation";
import { OPEN_DESK_FILE_EVENT } from "@/lib/mva-call/links";

const fmtPhone = (raw?: string | null) => {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
};

export default function DeskChrome({ name, role }: { name: string; role: string }) {
  const [path, setPath] = useState("");
  const pathname = usePathname();
  useEffect(() => { setPath(pathname + window.location.search); }, [pathname]);
  const owner = role === "owner";
  const links = primaryNavigation(owner);
  const current = activeNavigation(path, links);
  const initials = (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <>
      <nav className="cd-rail" aria-label="Main menu">
        <a className="cd-mark" href="/dashboard" aria-label="ClaimReach dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cr-mark.png" alt="" />
        </a>
        {links.map((l) => (
          <a key={l.href} href={l.href} className={`cd-ic${current === l.href ? " cd-on" : ""}`} title={l.label} aria-label={l.label} aria-current={current === l.href ? "page" : undefined}>
            <Icon name={l.icon} size={19} /><span>{l.label}</span>
          </a>
        ))}
        {owner ? <a className="cd-me" href="/profile" title={`${name || "You"}, profile`} aria-label="Your profile">{initials}</a>
          : <details style={{ marginTop: "auto", position: "relative" }}>
            <summary className="cd-me" title={`${name || "You"}, account menu`} aria-label="Account menu" style={{ cursor: "pointer", listStyle: "none" }}>{initials}</summary>
            <div style={{ position: "absolute", bottom: 0, left: 42, minWidth: 180, padding: 12, border: "1px solid #CCD6E3", borderRadius: 8, background: "white", color: "#16324F", boxShadow: "0 4px 18px #102B4926" }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{name || "Signed in"}</div><SignOut />
            </div>
          </details>}
      </nav>
      <header className="cc-chrome">
        <span className="cd-title">{path.includes("new=1") ? "New call" : "ClaimReach Desk"}</span>
        <GlobalFileSearch />
        <a className="cc-chrome-new" href="/app?new=1"><Icon name="headset" size={16} />New call</a>
        <FullSiteLink owner={owner} />
      </header>
    </>
  );
}

// On a call file (/app/TMP-1181), Full site opens THAT file's classic page
// instead of dumping the user on the dashboard (Astra review, Sep 27).
function FullSiteLink({ owner }: { owner: boolean }) {
  const [href, setHref] = useState("/dashboard");
  const pathname = usePathname();
  useEffect(() => {
    setHref("/dashboard");
    try {
      const m = pathname.match(/^\/app\/([^\/]+)$/);
      if (m && m[1] && !["new", "search", "help", "netfly"].includes(m[1])) {
        const q = new URLSearchParams(window.location.search);
        q.delete("text"); q.delete("classic");
        setHref(`/leads/${encodeURIComponent(decodeURIComponent(m[1]))}${q.size ? `?${q}` : ""}`);
      }
    } catch { /* keep the dashboard */ }
  }, [pathname]);
  if (!owner && href !== "/dashboard") return <button type="button" className="cc-chrome-link" onClick={() => window.dispatchEvent(new Event(OPEN_DESK_FILE_EVENT))}><Icon name="files" size={16} />Review case</button>;
  return <a className="cc-chrome-link" href={href}><Icon name={href === "/dashboard" ? "home" : "files"} size={16} />{href === "/dashboard" ? "Dashboard" : "Review case"}</a>;
}
