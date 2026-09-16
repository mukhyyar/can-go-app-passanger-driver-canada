'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../toast';
import { EmptyState } from '../ui';
import { ImpersonateButton } from '../impersonate';
import { UserKpiStrip } from './kpi-strip';
import { UserFilterDrawer } from './filter-drawer';
import { UserPreviewDrawer } from './preview-drawer';
import { SuspendUserModal } from './suspend-modal';
import { ResetPasswordModal } from './reset-password-modal';
import {
  AccountStatusBadge,
  KycBadge,
  RiskBadge,
  RoleBadge,
  UserAvatar,
  VerifyIcon,
} from './badges';
import {
  DEFAULT_USER_FILTERS,
  activeUserFilterChips,
  clearChip,
  downloadText,
  kpiToFilters,
  loadSavedUserViews,
  loadSearchHistory,
  pushSearchHistory,
  relativeTime,
  saveSavedUserViews,
  shortId,
  usersQuery,
  usersToCsv,
  type KpiKey,
  type SavedUserView,
  type UserListRow,
  type UserStats,
  type UsersFilters,
  type UsersListResponse,
} from '../../lib/users';

type MenuState = { id: string; x: number; y: number; kind: 'actions' | 'copy' } | null;

export function UsersWorkspace() {
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState<UsersFilters>(DEFAULT_USER_FILTERS);
  const [draftFilters, setDraftFilters] = useState<UsersFilters>(DEFAULT_USER_FILTERS);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [views, setViews] = useState<SavedUserView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<UserListRow | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [suspendTargets, setSuspendTargets] = useState<UserListRow[] | null>(null);
  const [suspendMode, setSuspendMode] = useState(true);
  const [resetTarget, setResetTarget] = useState<UserListRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>('total');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const canSuspend = hasPermission(me?.permissions, 'users.suspend');
  const canResetPassword = hasPermission(me?.permissions, 'users.reset_password');
  const canImpersonate = hasPermission(me?.permissions, 'users.impersonate');
  const canRisk = hasPermission(me?.permissions, 'risk.act');

  useEffect(() => {
    setViews(loadSavedUserViews());
    setHistory(loadSearchHistory());
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api<UserStats>('/admin/users/stats'));
    } catch {
      /* non-blocking */
    }
  }, []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setErr(null);
    try {
      const res = await api<UsersListResponse>(`/admin/users?${usersQuery(filters)}`, {
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      setData(res);
      setSelected(new Set());
    } catch (e) {
      if (ac.signal.aborted) return;
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => {
        if (f.q === searchInput) return f;
        return { ...f, q: searchInput, page: 1 };
      });
      if (searchInput.trim().length >= 2) {
        pushSearchHistory(searchInput);
        setHistory(loadSearchHistory());
      }
    }, 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        searchRef.current?.focus();
        setShowHistory(true);
      }
      if (e.key === 'Escape') {
        setMenu(null);
        setShowHistory(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows = data?.items ?? [];
  const chips = useMemo(() => activeUserFilterChips(filters), [filters]);
  const rowMap = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function patch(p: Partial<UsersFilters>) {
    setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }));
  }

  function applyKpi(key: KpiKey) {
    setActiveKpi(key);
    const next = kpiToFilters(key, filters);
    setFilters(next);
    setSearchInput(next.q);
  }

  function openFilters() {
    setDraftFilters(filters);
    setFilterOpen(true);
  }

  function saveView() {
    const name = window.prompt('Saved view name');
    if (!name?.trim()) return;
    const next = [...views, { id: crypto.randomUUID(), name: name.trim(), filters }];
    setViews(next);
    saveSavedUserViews(next);
    toast.push('View saved');
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied`);
    } catch {
      toast.push(`Could not copy ${label}`);
    }
  }

  function openSuspend(targets: UserListRow[], suspending: boolean) {
    setSuspendTargets(targets);
    setSuspendMode(suspending);
  }

  async function confirmSuspend(payload: { reason: string; category: string }) {
    if (!suspendTargets?.length) return;
    setBusy(true);
    try {
      const reason = `${payload.category}: ${payload.reason}`;
      if (suspendTargets.length === 1) {
        await api(`/admin/users/${suspendTargets[0]!.id}/suspend`, {
          method: 'POST',
          body: JSON.stringify({ isSuspended: suspendMode, reason }),
        });
      } else {
        await api('/admin/users/bulk-suspend', {
          method: 'POST',
          body: JSON.stringify({
            userIds: suspendTargets.map((u) => u.id),
            isSuspended: suspendMode,
            reason,
          }),
        });
      }
      toast.push(suspendMode ? 'User(s) suspended' : 'User(s) reactivated');
      setSuspendTargets(null);
      setPreview(null);
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addWatchlist(user: UserListRow) {
    if (!canRisk) return;
    try {
      await api(`/admin/watchlist/${user.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Added from All Users' }),
      });
      toast.push('Added to watchlist');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e));
    }
  }

  function exportCsv() {
    const selectedRows = rows.filter((r) => selected.has(r.id));
    const out = selectedRows.length ? selectedRows : rows;
    downloadText(`users-${new Date().toISOString().slice(0, 10)}.csv`, usersToCsv(out));
    toast.push(`Exported ${out.length} users`);
  }

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className={`users-ops ${density}`}>
      <div className="users-ops-header">
        <div>
          <h1 className="page-title">All Users</h1>
          <p className="page-sub">
            Manage passengers, drivers, administrators, account status, verification, risk and
            marketplace activity.
          </p>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {data ? `${data.total.toLocaleString()} users` : '—'}
        </div>
      </div>

      <UserKpiStrip stats={stats} active={activeKpi} onSelect={applyKpi} />

      <div className="users-toolbar">
        <div className="users-search-wrap">
          <input
            ref={searchRef}
            className="field users-search"
            placeholder="Search name, email, phone, user ID, plate, ride, payment…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            aria-label="Search users"
          />
          {searchInput && (
            <button
              type="button"
              className="users-search-clear"
              aria-label="Clear search"
              onClick={() => setSearchInput('')}
            >
              ×
            </button>
          )}
          <kbd className="users-kbd">⌘K</kbd>
          {showHistory && history.length > 0 && (
            <div className="users-search-history">
              {history.map((h) => (
                <button key={h} type="button" onMouseDown={() => setSearchInput(h)}>
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="row users-toolbar-actions">
          <button
            type="button"
            className={`btn ghost sm ${chips.length ? 'on' : ''}`}
            onClick={openFilters}
          >
            Filters{chips.length ? ` (${chips.length})` : ''}
          </button>
          <div className="users-views">
            <button type="button" className="btn ghost sm" onClick={() => setViewsOpen((v) => !v)}>
              Saved views
            </button>
            {viewsOpen && (
              <div className="users-views-pop">
                <button type="button" onClick={saveView}>
                  + Save current view
                </button>
                {views.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setFilters(v.filters);
                      setSearchInput(v.filters.q);
                      setViewsOpen(false);
                      setActiveKpi(null);
                    }}
                  >
                    {v.name}
                  </button>
                ))}
                {views.length === 0 && <p className="muted" style={{ padding: 8 }}>No saved views</p>}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
          >
            Density
          </button>
          <button type="button" className="btn ghost sm" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="btn ghost sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="users-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="filter-chip"
              onClick={() => {
                setFilters(clearChip(filters, c.key));
                if (c.key === 'q') setSearchInput('');
                setActiveKpi(null);
              }}
            >
              {c.label} ×
            </button>
          ))}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setFilters(DEFAULT_USER_FILTERS);
              setSearchInput('');
              setActiveKpi('total');
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {err && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <p className="err">{err}</p>
          <button type="button" className="btn sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="users-table-wrap panel">
        <table className="users-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
              <th className="col-user">User</th>
              <th className="col-contact">Contact</th>
              <th className="col-role">Role</th>
              <th className="col-status">Status</th>
              <th className="col-kyc">KYC</th>
              <th className="col-risk">Risk</th>
              <th className="col-rides">Rides</th>
              <th className="col-active">Active</th>
              <th className="col-reg">Joined</th>
              <th className="col-loc">Loc</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="skeleton-row">
                  <td colSpan={12}>
                    <div className="skel" />
                  </td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={12}>
                  <EmptyState
                    title="No users match these filters"
                    description="Try clearing filters or searching by email, phone, or user ID."
                  />
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={selected.has(r.id) ? 'selected' : ''}
                  onClick={() => setPreview(r)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.displayName}`}
                    />
                  </td>
                  <td className="col-user">
                    <div className="user-cell">
                      <UserAvatar
                        name={r.displayName}
                        size={32}
                        hasAvatar={Boolean(r.hasAvatar)}
                        avatarPath={r.avatarPath}
                      />
                      <div>
                        <div className="user-cell-name">{r.displayName}</div>
                        <div className="muted mono" style={{ fontSize: 11 }}>
                          {shortId(r.id)}
                          {r.passengerProfile?.isVip ? ' · VIP' : ''}
                          {r.watchlisted ? ' · Watch' : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="col-contact">
                    <div className="contact-cell">
                      <div className="contact-line">
                        <span className="contact-email" title={r.email || undefined}>
                          {r.email || '—'}
                        </span>
                        <VerifyIcon ok={Boolean(r.email)} label="Email" />
                      </div>
                      <div className="contact-line muted">
                        <span className="contact-phone" title={r.phoneE164 || undefined}>
                          {r.phoneE164 || '—'}
                        </span>
                        <VerifyIcon ok={Boolean(r.phoneVerifiedAt)} label="Phone" />
                      </div>
                    </div>
                  </td>
                  <td className="col-role">
                    <RoleBadge role={r.role} />
                  </td>
                  <td className="col-status">
                    <AccountStatusBadge
                      suspended={r.isSuspended}
                      archived={r.accountStatus === 'ARCHIVED'}
                      anonymized={r.accountStatus === 'ANONYMIZED'}
                    />
                  </td>
                  <td className="col-kyc">
                    <KycBadge status={r.kycStatus} />
                  </td>
                  <td className="col-risk">
                    <RiskBadge band={r.riskBand} />
                  </td>
                  <td className="col-rides">{r.rideCount ?? '—'}</td>
                  <td className="col-active">{relativeTime(r.lastActiveAt)}</td>
                  <td className="col-reg">{relativeTime(r.createdAt)}</td>
                  <td className="col-loc">
                    <div className="loc-cell">{r.location || '—'}</div>
                    {r.plate ? <div className="muted" style={{ fontSize: 11 }}>{r.plate}</div> : null}
                  </td>
                  <td className="actions-cell col-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <Link className="btn ghost sm" href={`/users/${r.id}`} title="Open User 360">
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn ghost sm icon-btn"
                        aria-label="More actions"
                        title="More"
                        onClick={(e) =>
                          setMenu({ id: r.id, x: e.clientX, y: e.clientY, kind: 'actions' })
                        }
                      >
                        ···
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="users-pager">
          <span className="muted">
            {data
              ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`
              : '—'}
          </span>
          <select
            className="field"
            style={{ width: 110, marginBottom: 0 }}
            value={filters.pageSize}
            onChange={(e) => patch({ pageSize: Number(e.target.value), page: 1 })}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <div className="row">
            <button
              type="button"
              className="btn ghost sm"
              disabled={!data || data.page <= 1}
              onClick={() => patch({ page: filters.page - 1 })}
            >
              Prev
            </button>
            <span className="muted">
              Page {data?.page ?? 1} / {data?.totalPages ?? 1}
            </span>
            <button
              type="button"
              className="btn ghost sm"
              disabled={!data || data.page >= data.totalPages}
              onClick={() => patch({ page: filters.page + 1 })}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="users-bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <button type="button" className="btn ghost sm" onClick={exportCsv}>
            Export
          </button>
          {canRisk && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                for (const id of selected) {
                  const u = rowMap.get(id);
                  if (u) await addWatchlist(u);
                }
              }}
            >
              Watchlist
            </button>
          )}
          {canSuspend && (
            <>
              <button
                type="button"
                className="btn danger sm"
                onClick={() =>
                  openSuspend(
                    [...selected].map((id) => rowMap.get(id)!).filter(Boolean),
                    true,
                  )
                }
              >
                Suspend
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  openSuspend(
                    [...selected].map((id) => rowMap.get(id)!).filter(Boolean),
                    false,
                  )
                }
              >
                Reactivate
              </button>
            </>
          )}
          <button type="button" className="btn ghost sm" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {filterOpen && (
        <UserFilterDrawer
          draft={draftFilters}
          onChange={setDraftFilters}
          onClose={() => setFilterOpen(false)}
          onReset={() => setDraftFilters(DEFAULT_USER_FILTERS)}
          onApply={() => {
            setFilters({ ...draftFilters, page: 1 });
            setSearchInput(draftFilters.q);
            setFilterOpen(false);
            setActiveKpi(null);
          }}
        />
      )}

      {preview && (
        <UserPreviewDrawer
          user={preview}
          onClose={() => setPreview(null)}
          onSuspend={(u) => openSuspend([u], !u.isSuspended)}
          onResetPassword={(u) => setResetTarget(u)}
        />
      )}

      {suspendTargets && (
        <SuspendUserModal
          users={suspendTargets}
          suspending={suspendMode}
          busy={busy}
          onClose={() => setSuspendTargets(null)}
          onConfirm={confirmSuspend}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          userId={resetTarget.id}
          name={resetTarget.displayName}
          email={resetTarget.email}
          onClose={() => setResetTarget(null)}
        />
      )}

      {menu && (() => {
        const u = rowMap.get(menu.id);
        if (!u) return null;
        return (
          <div
            className="context-menu"
            style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 320) }}
            role="menu"
          >
            {menu.kind === 'copy' ? (
              <>
                <button type="button" onClick={() => { void copyText('User ID', u.id); setMenu(null); }}>Copy User ID</button>
                <button type="button" onClick={() => { void copyText('Name', u.displayName); setMenu(null); }}>Copy Name</button>
                {u.email && <button type="button" onClick={() => { void copyText('Email', u.email!); setMenu(null); }}>Copy Email</button>}
                {u.phoneE164 && <button type="button" onClick={() => { void copyText('Phone', u.phoneE164!); setMenu(null); }}>Copy Phone</button>}
                <button
                  type="button"
                  onClick={() => {
                    void copyText('Profile URL', `${window.location.origin}/users/${u.id}`);
                    setMenu(null);
                  }}
                >
                  Copy Profile URL
                </button>
              </>
            ) : (
              <>
                <div className="menu-group">VIEW</div>
                <button type="button" onClick={() => { router.push(`/users/${u.id}`); setMenu(null); }}>Open User 360</button>
                <button type="button" onClick={() => { window.open(`/users/${u.id}`, '_blank'); setMenu(null); }}>Open in New Tab</button>
                <div className="menu-group">ACCESS</div>
                {canImpersonate && (
                  <div onClick={() => setMenu(null)}>
                    <ImpersonateButton userId={u.id} name={u.displayName} variant="menu" />
                  </div>
                )}
                <div className="menu-group">COPY</div>
                <button type="button" onClick={() => { void copyText('User ID', u.id); setMenu(null); }}>Copy User ID</button>
                <button type="button" onClick={() => { void copyText('Name', u.displayName); setMenu(null); }}>Copy Name</button>
                {u.email && <button type="button" onClick={() => { void copyText('Email', u.email!); setMenu(null); }}>Copy Email</button>}
                {u.phoneE164 && <button type="button" onClick={() => { void copyText('Phone', u.phoneE164!); setMenu(null); }}>Copy Phone</button>}
                <button
                  type="button"
                  onClick={() => {
                    void copyText('Profile URL', `${window.location.origin}/users/${u.id}`);
                    setMenu(null);
                  }}
                >
                  Copy Profile URL
                </button>
                <div className="menu-group">ACCOUNT</div>
                {canResetPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(u);
                      setMenu(null);
                    }}
                  >
                    Reset Password
                  </button>
                )}
                {canSuspend && (
                  <button
                    type="button"
                    onClick={() => {
                      openSuspend([u], !u.isSuspended);
                      setMenu(null);
                    }}
                  >
                    {u.isSuspended ? 'Reactivate Account' : 'Suspend Account'}
                  </button>
                )}
                <div className="menu-group">VERIFICATION</div>
                {u.role === 'DRIVER' && u.driverProfile?.id && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/kyc/${u.driverProfile!.id}`);
                      setMenu(null);
                    }}
                  >
                    Review KYC
                  </button>
                )}
                <div className="menu-group">OPERATIONS</div>
                <button type="button" onClick={() => { router.push(`/rides?q=${u.id}`); setMenu(null); }}>View Rides</button>
                <button type="button" onClick={() => { router.push('/payments'); setMenu(null); }}>View Payments</button>
                <div className="menu-group">ADMIN</div>
                {canRisk && (
                  <button type="button" onClick={() => { void addWatchlist(u); setMenu(null); }}>
                    Add to Watchlist
                  </button>
                )}
                <div className="menu-group">DANGER ZONE</div>
                {(hasPermission(me?.permissions, 'users.archive') ||
                  hasPermission(me?.permissions, 'users.anonymize') ||
                  hasPermission(me?.permissions, 'users.delete')) && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/users/${u.id}?danger=1`);
                      setMenu(null);
                    }}
                  >
                    Archive / Anonymize / Delete…
                  </button>
                )}
                <button type="button" onClick={() => { setPreview(u); setMenu(null); }}>Quick Preview</button>
              </>
            )}
          </div>
        );
      })()}
      {menu && <div className="context-menu-back" onClick={() => setMenu(null)} role="presentation" />}
    </div>
  );
}
