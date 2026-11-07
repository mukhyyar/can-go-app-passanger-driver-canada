'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';
import { Chip, Drawer, Modal, statusTone } from '../../../components/ui';

type RatingUserProfile = {
  id: string;
  email: string;
  phoneE164?: string | null;
  role: string;
  passengerProfile?: { id: string; fullName: string } | null;
  driverProfile?: { id: string; fullName: string } | null;
};

type RatingItem = {
  id: string;
  rideId: string;
  fromUserId: string;
  fromUser?: RatingUserProfile | null;
  toUserId: string;
  toUser?: RatingUserProfile | null;
  ride?: {
    id: string;
    fromLabel?: string;
    toLabel?: string;
    status?: string;
    pickupAt?: string;
    serviceType?: string;
  } | null;
  stars: number;
  communicationStars?: number | null;
  driverStars?: number | null;
  vehicleStars?: number | null;
  comment?: string | null;
  moderationStatus: 'VISIBLE' | 'HIDDEN' | 'PENDING_REVIEW';
  moderatedAt?: string | null;
  moderatedById?: string | null;
  moderationNote?: string | null;
  createdAt: string;
  [key: string]: unknown;
};

const QUEUE_TABS = [
  { id: 'PENDING_REVIEW', label: 'Pending Review' },
  { id: 'VISIBLE', label: 'Approved (Visible)' },
  { id: 'HIDDEN', label: 'Hidden / Rejected' },
  { id: 'ALL', label: 'All Reviews' },
] as const;

function getUserName(u?: RatingUserProfile | null) {
  if (!u) return 'Unknown User';
  if (u.passengerProfile?.fullName) return u.passengerProfile.fullName;
  if (u.driverProfile?.fullName) return u.driverProfile.fullName;
  return u.email || `#${u.id.slice(0, 8)}`;
}

function renderStars(stars: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(stars || 0)));
  const full = '★'.repeat(clamped);
  const empty = '☆'.repeat(5 - clamped);
  return (
    <span style={{ color: '#eab308', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
      {full}
      <span style={{ color: '#d1d5db' }}>{empty}</span>
      <span style={{ color: '#444', fontSize: 12, marginLeft: 4, letterSpacing: 0 }}>({clamped}.0)</span>
    </span>
  );
}

function RatingsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const statusParam = sp.get('status') ?? 'PENDING_REVIEW';

  const [rows, setRows] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Action states
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<RatingItem | null>(null);
  const [moderationNoteInput, setModerationNoteInput] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Moderate confirmation modal
  const [moderateDialog, setModerateDialog] = useState<{
    rating: RatingItem;
    targetStatus: 'VISIBLE' | 'HIDDEN' | 'PENDING_REVIEW';
    note: string;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    const query = statusParam === 'ALL' ? 'status=ALL' : `status=${statusParam}`;
    api<RatingItem[]>(`/admin/ratings?${query}`)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [statusParam]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleModerate(
    ratingId: string,
    targetStatus: 'VISIBLE' | 'HIDDEN' | 'PENDING_REVIEW',
    note?: string,
    e?: React.MouseEvent,
  ) {
    if (e) e.stopPropagation();
    setModeratingId(ratingId);
    try {
      const updated = await api<RatingItem>(`/admin/ratings/${ratingId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ status: targetStatus, note }),
      });
      setRows((prev) => prev.map((r) => (r.id === ratingId ? { ...r, ...updated } : r)));
      if (selectedRating?.id === ratingId) {
        setSelectedRating((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setModeratingId(null);
    }
  }

  function promptModerate(
    rating: RatingItem,
    targetStatus: 'VISIBLE' | 'HIDDEN' | 'PENDING_REVIEW',
    e?: React.MouseEvent,
  ) {
    if (e) e.stopPropagation();
    setModerateDialog({
      rating,
      targetStatus,
      note: '',
    });
  }

  async function confirmModerateDialog() {
    if (!moderateDialog) return;
    setSubmittingNote(true);
    try {
      await handleModerate(
        moderateDialog.rating.id,
        moderateDialog.targetStatus,
        moderateDialog.note.trim() || undefined,
      );
      setModerateDialog(null);
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Ratings & Reviews Moderation
          </h1>
          <p className="page-sub" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Verify reviewer authenticity, inspect trip details, and approve or reject ratings submitted by passengers and drivers.
          </p>
        </div>
      </div>

      {/* Queue Filter Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {QUEUE_TABS.map((tab) => {
          const isActive = statusParam === tab.id;
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
              onClick={() => router.push(`/ratings?status=${tab.id}`)}
            >
              {tab.label}
              {statusParam === tab.id && rows.length > 0 ? (
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
        persistKey={`ratings-${statusParam}`}
        onRefresh={load}
        onRowClick={(row) => setSelectedRating(row as unknown as RatingItem)}
        columns={[
          {
            key: 'id',
            label: 'Review ID',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              return (
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, fontSize: 12 }}>
                  #{item.id.slice(-6).toUpperCase()}
                </span>
              );
            },
          },
          {
            key: 'stars',
            label: 'Score',
            type: 'number',
            render: (r) => {
              const item = r as unknown as RatingItem;
              return (
                <div>
                  {renderStars(item.stars)}
                  {(item.communicationStars || item.driverStars || item.vehicleStars) ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      {item.communicationStars && (
                        <span style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 4px', borderRadius: 4 }}>
                          Comm: {item.communicationStars}
                        </span>
                      )}
                      {item.driverStars && (
                        <span style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 4px', borderRadius: 4 }}>
                          Drv: {item.driverStars}
                        </span>
                      )}
                      {item.vehicleStars && (
                        <span style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 4px', borderRadius: 4 }}>
                          Veh: {item.vehicleStars}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: 'comment',
            label: 'Review Comment',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              return item.comment ? (
                <span style={{ fontSize: 13, fontStyle: 'italic', color: '#1f2937' }}>
                  “{item.comment}”
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  (No comment text)
                </span>
              );
            },
          },
          {
            key: 'fromUser',
            label: 'Reviewer (From)',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              const name = getUserName(item.fromUser);
              const isPassenger = item.fromUser?.role === 'PASSENGER' || item.fromUser?.passengerProfile != null;
              return (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link
                      href={`/users/${item.fromUserId}`}
                      style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand)', textDecoration: 'none' }}
                      title="Inspect user 360 profile"
                    >
                      {name}
                    </Link>
                    <Chip tone={isPassenger ? 'info' : 'action'} style={{ fontSize: 10, padding: '1px 5px' }}>
                      {isPassenger ? 'Passenger' : 'Driver'}
                    </Chip>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {item.fromUser?.email || item.fromUserId.slice(0, 10)}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'toUser',
            label: 'Recipient (To)',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              const name = getUserName(item.toUser);
              const isDriver = item.toUser?.role === 'DRIVER' || item.toUser?.driverProfile != null;
              return (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Link
                      href={`/users/${item.toUserId}`}
                      style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand)', textDecoration: 'none' }}
                      title="Inspect target 360 profile"
                    >
                      {name}
                    </Link>
                    <Chip tone={isDriver ? 'action' : 'info'} style={{ fontSize: 10, padding: '1px 5px' }}>
                      {isDriver ? 'Driver' : 'Passenger'}
                    </Chip>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {item.toUser?.email || item.toUserId.slice(0, 10)}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'ride',
            label: 'Trip Reference',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              const isCompleted = item.ride?.status === 'COMPLETED';
              return (
                <div onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>
                      CG-RIDE-{item.rideId.slice(-5).toUpperCase()}
                    </span>
                    {isCompleted ? (
                      <Chip tone="ok" style={{ fontSize: 10, padding: '1px 4px' }}>
                        Verified Trip
                      </Chip>
                    ) : (
                      <Chip tone="warn" style={{ fontSize: 10, padding: '1px 4px' }}>
                        {item.ride?.status || 'Trip'}
                      </Chip>
                    )}
                  </div>
                  {item.ride && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                      {item.ride.fromLabel || '—'} → {item.ride.toLabel || '—'}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'moderationStatus',
            label: 'Moderation',
            type: 'enum',
            render: (r) => {
              const item = r as unknown as RatingItem;
              if (item.moderationStatus === 'VISIBLE') {
                return <Chip tone="ok" style={{ fontWeight: 600, fontSize: 11 }}>Approved (Visible)</Chip>;
              }
              if (item.moderationStatus === 'HIDDEN') {
                return <Chip tone="bad" style={{ fontWeight: 600, fontSize: 11 }}>Hidden / Rejected</Chip>;
              }
              return <Chip tone="warn" style={{ fontWeight: 600, fontSize: 11 }}>Pending Review</Chip>;
            },
          },
          {
            key: 'createdAt',
            label: 'Date',
            type: 'date',
            render: (r) => (r.createdAt ? new Date(String(r.createdAt)).toLocaleDateString() : '—'),
          },
          {
            key: 'actions',
            label: 'Actions',
            type: 'text',
            render: (r) => {
              const item = r as unknown as RatingItem;
              const isBusy = moderatingId === item.id;
              return (
                <div
                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.moderationStatus !== 'VISIBLE' && (
                    <button
                      className="btn sm"
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        background: '#16a34a',
                        borderColor: '#16a34a',
                        color: '#fff',
                      }}
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => handleModerate(item.id, 'VISIBLE', undefined, e)}
                    >
                      Approve
                    </button>
                  )}
                  {item.moderationStatus !== 'HIDDEN' && (
                    <button
                      className="btn ghost sm bad"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => promptModerate(item, 'HIDDEN', e)}
                    >
                      Hide
                    </button>
                  )}
                  <button
                    className="btn ghost sm"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    type="button"
                    onClick={() => setSelectedRating(item)}
                  >
                    Inspect
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      {/* Moderate Reason / Note Modal */}
      {moderateDialog && (
        <Modal
          title={`${moderateDialog.targetStatus === 'VISIBLE' ? 'Approve' : moderateDialog.targetStatus === 'HIDDEN' ? 'Hide / Reject' : 'Reset'} Rating · #${moderateDialog.rating.id.slice(-6).toUpperCase()}`}
          onClose={() => setModerateDialog(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f9f9f9', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Review: {renderStars(moderateDialog.rating.stars)}
              </div>
              {moderateDialog.rating.comment && (
                <div style={{ fontSize: 12, fontStyle: 'italic', color: '#374151', marginBottom: 4 }}>
                  “{moderateDialog.rating.comment}”
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                <span>From: <strong>{getUserName(moderateDialog.rating.fromUser)}</strong></span>
                <span>To: <strong>{getUserName(moderateDialog.rating.toUser)}</strong></span>
              </div>
            </div>

            <div>
              <label className="label-xs">Moderation Note / Reason (Optional)</label>
              <textarea
                className="field"
                style={{ width: '100%', minHeight: 70, marginBottom: 0 }}
                placeholder={
                  moderateDialog.targetStatus === 'HIDDEN'
                    ? 'Enter reason for hiding review (e.g. offensive language, fake review, competitor harassment)...'
                    : 'Add note for audit log...'
                }
                value={moderateDialog.note}
                onChange={(e) =>
                  setModerateDialog((prev) => (prev ? { ...prev, note: e.target.value } : null))
                }
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button
                className="btn ghost sm"
                type="button"
                onClick={() => setModerateDialog(null)}
              >
                Cancel
              </button>
              <button
                className={`btn sm ${moderateDialog.targetStatus === 'HIDDEN' ? 'bad' : ''}`}
                style={
                  moderateDialog.targetStatus === 'VISIBLE'
                    ? { background: '#16a34a', borderColor: '#16a34a', color: '#fff' }
                    : undefined
                }
                type="button"
                disabled={submittingNote}
                onClick={confirmModerateDialog}
              >
                {submittingNote
                  ? 'Saving...'
                  : moderateDialog.targetStatus === 'VISIBLE'
                    ? 'Approve Review'
                    : 'Hide Review'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Review Authenticity & Verification Detail Drawer */}
      {selectedRating && (
        <Drawer
          title={`Rating Verification · #${selectedRating.id.slice(-6).toUpperCase()}`}
          onClose={() => setSelectedRating(null)}
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header Score & Moderation status */}
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {renderStars(selectedRating.stars)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    Submitted on {new Date(selectedRating.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  {selectedRating.moderationStatus === 'VISIBLE' && (
                    <Chip tone="ok" style={{ fontWeight: 700, fontSize: 12 }}>Approved & Visible</Chip>
                  )}
                  {selectedRating.moderationStatus === 'HIDDEN' && (
                    <Chip tone="bad" style={{ fontWeight: 700, fontSize: 12 }}>Hidden / Rejected</Chip>
                  )}
                  {selectedRating.moderationStatus === 'PENDING_REVIEW' && (
                    <Chip tone="warn" style={{ fontWeight: 700, fontSize: 12 }}>Pending Moderation</Chip>
                  )}
                </div>
              </div>

              {selectedRating.comment && (
                <div
                  style={{
                    marginTop: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#0f172a',
                    fontStyle: 'italic',
                  }}
                >
                  “{selectedRating.comment}”
                </div>
              )}
            </div>

            {/* Sub-scores breakdown */}
            {(selectedRating.communicationStars || selectedRating.driverStars || selectedRating.vehicleStars) ? (
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: '#fafafa' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Detailed Criteria Scores
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Communication</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                      {selectedRating.communicationStars ? `${selectedRating.communicationStars} / 5` : '—'}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Driver Behavior</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                      {selectedRating.driverStars ? `${selectedRating.driverStars} / 5` : '—'}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: 8, borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Vehicle Condition</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                      {selectedRating.vehicleStars ? `${selectedRating.vehicleStars} / 5` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Authenticity & Verification Section */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Authenticity & Trip Verification
              </div>

              {/* Ride Verification Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    Ride: CG-RIDE-{selectedRating.rideId.slice(-5).toUpperCase()}
                  </div>
                  {selectedRating.ride?.status === 'COMPLETED' ? (
                    <Chip tone="ok" style={{ fontWeight: 700, fontSize: 11 }}>
                      Verified Completed Ride ✓
                    </Chip>
                  ) : (
                    <Chip tone="warn" style={{ fontSize: 11 }}>
                      Status: {selectedRating.ride?.status || 'Unknown'}
                    </Chip>
                  )}
                </div>

                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  Route: {selectedRating.ride?.fromLabel || '—'} → {selectedRating.ride?.toLabel || '—'}
                </div>
                {selectedRating.ride?.pickupAt && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                    Pickup: {new Date(selectedRating.ride.pickupAt).toLocaleString()}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Link
                    href={`/rides`}
                    style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Open Ride in Rides Module →
                  </Link>
                </div>
              </div>

              {/* Reviewer & Recipient Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {/* Reviewer (From) */}
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Reviewer (Author)
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
                    {getUserName(selectedRating.fromUser)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Role: <strong>{selectedRating.fromUser?.role || 'User'}</strong>
                  </div>
                  {selectedRating.fromUser?.email && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                      Email: {selectedRating.fromUser.email}
                    </div>
                  )}
                  {selectedRating.fromUser?.phoneE164 && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 1 }}>
                      Phone: {selectedRating.fromUser.phoneE164}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, fontFamily: 'monospace' }}>
                    User ID: {selectedRating.fromUserId}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link
                      href={`/users/${selectedRating.fromUserId}`}
                      style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Inspect Reviewer 360 Profile →
                    </Link>
                  </div>
                </div>

                {/* Recipient (To) */}
                <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Recipient (Rated User)
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>
                    {getUserName(selectedRating.toUser)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Role: <strong>{selectedRating.toUser?.role || 'Driver'}</strong>
                  </div>
                  {selectedRating.toUser?.email && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                      Email: {selectedRating.toUser.email}
                    </div>
                  )}
                  {selectedRating.toUser?.phoneE164 && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 1 }}>
                      Phone: {selectedRating.toUser.phoneE164}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, fontFamily: 'monospace' }}>
                    User ID: {selectedRating.toUserId}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Link
                      href={`/users/${selectedRating.toUserId}`}
                      style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Inspect Recipient 360 Profile →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Moderation Controls & Audit History */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: '#fcfcfc' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Moderation Decision & Controls
              </div>

              {selectedRating.moderatedAt && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  Last moderated by Admin <code style={{ fontSize: 11 }}>{selectedRating.moderatedById}</code> on{' '}
                  {new Date(selectedRating.moderatedAt).toLocaleString()}
                  {selectedRating.moderationNote && (
                    <div style={{ marginTop: 4, fontStyle: 'italic', color: '#374151' }}>
                      Note: “{selectedRating.moderationNote}”
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn sm"
                  style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
                  disabled={selectedRating.moderationStatus === 'VISIBLE' || moderatingId === selectedRating.id}
                  onClick={() => promptModerate(selectedRating, 'VISIBLE')}
                >
                  ✓ Approve & Make Visible
                </button>
                <button
                  type="button"
                  className="btn ghost sm bad"
                  disabled={selectedRating.moderationStatus === 'HIDDEN' || moderatingId === selectedRating.id}
                  onClick={() => promptModerate(selectedRating, 'HIDDEN')}
                >
                  ✕ Hide / Reject Review
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={selectedRating.moderationStatus === 'PENDING_REVIEW' || moderatingId === selectedRating.id}
                  onClick={() => promptModerate(selectedRating, 'PENDING_REVIEW')}
                >
                  ↺ Reset to Pending
                </button>
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
      <RatingsInner />
    </Suspense>
  );
}
