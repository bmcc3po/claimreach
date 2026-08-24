"use client";
import { useState } from "react";
import Link from "next/link";
import LorSend from "./LorSend";
import TextSend from "./TextSend";
import { useM6Crissi } from "./M6CrissiContext";

export type FileActionTarget = {
  id: string;
  name?: string;
  leadNo?: string | null;
  phone?: string | null;
  optedOut?: boolean;
};

function e164(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.startsWith("+") && d.length >= 11) return String(raw);
  return null;
}

export default function FileActions({
  file, onDone,
}: {
  file: FileActionTarget;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState<"text" | "lor" | null>(null);
  const tel = e164(file.phone);
  const { openCrissi } = useM6Crissi();

  return (
    <div className="m6-acts" onClick={(e) => e.stopPropagation()}>
      {file.optedOut ? (
        <span className="m6-act dead">Call</span>
      ) : tel ? (
        <a className="m6-act call" href={`tel:${tel}`}>Call</a>
      ) : (
        <Link className="m6-act" href={`/m6/cases/${file.id}`}>Call</Link>
      )}
      <button
        type="button"
        className="m6-act"
        disabled={!!file.optedOut}
        onClick={() => setOpen("text")}
      >
        Text
      </button>
      <button
        type="button"
        className="m6-act crissi"
        onClick={() => openCrissi({
          id: file.id,
          name: file.name || "this file",
          leadNo: file.leadNo ?? null,
        })}
      >
        Crissi
      </button>
      <button type="button" className="m6-act lor" onClick={() => setOpen("lor")}>LOR</button>

      {open === "text" && (
        <TextSend leadId={file.id} onClose={() => { setOpen(null); onDone?.(); }} />
      )}
      {open === "lor" && (
        <LorSend leadId={file.id} onClose={() => { setOpen(null); onDone?.(); }} onSent={onDone} />
      )}
    </div>
  );
}
