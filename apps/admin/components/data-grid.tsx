'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Empty } from './ui';
import {
  type ColFilter,
  type ColType,
  type GridColumn,
  type SortSpec,
  canFilter,
  canSort,
  cellValue,
  downloadCsv,
  emptyFilter,
  filterActive,
  filterRows,
  filterSummary,
  inferType,
  slugify,
  sortRows,
  toCsv,
  uniqueValues,
} from '../lib/grid';

type Density = 'compact' | 'cozy' | 'comfortable';
type Menu = { kind: 'filter' | 'cols' | 'density'; key?: string } | null;

const PAGE_SIZES = [10, 25, 50, 100, 0] as const;

type Prefs = {
  density: Density;
  pageSize: number;
  hidden: string[];
  widths: Record<string, number>;
};

function loadPrefs(key?: string): Partial<Prefs> {
  if (!key || typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`cango.grid.${key}`);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function savePrefs(key: string | undefined, prefs: Prefs) {
  if (!key) return;
  try {
    localStorage.setItem(`cango.grid.${key}`, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function DataGrid({
  rows,
  columns,
  loading = false,
  error,
  onRowClick,
  getRowId,
  persistKey,
  onRefresh,
  toolbar,
  maxHeight,
  selectable = true,
  emptyText = 'No rows',
}: {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: Record<string, unknown>) => void;
  getRowId?: (row: Record<string, unknown>, index: number) => string;
  persistKey?: string;
  onRefresh?: () => void;
  toolbar?: ReactNode;
  maxHeight?: number | string;
  selectable?: boolean;
  emptyText?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, ColFilter | undefined>>({});
  const [sorts, setSorts] = useState<SortSpec[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [density, setDensity] = useState<Density>('cozy');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<Menu>(null);
  const [showFilterRow, setShowFilterRow] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefsReady, setPrefsReady] = useState(false);
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const prefs = loadPrefs(persistKey);
    if (prefs.pageSize != null) setPageSize(prefs.pageSize);
    if (prefs.density) setDensity(prefs.density);
    if (prefs.hidden) setHidden(new Set(prefs.hidden));
    if (prefs.widths) setWidths(prefs.widths);
    setPrefsReady(true);
  }, [persistKey]);

  const rowId = useCallback(
    (row: Record<string, unknown>, i: number) => getRowId?.(row, i) ?? String(row.id ?? i),
    [getRowId],
  );

  const visibleCols = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );

  const types = useMemo(() => {
    const next: Record<string, ColType> = {};
    for (const col of columns) {
      if (col.type) {
        next[col.key] = col.type;
        continue;
      }
      next[col.key] = inferType(
        col.key,
        rows.slice(0, 80).map((r) => cellValue(col, r)),
      );
    }
    return next;
  }, [columns, rows]);

  const facets = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (!canFilter(col)) continue;
      if ((col.type ?? types[col.key]) === 'enum') map[col.key] = uniqueValues(rows, col);
    }
    return map;
  }, [columns, rows, types]);

  const filtered = useMemo(
    () => sortRows(filterRows(rows, columns, types, filters, search), columns, sorts),
    [rows, columns, types, filters, search, sorts],
  );

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageRows = useMemo(() => {
    if (pageSize === 0) return filtered;
    const start = pageSafe * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [search, filters, pageSize, rows]);

  useEffect(() => {
    if (!prefsReady) return;
    savePrefs(persistKey, {
      density,
      pageSize,
      hidden: [...hidden],
      widths,
    });
  }, [persistKey, density, pageSize, hidden, widths, prefsReady]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!menu) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  useEffect(() => {
    function move(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      setWidths((w) => ({ ...w, [r.key]: Math.max(72, r.startW + e.clientX - r.startX) }));
    }
    function up() {
      resizeRef.current = null;
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const activeFilters = useMemo(
    () => columns.filter((c) => filterActive(filters[c.key])),
    [columns, filters],
  );

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((r, i) => selected.has(rowId(r, i)));
  const someSelected = selected.size > 0;

  function toggleSort(key: string, shift: boolean) {
    setSorts((cur) => {
      const idx = cur.findIndex((s) => s.key === key);
      if (!shift) {
        if (idx === -1) return [{ key, dir: 'asc' }];
        if (cur[idx].dir === 'asc') return [{ key, dir: 'desc' }];
        return [];
      }
      const next = [...cur];
      if (idx === -1) next.push({ key, dir: 'asc' });
      else if (next[idx].dir === 'asc') next[idx] = { key, dir: 'desc' };
      else next.splice(idx, 1);
      return next;
    });
  }

  function setFilter(key: string, f?: ColFilter) {
    setFilters((cur) => {
      const next = { ...cur };
      if (!f || !filterActive(f)) delete next[key];
      else next[key] = f;
      return next;
    });
  }

  function toggleHidden(key: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else if (next.size < columns.length - 1) next.add(key);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allPageSelected) pageRows.forEach((r, i) => next.delete(rowId(r, i)));
      else pageRows.forEach((r, i) => next.add(rowId(r, i)));
      return next;
    });
  }

  function exportCsv() {
    const subset = someSelected ? filtered.filter((r, i) => selected.has(rowId(r, i))) : filtered;
    downloadCsv(`${slugify(persistKey ?? 'grid')}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(subset, visibleCols));
  }

  function onRowActivate(row: Record<string, unknown>, e: ReactMouseEvent<HTMLTableRowElement>) {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, .dg-check')) return;
    onRowClick?.(row);
  }

  const start = pageSize === 0 ? 1 : filtered.length === 0 ? 0 : pageSafe * pageSize + 1;
  const end = pageSize === 0 ? filtered.length : Math.min(filtered.length, (pageSafe + 1) * pageSize);
  const enumFacets = visibleCols.filter((c) => (c.type ?? types[c.key]) === 'enum' && canFilter(c)).slice(0, 3);
  const showFacets = !showFilterRow && enumFacets.length > 0;

  return (
    <div
      className="dg"
      data-density={density}
      data-clickable={onRowClick ? '1' : '0'}
      data-selectable={selectable ? '1' : '0'}
      data-filters={showFilterRow ? '1' : '0'}
      ref={rootRef}
    >
      <div className="dg-toolbar">
        <div className="dg-search-wrap">
          <input
            className="field dg-search"
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="row dg-tools">
          {toolbar}
          <span className="chip">{filtered.length.toLocaleString()} / {rows.length.toLocaleString()}</span>
          {someSelected && <span className="chip info">{selected.size} selected</span>}
          <button
            type="button"
            className={`btn ghost sm ${showFilterRow ? 'on' : ''}`}
            onClick={() => setShowFilterRow((v) => !v)}
            aria-pressed={showFilterRow}
          >
            Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ''}
          </button>
          <div className="dg-menu-anchor">
            <button type="button" className="btn ghost sm" onClick={() => setMenu(menu?.kind === 'density' ? null : { kind: 'density' })}>
              Density
            </button>
            {menu?.kind === 'density' && (
              <div className="dg-pop">
                {(['compact', 'cozy', 'comfortable'] as Density[]).map((d) => (
                  <button key={d} type="button" className={density === d ? 'active' : ''} onClick={() => { setDensity(d); setMenu(null); }}>
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="dg-menu-anchor">
            <button type="button" className="btn ghost sm" onClick={() => setMenu(menu?.kind === 'cols' ? null : { kind: 'cols' })}>
              Columns
            </button>
            {menu?.kind === 'cols' && (
              <div className="dg-pop">
                {columns.map((c) => (
                  <label key={c.key} className="dg-check-row">
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleHidden(c.key)} />
                    {c.label || c.key}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn ghost sm" onClick={exportCsv} disabled={!filtered.length}>
            Export CSV
          </button>
          {onRefresh && (
            <button type="button" className="btn ghost sm" onClick={onRefresh}>
              Refresh
            </button>
          )}
          {(search || activeFilters.length > 0 || sorts.length > 0 || someSelected) && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setSearch('');
                setFilters({});
                setSorts([]);
                setSelected(new Set());
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="dg-chips">
          <span className="dg-chips-label">Active</span>
          {activeFilters.map((c) => (
            <button key={c.key} type="button" className="dg-chip-clear" onClick={() => setFilter(c.key)}>
              <span className="dg-chip-clear-key">{c.label}</span>
              <span className="dg-chip-clear-val">{filterSummary(filters[c.key]!)}</span>
              <span className="dg-chip-clear-x" aria-hidden>×</span>
            </button>
          ))}
          <button type="button" className="dg-chips-reset" onClick={() => setFilters({})}>
            Clear filters
          </button>
        </div>
      )}

      {showFacets && (
        <div className="dg-facets">
          {enumFacets.map((col) => {
            const f = filters[col.key];
            const selectedVals = f?.kind === 'enum' ? f.selected : [];
            return (
              <div key={col.key} className="dg-facet">
                <span className="dg-facet-label">{col.label}</span>
                {(facets[col.key] ?? []).slice(0, 10).map((v) => {
                  const on = selectedVals.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      className={`dg-facet-chip ${on ? 'on' : ''}`}
                      onClick={() => {
                        const next = on ? selectedVals.filter((x) => x !== v) : [...selectedVals, v];
                        setFilter(col.key, { kind: 'enum', selected: next });
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="err">{error}</p>}

      <div className="panel table-wrap dg-wrap" style={maxHeight ? { maxHeight } : undefined}>
        {loading ? (
          <div className="dg-skel">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dg-skel-row" />
            ))}
          </div>
        ) : (
          <table className="data dg-table">
            <thead>
              <tr className="dg-head-row">
                {selectable && (
                  <th className="dg-sticky dg-check-th">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Select page"
                      disabled={pageRows.length === 0}
                    />
                  </th>
                )}
                {visibleCols.map((c, ci) => {
                  const sortIdx = sorts.findIndex((s) => s.key === c.key);
                  const sort = sortIdx >= 0 ? sorts[sortIdx] : undefined;
                  const colType = c.type ?? types[c.key] ?? 'text';
                  const minW = c.minWidth ?? defaultMinWidth(colType);
                  const rawW = widths[c.key] ?? c.width;
                  const w = rawW != null ? Math.max(rawW, minW) : undefined;
                  return (
                    <th
                      key={c.key}
                      className={`${ci === 0 ? 'dg-sticky-col' : ''} ${filterActive(filters[c.key]) ? 'dg-filtered' : ''}`}
                      style={{ width: w, minWidth: minW, textAlign: c.align }}
                    >
                      <div className="dg-th">
                        <button
                          type="button"
                          className="dg-sort"
                          disabled={!canSort(c)}
                          onClick={(e) => canSort(c) && toggleSort(c.key, e.shiftKey)}
                        >
                          {c.label || c.key}
                          {sort && <span className="dg-sort-ind">{sort.dir === 'asc' ? ' ↑' : ' ↓'}{sorts.length > 1 ? sortIdx + 1 : ''}</span>}
                        </button>
                        {canFilter(c) && (
                          <button
                            type="button"
                            className={`dg-filter-btn ${filterActive(filters[c.key]) ? 'on' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenu(menu?.kind === 'filter' && menu.key === c.key ? null : { kind: 'filter', key: c.key });
                            }}
                            aria-label={`Filter ${c.label}`}
                            title={`Filter ${c.label}`}
                          >
                            <FilterIcon />
                          </button>
                        )}
                      </div>
                      {menu?.kind === 'filter' && menu.key === c.key && (
                        <FilterPopover
                          col={c}
                          type={colType}
                          value={filters[c.key] ?? emptyFilter(colType)}
                          options={facets[c.key]}
                          onChange={(f) => setFilter(c.key, f)}
                          onClose={() => setMenu(null)}
                        />
                      )}
                      <span
                        className="dg-resize"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          resizeRef.current = {
                            key: c.key,
                            startX: e.clientX,
                            startW: widths[c.key] ?? (e.currentTarget.parentElement?.getBoundingClientRect().width ?? 140),
                          };
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
              {showFilterRow && (
                <tr className="dg-filter-row">
                  {selectable && <th className="dg-sticky dg-check-th" />}
                  {visibleCols.map((c, ci) => {
                    const colType = c.type ?? types[c.key] ?? 'text';
                    const active = filterActive(filters[c.key]);
                    return (
                      <th
                        key={c.key}
                        className={`${ci === 0 ? 'dg-sticky-col' : ''} ${active ? 'dg-filter-active' : ''}`}
                      >
                        {canFilter(c) ? (
                          <InlineFilter
                            type={colType}
                            value={filters[c.key]}
                            options={facets[c.key]}
                            onChange={(f) => setFilter(c.key, f)}
                          />
                        ) : (
                          <span className="dg-filter-empty" />
                        )}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="dg-empty-row">
                  <td colSpan={(selectable ? 1 : 0) + visibleCols.length}>
                    <Empty text={rows.length === 0 ? emptyText : 'No rows match the current search or filters'} />
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => {
                  const id = rowId(row, i);
                  return (
                    <tr
                      key={id}
                      className={`${onRowClick ? 'clickable' : ''} ${selected.has(id) ? 'selected' : ''}`}
                      onClick={(e) => onRowActivate(row, e)}
                    >
                      {selectable && (
                        <td className="dg-sticky dg-check-th dg-check">
                          <input
                            type="checkbox"
                            checked={selected.has(id)}
                            onChange={() => toggleSelect(id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {visibleCols.map((c, ci) => {
                        const colType = c.type ?? types[c.key] ?? 'text';
                        const minW = c.minWidth ?? defaultMinWidth(colType);
                        const rawW = widths[c.key] ?? c.width;
                        const w = rawW != null ? Math.max(rawW, minW) : undefined;
                        return (
                          <td
                            key={c.key}
                            className={ci === 0 ? 'dg-sticky-col' : ''}
                            style={{ width: w, minWidth: minW, textAlign: c.align }}
                          >
                            {c.render ? c.render(row) : displayCell(cellValue(c, row))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="dg-foot">
        <div className="row">
          <span className="muted">
            {filtered.length === 0 ? '0 rows' : `${start}–${end} of ${filtered.length.toLocaleString()}`}
          </span>
          <select
            className="field dg-pagesize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n === 0 ? 'All' : `${n} / page`}</option>
            ))}
          </select>
        </div>
        <div className="row">
          <button type="button" className="btn ghost sm" disabled={pageSafe <= 0} onClick={() => setPage(0)}>«</button>
          <button type="button" className="btn ghost sm" disabled={pageSafe <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
          <span className="muted">Page {pageSafe + 1} / {totalPages}</span>
          <button type="button" className="btn ghost sm" disabled={pageSafe >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          <button type="button" className="btn ghost sm" disabled={pageSafe >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      </div>
    </div>
  );
}

function displayCell(v: unknown) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function defaultMinWidth(type: ColType) {
  if (type === 'number' || type === 'date') return 156;
  if (type === 'enum' || type === 'boolean') return 128;
  return 160;
}

function FilterIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1.5 2.75h13l-4.75 5.5v4.5l-3.5-1.75v-2.75L1.5 2.75Z" />
    </svg>
  );
}

function FilterPopover({
  col,
  type,
  value,
  options,
  onChange,
  onClose,
}: {
  col: GridColumn;
  type: ColType;
  value: ColFilter;
  options?: string[];
  onChange: (f?: ColFilter) => void;
  onClose: () => void;
}) {
  const [optQ, setOptQ] = useState('');
  const shown = (options ?? []).filter((o) => o.toLowerCase().includes(optQ.toLowerCase()));
  return (
    <div className="dg-pop dg-filter-pop" onClick={(e) => e.stopPropagation()}>
      <div className="dg-pop-title">{col.label}</div>
      <InlineFilter type={type} value={value} options={shown} optionSearch={optQ} onOptionSearch={setOptQ} onChange={onChange} stacked />
      <div className="dg-pop-actions">
        <button type="button" className="btn ghost sm" onClick={() => { onChange(undefined); onClose(); }}>Clear</button>
        <button type="button" className="btn sm" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function InlineFilter({
  type,
  value,
  options,
  onChange,
  stacked,
  optionSearch,
  onOptionSearch,
}: {
  type: ColType;
  value?: ColFilter;
  options?: string[];
  onChange: (f?: ColFilter) => void;
  stacked?: boolean;
  optionSearch?: string;
  onOptionSearch?: (q: string) => void;
}) {
  const active = filterActive(value);
  if (type === 'enum') {
    const selected = value?.kind === 'enum' ? value.selected : [];
    if (stacked) {
      return (
        <div>
          {(options?.length ?? 0) > 8 && (
            <input
              className="field dg-pop-search"
              placeholder="Find value…"
              value={optionSearch ?? ''}
              onChange={(e) => onOptionSearch?.(e.target.value)}
            />
          )}
          <div className="dg-enum-list">
            {(options ?? []).map((o) => (
              <label key={o} className="dg-check-row">
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => {
                    const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
                    onChange({ kind: 'enum', selected: next });
                  }}
                />
                {o}
              </label>
            ))}
          </div>
        </div>
      );
    }
    return (
      <select
        className={`field dg-inline dg-inline-select ${active ? 'has-value' : ''}`}
        value={selected[0] ?? ''}
        onChange={(e) => onChange(e.target.value ? { kind: 'enum', selected: [e.target.value] } : undefined)}
        aria-label="Filter"
      >
        <option value="">All</option>
        {(options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (type === 'number') {
    const min = value?.kind === 'number' ? value.min ?? '' : '';
    const max = value?.kind === 'number' ? value.max ?? '' : '';
    return (
      <div className={stacked ? 'dg-range stacked' : 'dg-range'}>
        <input className={`field dg-inline ${min ? 'has-value' : ''}`} placeholder="Min" value={min} onChange={(e) => onChange({ kind: 'number', min: e.target.value, max })} />
        <span className="dg-range-sep" aria-hidden>–</span>
        <input className={`field dg-inline ${max ? 'has-value' : ''}`} placeholder="Max" value={max} onChange={(e) => onChange({ kind: 'number', min, max: e.target.value })} />
      </div>
    );
  }
  if (type === 'date') {
    const from = value?.kind === 'date' ? value.from ?? '' : '';
    const to = value?.kind === 'date' ? value.to ?? '' : '';
    return (
      <div className={stacked ? 'dg-range stacked' : 'dg-range'}>
        <input className={`field dg-inline ${from ? 'has-value' : ''}`} type="date" value={from} onChange={(e) => onChange({ kind: 'date', from: e.target.value, to })} />
        <span className="dg-range-sep" aria-hidden>–</span>
        <input className={`field dg-inline ${to ? 'has-value' : ''}`} type="date" value={to} onChange={(e) => onChange({ kind: 'date', from, to: e.target.value })} />
      </div>
    );
  }
  if (type === 'boolean') {
    const v = value?.kind === 'boolean' ? value.value ?? '' : '';
    return (
      <select
        className={`field dg-inline dg-inline-select ${active ? 'has-value' : ''}`}
        value={v}
        onChange={(e) => onChange(e.target.value ? { kind: 'boolean', value: e.target.value as 'true' | 'false' } : undefined)}
        aria-label="Filter"
      >
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  const q = value?.kind === 'text' ? value.q : '';
  return (
    <input
      className={`field dg-inline ${active ? 'has-value' : ''}`}
      placeholder="Filter…"
      value={q}
      onChange={(e) => onChange({ kind: 'text', q: e.target.value })}
      aria-label="Filter"
    />
  );
}
