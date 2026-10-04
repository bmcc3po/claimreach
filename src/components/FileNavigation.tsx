"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FILE_VIEWS } from "@/lib/navigation";

/** Owner file views remain separate queries, with one shared way to reach them. */
export default function FileNavigation() {
  const path = usePathname();
  return <nav className="cl-file-nav" aria-label="File views">
    {FILE_VIEWS.map((view) => <Link key={view.href} href={view.href} aria-current={path === view.href ? "page" : undefined}>{view.label}</Link>)}
  </nav>;
}
