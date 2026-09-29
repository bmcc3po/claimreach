// In-memory stand-in for the Supabase query builder, for offline tsx tests
// only (never imported by app code). It evaluates the same filters the code
// sends, so a conditional update that would match nothing in Postgres
// matches nothing here too. Each awaited query runs as one step, which
// is how the compare-and-set claims are raced in tests.
export type Row = Record<string, any>;
export type Filter = [string, string, any];
export type Op = { table: string; kind: "select" | "update" | "insert"; patch?: Row; filters: Filter[] };

function cmp(a: any, b: any): number {
  const da = typeof a === "string" ? Date.parse(a) : NaN, db = typeof b === "string" ? Date.parse(b) : NaN;
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  return Number(a) - Number(b);
}
function same(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const da = typeof a === "string" ? Date.parse(a) : NaN, db = typeof b === "string" ? Date.parse(b) : NaN;
  if (/\d{4}-\d{2}-\d{2}T/.test(String(a)) && Number.isFinite(da) && Number.isFinite(db)) return da === db;
  return String(a) === String(b);
}
export function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, v]) => {
    if (op === "or") return splitFilter(String(v)).some((part) => expression(row, part));
    const x = col.includes("->") ? col.split(/->>?/).reduce((v, key) => v?.[key], row) : row[col];
    if (op === "eq") return same(x, v);
    if (op === "neq") return !same(x, v);
    if (op === "is") return v === null ? x == null : x === v;
    if (op === "in") return (v as any[]).some((y) => same(x, y));
    // SQL: a comparison with NULL is never true.
    if (op === "gt") return x != null && cmp(x, v) > 0;
    if (op === "lt") return x != null && cmp(x, v) < 0;
    if (op === "lte") return x != null && cmp(x, v) <= 0;
    if (op === "gte") return x != null && cmp(x, v) >= 0;
    throw new Error(`fake db: filter ${op} not supported`);
  });
}

function splitFilter(value: string): string[] {
  const result: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) { result.push(value.slice(start, i)); start = i + 1; }
  }
  result.push(value.slice(start)); return result;
}
function expression(row: Row, value: string): boolean {
  if (value.startsWith("and(")) return splitFilter(value.slice(4, -1)).every((part) => expression(row, part));
  if (value.startsWith("or(")) return splitFilter(value.slice(3, -1)).some((part) => expression(row, part));
  const [col, op, ...rest] = value.split("."); const v = rest.join(".");
  return matches(row, [[op, col, op === "is" && v === "null" ? null : v]]);
}

export class FakeDb {
  tables: Record<string, Row[]>;
  ops: Op[] = [];
  private seq = 0;
  /** Return an error message to fail one operation, or "THROW" to throw. */
  failOn: (op: Op) => string | null = () => null;
  constructor(tables: Record<string, Row[]>) { this.tables = tables; }
  from(table: string) { return new FakeQuery(this, table); }
  nextId() { this.seq++; return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`; }
}

export class FakeQuery {
  private op: Op;
  private one = false;
  private lim = Infinity;
  private wantRows = false;
  private count = false;
  private head = false;
  private sort: { col: string; ascending: boolean }[] = [];
  constructor(private db: FakeDb, table: string) { this.op = { table, kind: "select", filters: [] }; }
  select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (this.op.kind !== "select") this.wantRows = true; this.count = !!opts?.count; this.head = !!opts?.head; return this; }
  update(patch: Row) { this.op.kind = "update"; this.op.patch = patch; return this; }
  insert(patch: Row) { this.op.kind = "insert"; this.op.patch = patch; return this; }
  eq(c: string, v: any) { this.op.filters.push(["eq", c, v]); return this; }
  neq(c: string, v: any) { this.op.filters.push(["neq", c, v]); return this; }
  is(c: string, v: any) { this.op.filters.push(["is", c, v]); return this; }
  in(c: string, v: any[]) { this.op.filters.push(["in", c, v]); return this; }
  gt(c: string, v: any) { this.op.filters.push(["gt", c, v]); return this; }
  lt(c: string, v: any) { this.op.filters.push(["lt", c, v]); return this; }
  lte(c: string, v: any) { this.op.filters.push(["lte", c, v]); return this; }
  gte(c: string, v: any) { this.op.filters.push(["gte", c, v]); return this; }
  or(v: string) { this.op.filters.push(["or", "", v]); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.sort.push({ col, ascending: opts?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  private run(): { data: any; error: any; count?: number } {
    this.db.ops.push(this.op);
    const fail = this.db.failOn(this.op);
    if (fail === "THROW") throw new Error("simulated crash");
    if (fail) return { data: null, error: { message: fail } };
    const rows = (this.db.tables[this.op.table] ??= []);
    if (this.op.kind === "insert") {
      const added = (Array.isArray(this.op.patch) ? this.op.patch : [this.op.patch]).map((patch) => ({ id: this.db.nextId(), ...patch }));
      rows.push(...added);
      return { data: this.one ? { ...added[0] } : added.map((r) => ({ ...r })), error: null };
    }
    const matching = rows.filter((r) => matches(r, this.op.filters));
    matching.sort((a, b) => {
      for (const s of this.sort) {
        const c = a[s.col] == b[s.col] ? 0 : a[s.col] < b[s.col] ? -1 : 1;
        if (c) return s.ascending ? c : -c;
      }
      return 0;
    });
    if (this.head) return { data: null, error: null, count: matching.length };
    const hit = matching.slice(0, this.lim);
    if (this.op.kind === "update") {
      for (const r of hit) Object.assign(r, this.op.patch);
      const result = hit.map((r) => ({ ...r }));
      return { data: this.wantRows ? (this.one ? result[0] ?? null : result) : null, error: null };
    }
    if (this.one) return { data: hit[0] ? { ...hit[0] } : null, error: null };
    return { data: hit.map((r) => ({ ...r })), error: null };
  }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); }
  }
}
