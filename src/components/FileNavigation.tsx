"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { areaHref, workArea } from '@/lib/work-area';
import { FILE_VIEWS } from "@/lib/navigation";

/** Owner file views remain separate queries, with one shared way to reach them. */
export default function FileNavigation() {
  const path = usePathname();
  const area = workArea(useSearchParams().get('area'));
  return <nav className="cl-file-nav" aria-label="File views">
    {FILE_VIEWS.filter(view => area !== 'other' || !view.mvaOnly).map((view) => <Link key={view.href} href={areaHref(view.href, area)} aria-current={path === view.href ? "page" : undefined}>{view.label}</Link>)}
  </nav>;
}
