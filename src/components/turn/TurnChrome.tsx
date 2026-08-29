"use client";

import Link from "next/link";
import type { TurnRole } from "@/lib/turn/types";
import { DEMO_ACTORS } from "@/lib/turn/seed";

export function TurnChrome(props: {
  role: TurnRole;
  onRole?: (r: TurnRole) => void;
  search?: string;
  onSearch?: (v: string) => void;
  onReset?: () => void;
  rightNote?: string;
}) {
  const actor = DEMO_ACTORS[props.role];
  return (
    <header className="turn-nav">
      <div className="turn-brand">
        <Link href="/turn" className="turn-logo">ClaimTurn <span className="turn-shell-badge">shell</span></Link>
        <span className="turn-office">TMP · Vegas</span>
      </div>
      <input
        className="turn-search"
        placeholder="Search files, claim #, phone..."
        value={props.search ?? ""}
        onChange={(e) => props.onSearch?.(e.target.value)}
      />
      <div className="turn-who">
        {props.rightNote || `${actor.name} · ${actor.title}`}
        {props.onRole && (
          <span className="turn-role">
            <button type="button" className={props.role === "attorney" ? "on" : ""} onClick={() => props.onRole!("attorney")}>Attorney</button>
            <button type="button" className={props.role === "paralegal" ? "on" : ""} onClick={() => props.onRole!("paralegal")}>Paralegal</button>
          </span>
        )}
        {props.onReset && (
          <button type="button" className="turn-reset" onClick={props.onReset}>Reset demo</button>
        )}
      </div>
    </header>
  );
}

export function CallBar(props: {
  tone: "red" | "orange";
  title: string;
  detail: string;
  onStay?: () => void;
  onEnd?: () => void;
  stayLabel?: string;
  endLabel?: string;
}) {
  return (
    <div className={`turn-bar ${props.tone}`}>
      <span><span className="dot" />{props.title}</span>
      <span className="grow">{props.detail}</span>
      <div className="actions">
        {props.onStay && <button type="button" className="btn-light" onClick={props.onStay}>{props.stayLabel || "Save and stay"}</button>}
        {props.onEnd && <button type="button" className="btn-dark" onClick={props.onEnd}>{props.endLabel || "End call"}</button>}
      </div>
    </div>
  );
}
