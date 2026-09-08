'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../toast';
import { KycStats } from './stats';
import { AccountBadge, Avatar, DocGlyph, KycProgress, KycStatusBadge } from './status';
import {
  DEFAULT_FILTERS,
  QUEUE_DOC_TYPES,
  DOC_TYPE_LABELS,
  activeFilterChips,
  canPerm,
  downloadText,
  formatDate,
  formatTime,
  loadSavedViews,
  queueQuery,
  relativeFrom,
  saveSavedViews,
  toCsv,
  type KycQueueResponse,
  type KycQueueRow,
  type QueueFilters,
  type QueueTab,
  type SavedView,
} from '../../lib/kyc';

const TABS: Array<{ id: QueueTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting Review' },
  { id: 'in_review', label: 'In Review' },
  { id: 'action_required', label: 'Action Required' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export function KycQueue() {
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<KycQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [busy, setBusy] = useState(false);
  const syncedAt = data?.generatedAt;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setViews(loadSavedViews());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<KycQueueResponse>(`/admin/drivers/kyc?${queueQuery(filters)}`);
      setData(res);
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 45000);
    return () => clearInterval(t);
  }, [load]);

  const rows = data?.items ?? [];
  const chips = useMemo(() => activeFilterChips(filters), [filters]);
  const canReview = canPerm(me?.permissions, 'kyc.review', 'kyc.approve');
  const canApprove = canPerm(me?.permissions, 'kyc.approve');
  const canReject = canPerm(me?.permissions, 'kyc.reject', 'kyc.approve');

  function patch(p: Partial<QueueFilters>) {
    setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }));
  }

  function exportCsv() {
    downloadText(`kyc-queue-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  }

  function saveView() {
    const name = window.prompt('Saved view name');
    if (!name?.trim()) return;
    const next = [...views, { id: crypto.randomUUID(), name: name.trim(), filters }];
    setViews(next);
    saveSavedViews(next);
    toast.push('View saved');
  }

  async function assign(ids: string[]) {
    if (!canReview || !ids.length) return;
    setBusy(true);
    try {
      await api('/admin/drivers/kyc/assign', {
        method: 'POST',
        body: JSON.stringify({ driverIds: ids }),
      });
      toast.push(ids.length > 1 ? `Assigned ${ids.length} applications` : 'Assigned to you');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="kyc-queue">
      <div className="kyc-page-head">
        <div>
          <h1 className="page-title">Driver Verification</h1>
          <p className="page-sub">
            Review driver identity, vehicle, licensing and compliance documents.
            {syncedAt ? (
              <span className="kyc-synced"> Last synced {relativeFrom(syncedAt, Date.now() + tick * 0)}</span>
            ) : null}
          </p>
        </div>
        <div className="row kyc-head-actions">
          <button className="btn ghost sm" type="button" onClick={() => void load()}>
            Refresh
          </button>
          <button className="btn ghost sm" type="button" onClick={exportCsv} disabled={!rows.length}>
            Export
          </button>
          <div className="kyc-menu-wrap">
            <button className="btn ghost sm" type="button" onClick={() => setViewsOpen((v) => !v)}>
              Saved Views
            </button>
            {viewsOpen && (
              <div className="kyc-pop" role="menu">
                <button type="button" onClick={saveView}>
                  Save current view
                </button>
                {views.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setFilters(v.filters);
                      setViewsOpen(false);
                    }}
                  >
                    {v.name}
                  </button>
                ))}
                {!views.length && <p className="muted">No saved views yet</p>}
              </div>
            )}
          </div>
          <div className="kyc-menu-wrap">
            <button className="btn ghost sm" type="button" onClick={() => setMoreOpen((v) => !v)}>
              More actions
            </button>
            {moreOpen && (
              <div className="kyc-pop" role="menu">
                <button type="button" disabled={!selected.size || !canReview} onClick={() => void assign([...selected])}>
                  Assign selected to me
                </button>
                <button type="button" onClick={exportCsv}>
                  Export CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <KycStats stats={data?.stats ?? null} />

      <div className="tabs kyc-tabs" role="tablist">
        {TABS.map((t) => {
          const count = data?.tabCounts?.[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filters.tab === t.id}
              className={filters.tab === t.id ? 'active' : ''}
              onClick={() => patch({ tab: t.id })}
            >
              {t.label}
              {typeof count === 'number' ? <span className="kyc-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="kyc-filterbar">
        <input
          className="field kyc-search"
          placeholder="Search name, email, phone, driver ID, plate…"
          value={filters.q}
          onChange={(e) => patch({ q: e.target.value })}
          aria-label="Search verification queue"
        />
        <select className="field" value={filters.accountStatus} onChange={(e) => patch({ accountStatus: e.target.value })} aria-label="Account status">
          <option value="">Account status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <select className="field" value={filters.documentStatus} onChange={(e) => patch({ documentStatus: e.target.value })} aria-label="Document status">
          <option value="">Document status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="NEEDS_RESUBMISSION">Needs resubmission</option>
        </select>
        <select className="field" value={filters.vehicleStatus} onChange={(e) => patch({ vehicleStatus: e.target.value })} aria-label="Vehicle status">
          <option value="">Vehicle</option>
          <option value="registered">Has vehicle</option>
          <option value="none">No vehicle</option>
        </select>
        <select className="field" value={filters.expiring} onChange={(e) => patch({ expiring: e.target.value })} aria-label="Expiring documents">
          <option value="">Expiry</option>
          <option value="30">Expiring 30 days</option>
          <option value="14">Expiring 14 days</option>
          <option value="7">Expiring 7 days</option>
          <option value="expired">Expired</option>
        </select>
        <select className="field" value={filters.datePreset} onChange={(e) => patch({ datePreset: e.target.value })} aria-label="Submitted date">
          <option value="">Submitted</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <input
          className="field"
          placeholder="Zone"
          value={filters.zone}
          onChange={(e) => patch({ zone: e.target.value })}
          aria-label="Operating zone"
        />
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => setFilters(DEFAULT_FILTERS)}
        >
          Clear all
        </button>
      </div>

      {chips.length > 0 && (
        <div className="kyc-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="kyc-chip"
              onClick={() => patch({ [c.key]: c.key === 'q' || c.key === 'zone' ? '' : '' } as Partial<QueueFilters>)}
            >
              {c.label} ×
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="err kyc-error">
          Unable to load verification data. {err}{' '}
          <button className="btn ghost sm" type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="panel kyc-table-panel">
        {loading && !data ? (
          <div className="dg-skel" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dg-skel-row" style={{ height: 44 }} />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="kyc-empty">
            <h3>You&apos;re all caught up</h3>
            <p className="muted">No applications currently require review in this view.</p>
          </div>
        ) : (
          <div className="table-wrap kyc-table-wrap">
            <table className="data kyc-table">
              <thead>
                <tr>
                  <th className="dg-check-th">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                      }
                      aria-label="Select all"
                    />
                  </th>
                  <th>Driver</th>
                  <th>Contact</th>
                  <th>KYC Progress</th>
                  <th>Documents</th>
                  <th>Submitted</th>
                  <th>Waiting Time</th>
                  <th>Account</th>
                  <th>Flags</th>
                  <th>Reviewer</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <QueueRow
                    key={r.id}
                    row={r}
                    checked={selected.has(r.id)}
                    menuOpen={menuFor === r.id}
                    canReview={canReview}
                    canApprove={canApprove}
                    canReject={canReject}
                    canImpersonate={hasPermission(me?.permissions, 'users.impersonate')}
                    busy={busy}
                    onCheck={(on) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (on) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      });
                    }}
                    onOpen={() => router.push(`/kyc/${r.id}`)}
                    onMenu={() => setMenuFor((id) => (id === r.id ? null : r.id))}
                    onAssign={() => void assign([r.id])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="dg-foot">
          <span className="muted">
            {data ? `${data.total} applications` : ''}
            {selected.size ? ` · ${selected.size} selected` : ''}
          </span>
          <div className="row">
            <select
              className="field dg-pagesize"
              value={filters.pageSize}
              onChange={(e) => patch({ pageSize: Number(e.target.value), page: 1 })}
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button className="btn ghost sm" type="button" disabled={filters.page <= 1} onClick={() => patch({ page: filters.page - 1 })}>
              Prev
            </button>
            <span className="muted">
              {filters.page} / {pages}
            </span>
            <button className="btn ghost sm" type="button" disabled={filters.page >= pages} onClick={() => patch({ page: filters.page + 1 })}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  row,
  checked,
  menuOpen,
  canReview,
  canApprove,
  canReject,
  canImpersonate,
  busy,
  onCheck,
  onOpen,
  onMenu,
  onAssign,
}: {
  row: KycQueueRow;
  checked: boolean;
  menuOpen: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canImpersonate: boolean;
  busy: boolean;
  onCheck: (on: boolean) => void;
  onOpen: () => void;
  onMenu: () => void;
  onAssign: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onMenu();
    }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen, onMenu]);

  return (
    <tr className={checked ? 'selected' : ''} onClick={onOpen}>
      <td className="dg-check-th" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${row.fullName}`} />
      </td>
      <td>
        <div className="kyc-driver-cell">
          <Avatar name={row.fullName} size={32} />
          <div>
            <strong>{row.fullName || 'Unnamed driver'}</strong>
            <div className="muted mono">{row.shortId}</div>
          </div>
        </div>
      </td>
      <td>
        <div className="kyc-contact">
          <div>{row.phone || '—'}</div>
          <div className="muted">{row.email || '—'}</div>
        </div>
      </td>
      <td>
        <KycProgress compact approved={row.progress.approved} required={row.progress.required} percent={row.progress.percent} />
      </td>
      <td>
        <div className="kyc-doc-inds">
          {QUEUE_DOC_TYPES.map((t) => (
            <DocGlyph key={t} indicator={row.docs[t]?.indicator ?? 'missing'} title={DOC_TYPE_LABELS[t]} />
          ))}
        </div>
      </td>
      <td>
        <div>
          {formatDate(row.submittedAt)}
          <div className="muted">{formatTime(row.submittedAt)}</div>
        </div>
      </td>
      <td>
        <span className={`kyc-wait ${row.waitingSla}`}>{row.waitingLabel}</span>
      </td>
      <td>
        <AccountBadge status={row.accountStatus} isActivated={row.isActivated} isSuspended={row.isSuspended} />
      </td>
      <td>
        <div className="kyc-flags">
          {row.flags.length
            ? row.flags.map((f) => (
                <span key={f.id} className="kyc-flag">
                  {f.label}
                </span>
              ))
            : '—'}
        </div>
      </td>
      <td>{row.reviewer ? row.reviewer.name : <span className="muted">Unassigned</span>}</td>
      <td>
        <KycStatusBadge status={row.approvalStatus} />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className="kyc-menu-wrap" ref={menuRef}>
          <button className="btn ghost sm kyc-more" type="button" aria-label="Actions" onClick={onMenu}>
            ⋯
          </button>
          {menuOpen && (
            <div className="kyc-pop right" role="menu">
              <button type="button" onClick={onOpen}>
                Open review
              </button>
              {canReview && (
                <button type="button" disabled={busy} onClick={onAssign}>
                  Assign to me
                </button>
              )}
              {canApprove && (
                <button type="button" onClick={onOpen}>
                  Approve if eligible
                </button>
              )}
              {canReview && (
                <button type="button" onClick={onOpen}>
                  Request resubmission
                </button>
              )}
              {canReject && (
                <button type="button" onClick={onOpen}>
                  Reject KYC
                </button>
              )}
              <a href={`/users/${row.userId}`}>View driver</a>
              {canImpersonate && <a href={`/kyc/${row.id}`}>Login as driver</a>}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
