"use client";
import { createContext, useContext, useState } from "react";
import Crissi from "@/components/Crissi";
import type { M6CrissiFile } from "@/lib/m6-crissi";

type Ctx = { openCrissi: (file?: M6CrissiFile | null) => void };

const M6CrissiCtx = createContext<Ctx>({ openCrissi: () => {} });

export function useM6Crissi() {
  return useContext(M6CrissiCtx);
}

export default function M6CrissiDock({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<M6CrissiFile | null>(null);

  function openCrissi(next?: M6CrissiFile | null) {
    setFile(next ?? null);
    setOpen(true);
  }

  return (
    <M6CrissiCtx.Provider value={{ openCrissi }}>
      {children}
      <button
        type="button"
        className="m6-crissi-dock"
        onClick={() => openCrissi(file)}
      >
        🆘 Crissi (crisis)
      </button>
      <Crissi
        trigger="fab"
        hideTrigger
        variant="m6"
        layout="modal"
        file={file}
        openExternal={open}
        onCloseExternal={() => setOpen(false)}
      />
    </M6CrissiCtx.Provider>
  );
}
