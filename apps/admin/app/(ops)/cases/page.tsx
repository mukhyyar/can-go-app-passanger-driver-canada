'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';
import { Chip, Drawer, Modal, statusTone, when } from '../../../components/ui';

type AssigneeUser = {
  id: string;
  email: string;
  role?: string;
};

type CaseNote = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

type UserContact = {
  id: string;
  email?: string | null;
  phoneE164?: string | null;
};

type SupportCaseItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  assigneeId?: string | null;
  assignee?: AssigneeUser | null;
  createdById?: string;
  createdBy?: { id: string; email?: string | null; role?: string | null } | null;
  passengerProfileId?: string | null;
  passenger?: {
    id: string;
    fullName: string;
    userId: string;
    user?: UserContact | null;
  } | null;
  driverProfileId?: string | null;
  driver?: {
    id: string;
    fullName: string;
    userId: string;
    user?: UserContact | null;
  } | null;
  rideId?: string | null;
  ride?: {
    id: string;
    fromLabel?: string;
    toLabel?: string;
    status?: string;
    serviceType?: string;
    pickupAt?: string;
  } | null;
  paymentId?: string | null;
  payment?: { id: string; amount?: number; currency?: string; status?: string } | null;
  notes?: CaseNote[];
  createdAt: string;
  slaDueAt?: string | null;
  [key: string]: unknown;
};

const QUEUE_TABS = [
  { id: 'open', label: 'Open' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'assigned', label: 'Assigned to Me' },
  { id: 'escalated', label: 'Escalations' },
  { id: 'resolved', label: 'Resolved' },
] as const;

function typeTone(t?: string): 'info' | 'warn' | 'bad' | 'action' | 'default' {
  const v = (t ?? '').toUpperCase();
  if (v === 'SAFETY') return 'bad';
  if (v === 'DISPUTE') return 'warn';
  if (v === 'BILLING') return 'action';
  return 'info';
}

function getCaseRef(id?: string): string {
  if (!id) return '—';
  return `#CASE-${id.slice(-6).toUpperCase()}`;
}

function getRideCode(id?: string): string {
  if (!id) return '—';
  return `CG-RIDE-${id.slice(-6).toUpperCase()}`;
}

function CasesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const queue = sp.get('queue') ?? 'open';
  const { me } = useAuth();

  const [rows, setRows] = useState<SupportCaseItem[]>([]);
  const [title, setTitle] = useState('Support case');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Assignee list for assignment modal
  const [assignees, setAssignees] = useState<AssigneeUser[]>([]);

  // Action states
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignModalCase, setAssignModalCase] = useState<SupportCaseItem | null>(null);
  const [targetAssigneeId, setTargetAssigneeId] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  // Detail Drawer state
  const [selectedCase, setSelectedCase] = useState<SupportCaseItem | null>(null);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api<SupportCaseItem[]>(`/admin/cases?queue=${queue}`)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [queue]);

  useEffect(() => {
    load();
  }, [load]);

  // Load assignable admin users
  useEffect(() => {
    let cancelled = false;
    api<AssigneeUser[]>('/admin/cases/assignees')
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setAssignees(data);
      })
      .catch(() => {
        api<AssigneeUser[]>('/admin/admin-users')
          .then((data) => {
            if (!cancelled && Array.isArray(data)) setAssignees(data);
          })
          .catch(() => {
            /* ignore */
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create() {
    if (!title.trim()) return;
    try {
      await api('/admin/cases', { method: 'POST', body: JSON.stringify({ title: title.trim() }) });
      setTitle('Support case');
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const handleCopy = (id: string, textToCopy: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard?.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  async function handleAssignToMe(caseItem: SupportCaseItem) {
    if (!me?.id) return;
    setAssigningId(caseItem.id);
    try {
      const updated = await api<SupportCaseItem>(`/admin/cases/${caseItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: me.id }),
      });
      setRows((prev) => prev.map((r) => (r.id === caseItem.id ? { ...r, ...updated } : r)));
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningId(null);
    }
  }

  async function handleUnassign(caseItem: SupportCaseItem) {
    setAssigningId(caseItem.id);
    try {
      const updated = await api<SupportCaseItem>(`/admin/cases/${caseItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: null }),
      });
      setRows((prev) => prev.map((r) => (r.id === caseItem.id ? { ...r, ...updated } : r)));
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningId(null);
    }
  }

  async function handleStatusChange(caseItem: SupportCaseItem, status: string) {
    try {
      const updated = await api<SupportCaseItem>(`/admin/cases/${caseItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setRows((prev) => prev.map((r) => (r.id === caseItem.id ? { ...r, ...updated } : r)));
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddNote(caseItem: SupportCaseItem) {
    if (!newNote.trim()) return;
    setSubmittingNote(true);
    try {
      const updated = await api<SupportCaseItem>(`/admin/cases/${caseItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: newNote.trim() }),
      });
      setNewNote('');
      setRows((prev) => prev.map((r) => (r.id === caseItem.id ? { ...r, ...updated } : r)));
      if (selectedCase?.id === caseItem.id) {
        setSelectedCase((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingNote(false);
    }
  }

  function openAssignModal(caseItem: SupportCaseItem) {
    setAssignModalCase(caseItem);
    setTargetAssigneeId(caseItem.assigneeId || '');
    setTransferNote('');
  }

  function closeAssignModal() {
    setAssignModalCase(null);
    setTargetAssigneeId('');
    setTransferNote('');
  }

  async function submitAssignModal() {
    if (!assignModalCase) return;
    setAssignSubmitting(true);
    try {
      const updated = await api<SupportCaseItem>(`/admin/cases/${assignModalCase.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigneeId: targetAssigneeId ? targetAssigneeId : null,
          note: transferNote.trim() ? transferNote.trim() : undefined,
        }),
      });
      setRows((prev) => prev.map((r) => (r.id === assignModalCase.id ? { ...r, ...updated } : r)));
      if (selectedCase?.id === assignModalCase.id) {
        setSelectedCase((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      closeAssignModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Support Cases
          </h1>
          <p className="page-sub" style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Manage support requests, passenger/driver dispute investigations, and SLA workflows with full party context.
          </p>
        </div>
      </div>

      {/* Interactive Queue Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {QUEUE_TABS.map((tab) => {
          const isActive = queue === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`btn sm ${isActive ? 'active' : 'ghost'}`}
              style={
                isActive
                  ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)', fontWeight: 700 }
                  : { fontWeight: 500 }
              }
              onClick={() => router.push(`/cases?queue=${tab.id}`)}
            >
              {tab.label}
              {queue === tab.id && rows.length > 0 ? (
                <span
                  style={{
                    marginLeft: 6,
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--line)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 10,
                  }}
                >
                  {rows.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <DataGrid
        rows={rows as unknown as Record<string, unknown>[]}
        loading={loading}
        error={err}
        persistKey={`cases-v3-${queue}`}
        onRefresh={load}
        onRowClick={(row) => setSelectedCase(row as unknown as SupportCaseItem)}
        emptyText="No support cases found in this queue"
        toolbar={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input
              className="field"
              style={{ width: 280, margin: 0 }}
              value={title}
              placeholder="Quick case title..."
              onChange={(e) => setTitle(e.target.value)}
            />
            <button className="btn sm" type="button" onClick={create}>
              ＋ New Case
            </button>
          </div>
        }
        columns={[
          {
            key: 'ref',
            label: 'Case #',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              return `${getCaseRef(item.id)} ${item.id}`;
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              const ref = getCaseRef(item.id);
              const isCopied = copiedId === item.id;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 700,
                      fontSize: 12,
                      color: 'var(--brand)',
                      background: 'rgba(220, 38, 38, 0.08)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {ref}
                  </span>
                  <button
                    type="button"
                    title="Copy full Case ID"
                    onClick={(e) => handleCopy(item.id, item.id, e)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: isCopied ? '#059669' : 'var(--muted)',
                      padding: '2px 4px',
                    }}
                  >
                    {isCopied ? '✓' : '⧉'}
                  </button>
                </div>
              );
            },
          },
          {
            key: 'passenger',
            label: 'Passenger (Rider)',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              const p = item.passenger;
              return `${p?.fullName ?? ''} ${p?.user?.phoneE164 ?? ''} ${p?.user?.email ?? ''} ${p?.userId ?? ''}`;
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              const p = item.passenger;
              if (!p) return <span className="muted">—</span>;
              return (
                <div>
                  <Link
                    href={`/users/${p.userId}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--text)',
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                    title="Open User 360 profile"
                  >
                    {p.fullName || 'User'} ↗
                  </Link>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {p.user?.phoneE164 || p.user?.email || p.userId.slice(0, 8)}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'driver',
            label: 'Driver',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              const d = item.driver;
              return `${d?.fullName ?? ''} ${d?.user?.phoneE164 ?? ''} ${d?.user?.email ?? ''} ${d?.userId ?? ''}`;
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              const d = item.driver;
              if (!d) return <span className="muted">—</span>;
              return (
                <div>
                  <Link
                    href={`/users/${d.userId}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--text)',
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                    title="Open Driver User 360 profile"
                  >
                    {d.fullName || 'Driver'} ↗
                  </Link>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {d.user?.phoneE164 || d.user?.email || d.userId.slice(0, 8)}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'ride',
            label: 'Ride / Trip',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              const rd = item.ride;
              return `${rd?.id ? getRideCode(rd.id) : ''} ${rd?.fromLabel ?? ''} ${rd?.toLabel ?? ''} ${rd?.status ?? ''}`;
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              const rd = item.ride;
              if (!rd) return <span className="muted">—</span>;
              const rideCode = getRideCode(rd.id);
              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link
                      href={`/rides/${rd.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        color: 'var(--brand)',
                        textDecoration: 'none',
                      }}
                      title="Open Ride Console"
                    >
                      {rideCode} ↗
                    </Link>
                    {rd.status && (
                      <Chip tone={statusTone(rd.status)} style={{ fontSize: 9, padding: '1px 5px' }}>
                        {rd.status}
                      </Chip>
                    )}
                  </div>
                  {(rd.fromLabel || rd.toLabel) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        maxWidth: 220,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 2,
                      }}
                      title={`${rd.fromLabel || '—'} → ${rd.toLabel || '—'}`}
                    >
                      {rd.fromLabel || '—'} → {rd.toLabel || '—'}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'title',
            label: 'Title & Category',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              return `${item.title} ${item.type}`;
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              return (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                    {item.title}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <Chip tone={typeTone(item.type)} style={{ fontSize: 10, padding: '1px 6px' }}>
                      {item.type}
                    </Chip>
                  </div>
                </div>
              );
            },
          },
          {
            key: 'assignee',
            label: 'Assignee',
            type: 'text',
            getValue: (r) => {
              const item = r as unknown as SupportCaseItem;
              return item.assignee?.email || 'Unassigned';
            },
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              if (!item.assigneeId || !item.assignee) {
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <Chip tone="warn" style={{ fontWeight: 600, fontSize: 11 }}>
                      Unassigned
                    </Chip>
                    {me?.id && (
                      <button
                        className="btn sm"
                        style={{ padding: '2px 6px', fontSize: 10 }}
                        type="button"
                        disabled={assigningId === item.id}
                        onClick={() => handleAssignToMe(item)}
                      >
                        {assigningId === item.id ? '...' : 'Take'}
                      </button>
                    )}
                  </div>
                );
              }
              const isMe = me?.id === item.assignee.id;
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: isMe ? '#dbeafe' : '#f1f1f1',
                      color: isMe ? '#1d4ed8' : '#333',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {item.assignee.email ? item.assignee.email.slice(0, 2).toUpperCase() : 'AD'}
                  </span>
                  <span style={{ fontSize: 12 }}>{item.assignee.email}</span>
                  {isMe && <Chip tone="ok" style={{ fontSize: 10, padding: '1px 5px' }}>You</Chip>}
                </div>
              );
            },
          },
          {
            key: 'status',
            label: 'Status',
            type: 'enum',
            getValue: (r) => String((r as unknown as SupportCaseItem).status ?? ''),
            render: (r) => <StatusCell value={String(r.status ?? '')} />,
          },
          {
            key: 'createdAt',
            label: 'Opened',
            type: 'date',
            getValue: (r) => String((r as unknown as SupportCaseItem).createdAt ?? ''),
            render: (r) => (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {when(r.createdAt as string)}
              </span>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            type: 'text',
            render: (r) => {
              const item = r as unknown as SupportCaseItem;
              return (
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn ghost sm"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    type="button"
                    onClick={() => openAssignModal(item)}
                  >
                    {item.assigneeId ? 'Reassign' : 'Assign'}
                  </button>
                  <button
                    className="btn ghost sm"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    type="button"
                    onClick={() => setSelectedCase(item)}
                  >
                    Details
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      {/* Assign / Reassign Modal */}
      {assignModalCase && (
        <Modal
          title={`Assign Case · ${getCaseRef(assignModalCase.id)}`}
          onClose={closeAssignModal}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {assignModalCase.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>Type: <strong>{assignModalCase.type}</strong></span>
                <span>Status: <strong>{assignModalCase.status}</strong></span>
                <span>
                  Current Assignee:{' '}
                  <strong>{assignModalCase.assignee?.email || 'Unassigned'}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {me?.id && (
                <button
                  type="button"
                  className="btn sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setTargetAssigneeId(me.id)}
                >
                  Assign to Me ({me.email})
                </button>
              )}
              {assignModalCase.assigneeId && (
                <button
                  type="button"
                  className="btn ghost sm bad"
                  style={{ fontSize: 11 }}
                  onClick={() => setTargetAssigneeId('')}
                >
                  Unassign (Move to pool)
                </button>
              )}
            </div>

            <div>
              <label className="label-xs">Assign to Administrator</label>
              <select
                className="field"
                style={{ width: '100%' }}
                value={targetAssigneeId}
                onChange={(e) => setTargetAssigneeId(e.target.value)}
              >
                <option value="">-- Unassigned (Available in Pool) --</option>
                {assignees.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.email} {admin.role ? `(${admin.role})` : ''}
                    {me?.id === admin.id ? ' [You]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-xs">Assignment / Transfer Note (Optional)</label>
              <textarea
                className="field"
                style={{ width: '100%', minHeight: 70 }}
                placeholder="Add context or instructions for this assignment..."
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn ghost sm" type="button" onClick={closeAssignModal}>
                Cancel
              </button>
              <button
                className="btn sm"
                type="button"
                disabled={assignSubmitting}
                onClick={submitAssignModal}
              >
                {assignSubmitting ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Case Detail Drawer with Full Identifiers */}
      {selectedCase && (
        <Drawer
          title={`Support Case · ${getCaseRef(selectedCase.id)}`}
          onClose={() => setSelectedCase(null)}
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Title & Status Strip */}
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--brand)',
                    background: 'rgba(220, 38, 38, 0.08)',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {getCaseRef(selectedCase.id)}
                </span>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => handleCopy(selectedCase.id, selectedCase.id)}
                  style={{ fontSize: 11 }}
                >
                  {copiedId === selectedCase.id ? '✓ ID Copied' : '⧉ Copy Full ID'}
                </button>
              </div>

              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
                {selectedCase.title}
              </h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip tone={typeTone(selectedCase.type)}>{selectedCase.type}</Chip>
                <StatusCell value={selectedCase.status} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Opened: {when(selectedCase.createdAt)}
                </span>
                {selectedCase.slaDueAt && (
                  <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                    SLA Due: {new Date(selectedCase.slaDueAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Identified Parties Context */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: '#fafbfc' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Case Identification & Linked Parties
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {/* Passenger Card */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      Passenger (Rider)
                    </span>
                    {selectedCase.passenger && <Chip tone="info" style={{ fontSize: 9 }}>PAX</Chip>}
                  </div>
                  {selectedCase.passenger ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {selectedCase.passenger.fullName || 'User'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {selectedCase.passenger.user?.phoneE164 || 'No phone'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {selectedCase.passenger.user?.email || 'No email'}
                      </div>
                      <Link
                        href={`/users/${selectedCase.passenger.userId}`}
                        style={{
                          fontSize: 12,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        Open Passenger 360 Profile →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>No passenger linked</span>
                  )}
                </div>

                {/* Driver Card */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      Driver
                    </span>
                    {selectedCase.driver && <Chip tone="action" style={{ fontSize: 9 }}>DRIVER</Chip>}
                  </div>
                  {selectedCase.driver ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                        {selectedCase.driver.fullName || 'Driver'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {selectedCase.driver.user?.phoneE164 || 'No phone'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {selectedCase.driver.user?.email || 'No email'}
                      </div>
                      <Link
                        href={`/users/${selectedCase.driver.userId}`}
                        style={{
                          fontSize: 12,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        Open Driver User Profile →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>No driver linked</span>
                  )}
                </div>

                {/* Ride Card */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      Ride Details
                    </span>
                    {selectedCase.ride?.status && (
                      <Chip tone={statusTone(selectedCase.ride.status)} style={{ fontSize: 9 }}>
                        {selectedCase.ride.status}
                      </Chip>
                    )}
                  </div>
                  {selectedCase.ride ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>
                        {getRideCode(selectedCase.ride.id)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        <strong>From:</strong> {selectedCase.ride.fromLabel || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        <strong>To:</strong> {selectedCase.ride.toLabel || '—'}
                      </div>
                      <Link
                        href={`/rides/${selectedCase.ride.id}`}
                        style={{
                          fontSize: 12,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        Open Ride Console →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>No ride linked</span>
                  )}
                </div>

                {/* Payment Card */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      Payment
                    </span>
                    {selectedCase.payment?.status && (
                      <Chip tone={statusTone(selectedCase.payment.status)} style={{ fontSize: 9 }}>
                        {selectedCase.payment.status}
                      </Chip>
                    )}
                  </div>
                  {selectedCase.payment ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {selectedCase.payment.currency || 'CAD'} ${Number(selectedCase.payment.amount || 0).toFixed(2)}
                      </div>
                      <Link
                        href={`/payments/${selectedCase.payment.id}`}
                        style={{
                          fontSize: 12,
                          color: 'var(--brand)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          marginTop: 6,
                        }}
                      >
                        Open Payment Details →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>No payment linked</span>
                  )}
                </div>
              </div>
            </div>

            {/* Assignee Card */}
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: 14,
                background: '#fcfcfc',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Current Assignee
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                {selectedCase.assignee ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#e0e7ff',
                        color: '#3730a3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {selectedCase.assignee.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedCase.assignee.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {selectedCase.assignee.role || 'Admin'}
                        {me?.id === selectedCase.assignee.id && ' · Assigned to You'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Chip tone="warn" style={{ fontWeight: 700 }}>Unassigned Pool</Chip>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>No admin currently assigned</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  {me?.id && selectedCase.assigneeId !== me.id && (
                    <button
                      className="btn sm"
                      style={{ fontSize: 11 }}
                      type="button"
                      disabled={assigningId === selectedCase.id}
                      onClick={() => handleAssignToMe(selectedCase)}
                    >
                      {assigningId === selectedCase.id ? 'Assigning...' : 'Assign to me'}
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    style={{ fontSize: 11 }}
                    type="button"
                    onClick={() => openAssignModal(selectedCase)}
                  >
                    {selectedCase.assigneeId ? 'Reassign...' : 'Assign...'}
                  </button>
                  {selectedCase.assigneeId && (
                    <button
                      className="btn ghost sm bad"
                      style={{ fontSize: 11 }}
                      type="button"
                      disabled={assigningId === selectedCase.id}
                      onClick={() => handleUnassign(selectedCase)}
                    >
                      Unassign
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Status Controls */}
            <div>
              <label className="label-xs">Update Case Status</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['OPEN', 'PENDING', 'UNDER_REVIEW', 'ASSIGNED', 'LEGAL_ISSUE', 'ESCALATED', 'RESOLVED', 'DISMISSED'] as const).map((st) => {
                  const isCurrent = selectedCase.status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      className={`btn sm ${isCurrent ? '' : 'ghost'}`}
                      style={
                        isCurrent
                          ? { background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 11 }
                          : { fontSize: 11 }
                      }
                      onClick={() => handleStatusChange(selectedCase, st)}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes & Activity History */}
            <div>
              <label className="label-xs">Internal Notes & History</label>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 240,
                  overflowY: 'auto',
                  marginBottom: 12,
                  paddingRight: 4,
                }}
              >
                {selectedCase.notes && selectedCase.notes.length > 0 ? (
                  selectedCase.notes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        background: '#f9f9f9',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}>
                        <span>Author ID: {note.authorId}</span>
                        <span>{when(note.createdAt)}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '12px 0' }}>
                    No internal notes recorded yet.
                  </div>
                )}
              </div>

              {/* Add Note Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="field"
                  style={{ width: '100%', minHeight: 60, marginBottom: 0 }}
                  placeholder="Write an internal note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn sm"
                    type="button"
                    disabled={submittingNote || !newNote.trim()}
                    onClick={() => handleAddNote(selectedCase)}
                  >
                    {submittingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CasesInner />
    </Suspense>
  );
}
