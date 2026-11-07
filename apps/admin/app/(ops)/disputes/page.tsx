'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';
import { Chip, Drawer, Modal, statusTone } from '../../../components/ui';

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

type DisputeItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  assigneeId?: string | null;
  assignee?: AssigneeUser | null;
  passengerProfileId?: string | null;
  passenger?: { id: string; fullName: string; userId: string } | null;
  driverProfileId?: string | null;
  driver?: { id: string; fullName: string; userId: string } | null;
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

const DISPUTE_SITUATIONS = [
  { value: 'OPEN', label: 'Open (New Dispute)' },
  { value: 'PENDING', label: 'Pending (Awaiting Info)' },
  { value: 'UNDER_REVIEW', label: 'Under Review (Investigating)' },
  { value: 'ASSIGNED', label: 'Assigned to Agent' },
  { value: 'LEGAL_ISSUE', label: 'Legal Issue (Legal Hold)' },
  { value: 'ESCALATED', label: 'Escalated (Supervisor)' },
  { value: 'RESOLVED', label: 'Resolved (Closed)' },
  { value: 'DISMISSED', label: 'Dismissed (Invalid Claim)' },
] as const;

const DISPUTE_QUEUES = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Pending Info' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'legal', label: 'Legal Issue' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All Disputes' },
] as const;

function DisputesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const queue = sp.get('queue') ?? 'open';
  const { me } = useAuth();

  const [rows, setRows] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Assignee list for assignment modal
  const [assignees, setAssignees] = useState<AssigneeUser[]>([]);

  // Action states
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Status transition dialog state
  const [statusDialog, setStatusDialog] = useState<{
    dispute: DisputeItem;
    targetStatus: string;
    note: string;
  } | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Assign Modal state
  const [assignModalDispute, setAssignModalDispute] = useState<DisputeItem | null>(null);
  const [targetAssigneeId, setTargetAssigneeId] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api<DisputeItem[]>(`/admin/cases?type=DISPUTE&queue=${queue}`)
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

  async function handleQuickStatusChange(dispute: DisputeItem, status: string, note?: string) {
    setUpdatingId(dispute.id);
    try {
      const updated = await api<DisputeItem>(`/admin/cases/${dispute.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      });
      setRows((prev) => prev.map((r) => (r.id === dispute.id ? { ...r, ...updated } : r)));
      if (selectedDispute?.id === dispute.id) {
        setSelectedDispute((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  function promptStatusChange(dispute: DisputeItem, targetStatus: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setStatusDialog({
      dispute,
      targetStatus,
      note: '',
    });
  }

  async function confirmStatusChange() {
    if (!statusDialog) return;
    setSubmittingStatus(true);
    try {
      await handleQuickStatusChange(
        statusDialog.dispute,
        statusDialog.targetStatus,
        statusDialog.note.trim() || undefined,
      );
      setStatusDialog(null);
    } finally {
      setSubmittingStatus(false);
    }
  }

  async function handleAssignToMe(dispute: DisputeItem, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!me?.id) return;
    setUpdatingId(dispute.id);
    try {
      const updated = await api<DisputeItem>(`/admin/cases/${dispute.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: me.id }),
      });
      setRows((prev) => prev.map((r) => (r.id === dispute.id ? { ...r, ...updated } : r)));
      if (selectedDispute?.id === dispute.id) {
        setSelectedDispute((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddNote(dispute: DisputeItem) {
    if (!newNote.trim()) return;
    setSubmittingNote(true);
    try {
      const updated = await api<DisputeItem>(`/admin/cases/${dispute.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: newNote.trim() }),
      });
      setNewNote('');
      setRows((prev) => prev.map((r) => (r.id === dispute.id ? { ...r, ...updated } : r)));
      if (selectedDispute?.id === dispute.id) {
        setSelectedDispute((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingNote(false);
    }
  }

  function openAssignModal(dispute: DisputeItem, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setAssignModalDispute(dispute);
    setTargetAssigneeId(dispute.assigneeId || '');
    setTransferNote('');
  }

  async function submitAssignModal() {
    if (!assignModalDispute) return;
    setAssignSubmitting(true);
    try {
      const updated = await api<DisputeItem>(`/admin/cases/${assignModalDispute.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigneeId: targetAssigneeId ? targetAssigneeId : null,
          note: transferNote.trim() ? transferNote.trim() : undefined,
        }),
      });
      setRows((prev) => prev.map((r) => (r.id === assignModalDispute.id ? { ...r, ...updated } : r)));
      if (selectedDispute?.id === assignModalDispute.id) {
        setSelectedDispute((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      setAssignModalDispute(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Dispute Management
          </h1>
          <p className="page-sub" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Investigate, review evidence, set situation status, and resolve customer and driver disputes.
          </p>
        </div>
      </div>

      {/* Interactive Situation Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {DISPUTE_QUEUES.map((tab) => {
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
              onClick={() => router.push(`/disputes?queue=${tab.id}`)}
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
        persistKey={`disputes-${queue}`}
        onRefresh={load}
        onRowClick={(row) => setSelectedDispute(row as unknown as DisputeItem)}
        columns={[
          {
            key: 'id',
            label: 'Dispute ID',
            type: 'text',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              return (
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, fontSize: 12 }}>
                  #{item.id ? item.id.slice(-6).toUpperCase() : '—'}
                </span>
              );
            },
          },
          {
            key: 'title',
            label: 'Dispute & Reason',
            type: 'text',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              const isPassenger = item.title.includes('PASSENGER');
              const isDriver = item.title.includes('DRIVER');
              return (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {isPassenger && <Chip tone="info" style={{ fontSize: 10 }}>Reported by Passenger</Chip>}
                    {isDriver && <Chip tone="action" style={{ fontSize: 10 }}>Reported by Driver</Chip>}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'status',
            label: 'Situation / Status',
            type: 'enum',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              const isUpdating = updatingId === item.id;
              return (
                <div
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <select
                    className="field"
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      margin: 0,
                      height: 28,
                      width: 'auto',
                      borderRadius: 6,
                    }}
                    value={item.status}
                    disabled={isUpdating}
                    onChange={(e) => {
                      const newSt = e.target.value;
                      if (['RESOLVED', 'LEGAL_ISSUE', 'DISMISSED'].includes(newSt)) {
                        promptStatusChange(item, newSt);
                      } else {
                        handleQuickStatusChange(item, newSt);
                      }
                    }}
                  >
                    {DISPUTE_SITUATIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <StatusCell value={item.status} />
                </div>
              );
            },
          },
          {
            key: 'assignee',
            label: 'Assignee',
            type: 'text',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              if (!item.assigneeId || !item.assignee) {
                return (
                  <Chip tone="warn" style={{ fontWeight: 600, fontSize: 11 }}>
                    Unassigned
                  </Chip>
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
            key: 'context',
            label: 'Linked Parties & Ride',
            type: 'text',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              const chips: React.ReactNode[] = [];
              if (item.passenger) {
                chips.push(
                  <Link
                    key="pax"
                    href={`/users/${item.passenger.userId}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ textDecoration: 'none' }}
                  >
                    <Chip tone="info" style={{ fontSize: 11, cursor: 'pointer' }}>
                      Pax: {item.passenger.fullName || 'User'}
                    </Chip>
                  </Link>,
                );
              }
              if (item.driver) {
                chips.push(
                  <Link
                    key="drv"
                    href={`/users/${item.driver.userId}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ textDecoration: 'none' }}
                  >
                    <Chip tone="action" style={{ fontSize: 11, cursor: 'pointer' }}>
                      Drv: {item.driver.fullName || 'Driver'}
                    </Chip>
                  </Link>,
                );
              }
              if (item.ride) {
                chips.push(
                  <Chip key="ride" tone="default" style={{ fontSize: 11 }}>
                    Ride: CG-RIDE-{item.ride.id.slice(-5).toUpperCase()}
                  </Chip>,
                );
              }
              if (chips.length === 0) return <span className="muted">—</span>;
              return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{chips}</div>;
            },
          },
          {
            key: 'createdAt',
            label: 'Reported',
            type: 'date',
            render: (r) => (r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : '—'),
          },
          {
            key: 'actions',
            label: 'Quick Actions',
            type: 'text',
            render: (r) => {
              const item = r as unknown as DisputeItem;
              const isMe = me?.id && item.assigneeId === me.id;
              const isUpdating = updatingId === item.id;
              const isResolved = item.status === 'RESOLVED' || item.status === 'DISMISSED';
              const isLegal = item.status === 'LEGAL_ISSUE';

              return (
                <div
                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!isMe && (
                    <button
                      className="btn sm"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      type="button"
                      disabled={isUpdating}
                      onClick={(e) => handleAssignToMe(item, e)}
                    >
                      Assign to me
                    </button>
                  )}
                  {!isResolved && (
                    <button
                      className="btn sm"
                      style={{ padding: '4px 8px', fontSize: 11, background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
                      type="button"
                      disabled={isUpdating}
                      onClick={(e) => promptStatusChange(item, 'RESOLVED', e)}
                    >
                      Resolve
                    </button>
                  )}
                  {!isLegal && !isResolved && (
                    <button
                      className="btn ghost sm bad"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      type="button"
                      disabled={isUpdating}
                      onClick={(e) => promptStatusChange(item, 'LEGAL_ISSUE', e)}
                    >
                      Legal
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    type="button"
                    onClick={() => setSelectedDispute(item)}
                  >
                    Review
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      {/* Status Reason / Confirmation Dialog */}
      {statusDialog && (
        <Modal
          title={`Update Dispute Situation · #${statusDialog.dispute.id.slice(-6).toUpperCase()}`}
          onClose={() => setStatusDialog(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {statusDialog.dispute.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>
                  Current Status: <strong>{statusDialog.dispute.status}</strong>
                </span>
                <span>
                  New Situation:{' '}
                  <strong style={{ color: 'var(--brand)' }}>{statusDialog.targetStatus}</strong>
                </span>
              </div>
            </div>

            <div>
              <label className="label-xs">
                Resolution Notes / Situation Reason (Recommended)
              </label>
              <textarea
                className="field"
                style={{ width: '100%', minHeight: 80, marginBottom: 0 }}
                placeholder={
                  statusDialog.targetStatus === 'RESOLVED'
                    ? 'State resolution details (e.g. issued partial refund of CA$15, driver counseled)...'
                    : statusDialog.targetStatus === 'LEGAL_ISSUE'
                      ? 'Describe legal hold context or law enforcement file number...'
                      : 'Add reasoning for this status transition...'
                }
                value={statusDialog.note}
                onChange={(e) =>
                  setStatusDialog((prev) => (prev ? { ...prev, note: e.target.value } : null))
                }
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button
                className="btn ghost sm"
                type="button"
                onClick={() => setStatusDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn sm"
                type="button"
                disabled={submittingStatus}
                onClick={confirmStatusChange}
              >
                {submittingStatus ? 'Updating...' : `Confirm as ${statusDialog.targetStatus}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign / Reassign Modal */}
      {assignModalDispute && (
        <Modal
          title={`Assign Dispute · #${assignModalDispute.id.slice(-6).toUpperCase()}`}
          onClose={() => setAssignModalDispute(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {assignModalDispute.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Current Assignee:{' '}
                <strong>{assignModalDispute.assignee?.email || 'Unassigned'}</strong>
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
              {assignModalDispute.assigneeId && (
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
              <button className="btn ghost sm" type="button" onClick={() => setAssignModalDispute(null)}>
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

      {/* Dispute Detail & Resolution Drawer */}
      {selectedDispute && (
        <Drawer
          title={`Dispute #${selectedDispute.id.slice(-6).toUpperCase()}`}
          onClose={() => setSelectedDispute(null)}
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Title & Status Strip */}
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
                {selectedDispute.title}
              </h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip tone="default">{selectedDispute.type}</Chip>
                <StatusCell value={selectedDispute.status} />
                {selectedDispute.slaDueAt && (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    SLA Due: {new Date(selectedDispute.slaDueAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Situation Selection Pill Strip */}
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: 14,
                background: '#fafafa',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Update Dispute Situation
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DISPUTE_SITUATIONS.map((s) => {
                  const isCurrent = selectedDispute.status === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      className={`btn sm ${isCurrent ? '' : 'ghost'}`}
                      style={
                        isCurrent
                          ? { background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 11 }
                          : { fontSize: 11 }
                      }
                      onClick={() => {
                        if (['RESOLVED', 'LEGAL_ISSUE', 'DISMISSED'].includes(s.value)) {
                          promptStatusChange(selectedDispute, s.value);
                        } else {
                          handleQuickStatusChange(selectedDispute, s.value);
                        }
                      }}
                    >
                      {s.label.split(' ')[0]}
                    </button>
                  );
                })}
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
                Assigned Agent
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                {selectedDispute.assignee ? (
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
                      {selectedDispute.assignee.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedDispute.assignee.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {selectedDispute.assignee.role || 'Admin'}
                        {me?.id === selectedDispute.assignee.id && ' · Assigned to You'}
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
                  {me?.id && selectedDispute.assigneeId !== me.id && (
                    <button
                      className="btn sm"
                      style={{ fontSize: 11 }}
                      type="button"
                      disabled={updatingId === selectedDispute.id}
                      onClick={(e) => handleAssignToMe(selectedDispute, e)}
                    >
                      Assign to me
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    style={{ fontSize: 11 }}
                    type="button"
                    onClick={(e) => openAssignModal(selectedDispute, e)}
                  >
                    {selectedDispute.assigneeId ? 'Reassign...' : 'Assign...'}
                  </button>
                </div>
              </div>
            </div>

            {/* Linked Parties & Context Cards */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Dispute Parties & Ride Context
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {/* Passenger */}
                <div style={{ background: '#fafafa', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Passenger</div>
                  {selectedDispute.passenger ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedDispute.passenger.fullName || 'User'}</div>
                      <Link
                        href={`/users/${selectedDispute.passenger.userId}`}
                        style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', display: 'inline-block', marginTop: 2 }}
                      >
                        View User 360 Profile →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>Not linked</span>
                  )}
                </div>

                {/* Driver */}
                <div style={{ background: '#fafafa', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Driver</div>
                  {selectedDispute.driver ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedDispute.driver.fullName || 'Driver'}</div>
                      <Link
                        href={`/users/${selectedDispute.driver.userId}`}
                        style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', display: 'inline-block', marginTop: 2 }}
                      >
                        View Driver 360 Profile →
                      </Link>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>Not linked</span>
                  )}
                </div>

                {/* Ride */}
                <div style={{ background: '#fafafa', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Ride</div>
                  {selectedDispute.ride ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>
                        CG-RIDE-{selectedDispute.ride.id.slice(-5).toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedDispute.ride.fromLabel || '—'} → {selectedDispute.ride.toLabel || '—'}
                      </div>
                      <Chip tone={statusTone(selectedDispute.ride.status)} style={{ fontSize: 10, marginTop: 4 }}>
                        {selectedDispute.ride.status}
                      </Chip>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>Not linked</span>
                  )}
                </div>

                {/* Payment & Refund Link */}
                <div style={{ background: '#fafafa', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Payment & Refunds</div>
                  {selectedDispute.payment ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {selectedDispute.payment.currency || 'CAD'} ${Number(selectedDispute.payment.amount || 0).toFixed(2)}
                      </div>
                      <Chip tone={statusTone(selectedDispute.payment.status)} style={{ fontSize: 10, marginTop: 4 }}>
                        {selectedDispute.payment.status}
                      </Chip>
                      <div style={{ marginTop: 6 }}>
                        <Link
                          href={`/payments/${selectedDispute.payment.id}`}
                          style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none' }}
                        >
                          Open Payment & Issue Refund →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>Not linked</span>
                  )}
                </div>
              </div>
            </div>

            {/* Evidence & Chronological Notes */}
            <div>
              <label className="label-xs">Investigation & Timeline Notes</label>
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
                {selectedDispute.notes && selectedDispute.notes.length > 0 ? (
                  selectedDispute.notes.map((note) => (
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
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '12px 0' }}>
                    No notes recorded yet.
                  </div>
                )}
              </div>

              {/* Add Note Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="field"
                  style={{ width: '100%', minHeight: 60, marginBottom: 0 }}
                  placeholder="Record investigation findings or note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn sm"
                    type="button"
                    disabled={submittingNote || !newNote.trim()}
                    onClick={() => handleAddNote(selectedDispute)}
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
      <DisputesInner />
    </Suspense>
  );
}
