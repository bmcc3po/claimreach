"use client";
// iPhone keyboard. Safari and Chrome on iOS do not shrink the page when the
// keyboard comes up, they slide it, so a text box at the bottom of a sheet ends
// up with the thread cut off above it. While someone types in a sheet, this
// sizes the App to exactly the space above the keyboard (html.cc-kb in
// calls.css) and keeps the newest text in view. Everywhere else, nothing changes.
import { useEffect } from "react";

export default function KeyboardFit() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let on = false;
    const apply = () => {
      const el = document.activeElement as HTMLElement | null;
      const sheet = el?.closest?.(".cc-sheet") as HTMLElement | null;
      const typing = !!el && /^(TEXTAREA|INPUT)$/.test(el.tagName);
      const kb = window.innerHeight - vv.height > 120;
      if (kb && typing && sheet) {
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.style.setProperty("--vvt", `${Math.round(vv.offsetTop)}px`);
        if (!on) {
          on = true;
          root.classList.add("cc-kb");
          const body = sheet.querySelector(".cc-sheet-b") as HTMLElement | null;
          if (body && sheet.querySelector(".cc-compose")) requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
        }
      } else if (on) {
        on = false;
        root.classList.remove("cc-kb");
      }
    };
    const later = () => setTimeout(apply, 60);
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      root.classList.remove("cc-kb");
    };
  }, []);
  return null;
}
