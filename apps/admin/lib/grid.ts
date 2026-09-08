import type { ReactNode } from 'react';

export type ColType = 'text' | 'number' | 'date' | 'enum' | 'boolean';

export type GridColumn = {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => ReactNode;
  type?: ColType;
  filterable?: boolean;
  sortable?: boolean;
  getValue?: (row: Record<string, unknown>) => unknown;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
};

export type SortDir = 'asc' | 'desc';
export type SortSpec = { key: string; dir: SortDir };

export type ColFilter =
  | { kind: 'text'; q: string }
  | { kind: 'enum'; selected: string[] }
  | { kind: 'number'; min?: string; max?: string }
  | { kind: 'date'; from?: string; to?: string }
  | { kind: 'boolean'; value?: 'true' | 'false' | '' };

export function deep(row: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
    return undefined;
  }, row);
}

export function cellValue(col: GridColumn, row: Record<string, unknown>): unknown {
  if (col.getValue) return col.getValue(row);
  return deep(row, col.key);
}

export function displayValue(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function isDateish(v: unknown): boolean {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return true;
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v) && !/^\d{4}\/\d{2}\/\d{2}/.test(v)) return false;
  return !Number.isNaN(Date.parse(v));
}

function looksNumericKey(key: string) {
  return !/(id|phone|code|plate|email|ip|token|ref)$/i.test(key);
}

export function inferType(key: string, values: unknown[]): ColType {
  const defined = values.filter((v) => v != null && v !== '');
  if (!defined.length) return 'text';
  if (defined.every((v) => typeof v === 'boolean')) return 'boolean';
  const numeric = defined.every(
    (v) => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())),
  );
  if (numeric && looksNumericKey(key)) return 'number';
  if (defined.every(isDateish)) return 'date';
  const uniq = [...new Set(defined.map((v) => displayValue(v)))];
  if (uniq.length > 1 && uniq.length <= 16 && uniq.length <= Math.max(8, defined.length * 0.45)) {
    return 'enum';
  }
  if (uniq.length > 0 && uniq.length <= 8) return 'enum';
  return 'text';
}

export function uniqueValues(rows: Record<string, unknown>[], col: GridColumn): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = cellValue(col, row);
    if (v == null || v === '') continue;
    set.add(displayValue(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function isActionCol(col: GridColumn): boolean {
  if (col.filterable === false && col.sortable === false && !col.label) return true;
  return col.key === 'act' || col.key === 'actions' || col.label === '';
}

export function canFilter(col: GridColumn): boolean {
  return col.filterable !== false && !isActionCol(col);
}

export function canSort(col: GridColumn): boolean {
  return col.sortable !== false && !isActionCol(col);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toTime(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function matchesFilter(value: unknown, filter: ColFilter | undefined, _type: ColType): boolean {
  if (!filter) return true;
  if (filter.kind === 'text') {
    const q = filter.q.trim().toLowerCase();
    if (!q) return true;
    return displayValue(value).toLowerCase().includes(q);
  }
  if (filter.kind === 'enum') {
    if (!filter.selected.length) return true;
    const label = value == null || vEmpty(value) ? '(blank)' : displayValue(value);
    return filter.selected.includes(label) || (vEmpty(value) && filter.selected.includes('(blank)'));
  }
  if (filter.kind === 'number') {
    const n = toNumber(value);
    const min = filter.min === undefined || filter.min === '' ? null : Number(filter.min);
    const max = filter.max === undefined || filter.max === '' ? null : Number(filter.max);
    if (n == null) return min == null && max == null;
    if (min != null && Number.isFinite(min) && n < min) return false;
    if (max != null && Number.isFinite(max) && n > max) return false;
    return true;
  }
  if (filter.kind === 'date') {
    const t = toTime(value);
    if (t == null) return !filter.from && !filter.to;
    if (filter.from) {
      const from = Date.parse(filter.from);
      if (!Number.isNaN(from) && t < from) return false;
    }
    if (filter.to) {
      const to = Date.parse(filter.to);
      if (!Number.isNaN(to) && t > to + 86_399_000) return false;
    }
    return true;
  }
  if (filter.kind === 'boolean') {
    if (!filter.value) return true;
    const want = filter.value === 'true';
    if (typeof value === 'boolean') return value === want;
    const s = displayValue(value).toLowerCase();
    const truthy = ['true', 'yes', 'on', '1', 'vip'].includes(s);
    return want ? truthy : !truthy;
  }
  return true;
}

function vEmpty(v: unknown) {
  return v == null || v === '';
}

export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const m = dir === 'asc' ? 1 : -1;
  if (vEmpty(a) && vEmpty(b)) return 0;
  if (vEmpty(a)) return 1;
  if (vEmpty(b)) return -1;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na != null && nb != null) return (na - nb) * m;
  if (isDateish(a) && isDateish(b)) {
    const ta = toTime(a);
    const tb = toTime(b);
    if (ta != null && tb != null) return (ta - tb) * m;
  }
  return displayValue(a).localeCompare(displayValue(b), undefined, { numeric: true, sensitivity: 'base' }) * m;
}

export function filterRows(
  rows: Record<string, unknown>[],
  columns: GridColumn[],
  types: Record<string, ColType>,
  filters: Record<string, ColFilter | undefined>,
  search: string,
): Record<string, unknown>[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    for (const col of columns) {
      if (!canFilter(col)) continue;
      const f = filters[col.key];
      if (!f) continue;
      if (!matchesFilter(cellValue(col, row), f, types[col.key] ?? 'text')) return false;
    }
    if (!q) return true;
    const hay = columns
      .map((c) => displayValue(cellValue(c, row)))
      .join(' ')
      .toLowerCase();
    if (hay.includes(q)) return true;
    try {
      return JSON.stringify(row).toLowerCase().includes(q);
    } catch {
      return false;
    }
  });
}

export function sortRows(
  rows: Record<string, unknown>[],
  columns: GridColumn[],
  sorts: SortSpec[],
): Record<string, unknown>[] {
  if (!sorts.length) return rows;
  const colMap = Object.fromEntries(columns.map((c) => [c.key, c]));
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const col = colMap[s.key];
      if (!col) continue;
      const n = compareValues(cellValue(col, a), cellValue(col, b), s.dir);
      if (n) return n;
    }
    return 0;
  });
}

export function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(rows: Record<string, unknown>[], columns: GridColumn[]): string {
  const cols = columns.filter((c) => !isActionCol(c));
  const header = cols.map((c) => csvEscape(c.label || c.key)).join(',');
  const body = rows.map((row) => cols.map((c) => csvEscape(displayValue(cellValue(c, row)))).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

export function filterActive(f?: ColFilter): boolean {
  if (!f) return false;
  if (f.kind === 'text') return Boolean(f.q.trim());
  if (f.kind === 'enum') return f.selected.length > 0;
  if (f.kind === 'number') return Boolean(f.min || f.max);
  if (f.kind === 'date') return Boolean(f.from || f.to);
  if (f.kind === 'boolean') return Boolean(f.value);
  return false;
}

export function filterSummary(f: ColFilter): string {
  if (f.kind === 'text') return f.q;
  if (f.kind === 'enum') return f.selected.join(', ');
  if (f.kind === 'number') return [f.min && `≥ ${f.min}`, f.max && `≤ ${f.max}`].filter(Boolean).join(' ');
  if (f.kind === 'date') return [f.from, f.to].filter(Boolean).join(' → ');
  if (f.kind === 'boolean') return f.value === 'true' ? 'Yes' : f.value === 'false' ? 'No' : '';
  return '';
}

export function emptyFilter(type: ColType): ColFilter {
  if (type === 'enum') return { kind: 'enum', selected: [] };
  if (type === 'number') return { kind: 'number', min: '', max: '' };
  if (type === 'date') return { kind: 'date', from: '', to: '' };
  if (type === 'boolean') return { kind: 'boolean', value: '' };
  return { kind: 'text', q: '' };
}
