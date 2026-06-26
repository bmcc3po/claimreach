"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("cr-theme")) as
      | "light" | "dark" | null;
    const initial = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("cr-theme", next); } catch {}
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle light or dark theme"
      title={theme === "light" ? "Switch to dark" : "Switch to light"}>
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
