'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { Chip, statusTone, when } from './ui';
import { DataGrid } from './data-grid';
import type { GridColumn } from '../lib/grid';
import { deep } from '../lib/grid';

export type { GridColumn };
export { deep };

export function ListPage({
  title,
  subtitle,
  path,
  columns,
  hrefFor,
  toolbar,
  selectable,
}: {
  title: string;
  subtitle?: string;
  path: string;
  columns: GridColumn[];
  hrefFor?: (row: Record<string, unknown>) => string;
  toolbar?: ReactNode;
  selectable?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<unknown>(path)
      .then((d) => setRows(Array.isArray(d) ? (d as Record<string, unknown>[]) : []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    setErr(null);
    load();
  }, [load]);

  return (
    <div>
      <div className="table-toolbar">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub" style={{ marginBottom: 0 }}>{subtitle}</p>}
        </div>
      </div>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        error={err}
        persistKey={path}
        onRefresh={load}
        toolbar={toolbar}
        selectable={selectable}
        onRowClick={hrefFor ? (row) => router.push(hrefFor(row)) : undefined}
      />
    </div>
  );
}

export function StatusCell({ value }: { value?: unknown }) {
  return <Chip tone={statusTone(String(value ?? ''))}>{String(value ?? '—')}</Chip>;
}

export function TimeCell({ value }: { value?: unknown }) {
  return <>{when(value as string)}</>;
}
