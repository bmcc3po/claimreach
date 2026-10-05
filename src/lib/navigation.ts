/** Shared destinations for the full menu and the call-desk rail. Display only;
 * each destination keeps its existing server-side access checks. */
export type PrimaryNavItem = { href: string; icon: string; label: string; aliases?: string[] };

export function primaryNavigation(owner: boolean): PrimaryNavItem[] {
  return [
    { href: "/dashboard", icon: "home", label: "Dashboard" },
    ...(owner ? [{ href: "/leads", icon: "files", label: "Files", aliases: ["/signed", "/packets"] }] : []),
    { href: "/app", icon: "headset", label: "Call desk" },
    { href: "/queue", icon: "queue", label: "My queue" },
    { href: "/app/help", icon: "book", label: "Agent guides" },
    ...(owner ? [{ href: "/other-work", icon: "files", label: "Other work" }] : []),
  ];
}

export function activeNavigation(path: string, items: PrimaryNavItem[]): string {
  const pathname = path.split("?")[0];
  const matches = items.flatMap((item) => [item.href, ...(item.aliases || [])]
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .map((match) => ({ href: item.href, length: match.length })));
  return matches.sort((a, b) => b.length - a.length)[0]?.href || "";
}

export const FILE_VIEWS = [
  { href: "/leads", label: "Open files" },
  { href: "/signed", label: "Signed files" },
  { href: "/packets", label: "Firm delivery" },
  { href: "/leads/archive", label: "Test files & archive" },
];
