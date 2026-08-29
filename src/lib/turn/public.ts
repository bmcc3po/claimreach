// /turn is a public demo desk. Fake people. No leads. Not /m6.

export function isTurnPublicPath(path: string): boolean {
  return path === "/turn" || path.startsWith("/turn/");
}

export function isTurnApiPath(path: string): boolean {
  return path === "/api/turn" || path.startsWith("/api/turn/");
}
