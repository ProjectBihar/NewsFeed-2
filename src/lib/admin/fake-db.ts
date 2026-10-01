// Minimal in-memory Supabase stand-in for mutation tests (Phase 22).
// Implements exactly the builder surface mutations.ts uses; production
// still talks to the real client, so keep the surface in sync.

type Row = Record<string, unknown>;

class Builder {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private selectCols: string | null = null;
  private filters: Array<(r: Row) => boolean> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private insertRows: Row[] = [];
  private patch: Row = {};
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
    private calls: Array<Record<string, unknown>>
  ) {}

  select(cols?: string): this {
    if (this.mode === "select") this.selectCols = cols ?? "*";
    this.calls.push({ op: "select", table: this.table, cols });
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  in(col: string, values: unknown[]): this {
    this.filters.push((r) => (values as unknown[]).includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.calls.push({ op: "insert", table: this.table, rows: this.insertRows });
    return this;
  }
  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    this.calls.push({ op: "update", table: this.table, patch });
    return this;
  }
  delete(): this {
    this.mode = "delete";
    this.calls.push({ op: "delete", table: this.table });
    return this;
  }
  single(): this {
    this.wantSingle = true;
    return this;
  }
  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  private rows(): Row[] {
    const table = this.tables[this.table] ?? [];
    let out = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      out = [...out].sort((a, b) => {
        const x = a[col] as string;
        const y = b[col] as string;
        if (x === y) return 0;
        const less = x < y;
        return (less ? -1 : 1) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  then(
    resolve: (v: { data: unknown; error: { message: string } | null }) => void,
    reject?: (e: unknown) => void
  ): void {
    try {
      const table = (this.tables[this.table] ??= []);
      if (this.mode === "insert") {
        let nextId = Math.max(0, ...table.map((r) => Number(r["id"] ?? 0))) + 1;
        const inserted = this.insertRows.map((r) => ({ ...r, id: r["id"] ?? nextId++ }));
        table.push(...inserted);
        resolve({ data: this.wantSingle ? (inserted[0] ?? null) : inserted, error: null });
        return;
      }
      if (this.mode === "update") {
        const matched = this.rows();
        for (const row of matched) Object.assign(row, this.patch);
        resolve({ data: matched, error: null });
        return;
      }
      if (this.mode === "delete") {
        const matched = this.rows();
        this.tables[this.table] = table.filter((r) => !matched.includes(r));
        resolve({ data: matched, error: null });
        return;
      }
      const out = this.rows();
      if (this.wantSingle) {
        resolve({ data: out[0] ?? null, error: out[0] ? null : { message: "none" } });
        return;
      }
      resolve({ data: this.wantMaybeSingle ? (out[0] ?? null) : out, error: null });
    } catch (error) {
      if (reject) reject(error);
    }
  }
}

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  const calls: Array<Record<string, unknown>> = [];
  return {
    tables,
    calls,
    from(table: string) {
      return new Builder(tables, table, calls);
    },
  };
}

export type FakeDb = ReturnType<typeof fakeDb>;
