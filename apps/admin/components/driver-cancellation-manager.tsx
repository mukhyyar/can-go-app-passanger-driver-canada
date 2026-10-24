'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';

export type ProviderReasonRow = {
  code: string;
  label: string;
  description: string | null;
  isJustified: boolean;
  requiresDetails: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type OffenderDriver = {
  driverId: string;
  fullName: string;
  userId: string;
  email: string | null;
  phone: string;
  isSuspended: boolean;
  approvalStatus: string;
  warningCount: number;
  totalCancellations: number;
  unjustifiedCount: number;
  justifiedCount: number;
  unjustifiedRate: number;
  isFlagged: boolean;
  recentCancellations: Array<{
    id: string;
    rideId: string;
    reasonCode: string;
    reasonLabel: string;
    isJustified: boolean;
    effectiveJustified: boolean;
    reasonDetails: string | null;
    createdAt: string;
  }>;
};

export type ReportSummary = {
  totalCancellations: number;
  totalUnjustified: number;
  totalJustified: number;
  unjustifiedRate: number;
  flaggedDriversCount: number;
};

export type CancellationRecordRow = {
  id: string;
  rideId: string;
  driverId: string;
  reasonCode: string;
  reasonLabel: string;
  reasonDetails: string | null;
  isJustified: boolean;
  rideStatusAtCancel: string;
  adminReviewed: boolean;
  adminOverriddenJustified: boolean | null;
  adminReviewNotes: string | null;
  createdAt: string;
  driver: {
    id: string;
    fullName: string;
    user: { id: string; email: string | null; phoneE164: string | null };
  };
  ride: {
    id: string;
    fromLabel: string;
    toLabel: string | null;
    pickupAt: string;
    status: string;
  };
  reviewedByAdmin?: { id: string; email: string | null } | null;
};

export function DriverCancellationManager() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'drivers.suspend') || hasPermission(me?.permissions, 'pricing.edit');

  const [activeTab, setActiveTab] = useState<'offenders' | 'records' | 'reasons'>('offenders');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Repeat Offenders state
  const [windowDays, setWindowDays] = useState<number>(30);
  const [threshold, setThreshold] = useState<number>(2);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [offenders, setOffenders] = useState<OffenderDriver[]>([]);

  // Records state
  const [records, setRecords] = useState<CancellationRecordRow[]>([]);
  const [recordFilterJustified, setRecordFilterJustified] = useState<string>('all');
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Reasons state
  const [reasons, setReasons] = useState<ProviderReasonRow[]>([]);
  const [editingReason, setEditingReason] = useState<ProviderReasonRow | null>(null);
  const [savingReason, setSavingReason] = useState(false);

  // Modals state
  const [warnModalDriver, setWarnModalDriver] = useState<OffenderDriver | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [warnDetails, setWarnDetails] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const [suspendModalDriver, setSuspendModalDriver] = useState<OffenderDriver | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const [terminateModalDriver, setTerminateModalDriver] = useState<OffenderDriver | null>(null);
  const [terminateReason, setTerminateReason] = useState('');

  const [overrideModalRecord, setOverrideModalRecord] = useState<CancellationRecordRow | null>(null);
  const [overrideJustified, setOverrideJustified] = useState(true);
  const [overrideNotes, setOverrideNotes] = useState('');

  // Load Repeat Offenders Report
  function loadReport() {
    setLoading(true);
    setErr(null);
    api<{
      summary: ReportSummary;
      flaggedOffenders: OffenderDriver[];
      allActiveCancellers: OffenderDriver[];
    }>(`/admin/driver-cancellations/report?windowDays=${windowDays}&threshold=${threshold}`)
      .then((res) => {
        setSummary(res.summary);
        setOffenders(res.allActiveCancellers);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  // Load Cancellation Records
  function loadRecords() {
    setRecordsLoading(true);
    let url = '/admin/driver-cancellations/records?limit=50';
    if (recordFilterJustified === 'true') url += '&isJustified=true';
    if (recordFilterJustified === 'false') url += '&isJustified=false';
    if (recordFilterJustified === 'no_show') url += '&reasonCode=PROVIDER_NO_SHOW';

    api<{ items: CancellationRecordRow[]; total: number }>(url)
      .then((res) => setRecords(res.items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setRecordsLoading(false));
  }

  // Load Structured Reasons
  function loadReasons() {
    api<ProviderReasonRow[]>('/admin/driver-cancellations/reasons')
      .then((res) => setReasons(res))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    loadReport();
    loadReasons();
  }, [windowDays, threshold]);

  useEffect(() => {
    if (activeTab === 'records') {
      loadRecords();
    }
  }, [activeTab, recordFilterJustified]);

  // Handle Issue Warning
  async function submitWarning() {
    if (!warnModalDriver || !warnReason.trim()) return;
    setSubmittingAction(true);
    try {
      await api(`/admin/drivers/${warnModalDriver.driverId}/warnings`, {
        method: 'POST',
        body: JSON.stringify({
          reason: warnReason.trim(),
          details: warnDetails.trim() || undefined,
          category: 'CANCELLATIONS',
        }),
      });
      setActionSuccess(`Formal warning issued to ${warnModalDriver.fullName}`);
      setWarnModalDriver(null);
      setWarnReason('');
      setWarnDetails('');
      loadReport();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingAction(false);
    }
  }

  // Handle Suspend Driver
  async function submitSuspend() {
    if (!suspendModalDriver || !suspendReason.trim()) return;
    setSubmittingAction(true);
    try {
      await api(`/admin/users/${suspendModalDriver.userId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({
          isSuspended: true,
          reason: `SUSPENDED (Cancellations): ${suspendReason.trim()}`,
        }),
      });
      setActionSuccess(`Account for ${suspendModalDriver.fullName} suspended`);
      setSuspendModalDriver(null);
      setSuspendReason('');
      loadReport();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingAction(false);
    }
  }

  // Handle Terminate Driver
  async function submitTerminate() {
    if (!terminateModalDriver || !terminateReason.trim()) return;
    setSubmittingAction(true);
    try {
      await api(`/admin/drivers/${terminateModalDriver.driverId}/terminate`, {
        method: 'POST',
        body: JSON.stringify({
          reason: terminateReason.trim(),
        }),
      });
      setActionSuccess(`Driver account for ${terminateModalDriver.fullName} permanently terminated`);
      setTerminateModalDriver(null);
      setTerminateReason('');
      loadReport();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingAction(false);
    }
  }

  // Handle Override Justification
  async function submitOverride() {
    if (!overrideModalRecord || !overrideNotes.trim()) return;
    setSubmittingAction(true);
    try {
      await api(`/admin/driver-cancellations/records/${overrideModalRecord.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          isJustified: overrideJustified,
          notes: overrideNotes.trim(),
        }),
      });
      setActionSuccess('Cancellation record justification updated');
      setOverrideModalRecord(null);
      setOverrideNotes('');
      loadRecords();
      loadReport();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingAction(false);
    }
  }

  // Save reason changes
  async function saveReason(reason: ProviderReasonRow) {
    setSavingReason(true);
    try {
      await api(`/admin/driver-cancellations/reasons/${reason.code}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: reason.label,
          description: reason.description,
          isJustified: reason.isJustified,
          requiresDetails: reason.requiresDetails,
          isActive: reason.isActive,
        }),
      });
      setActionSuccess(`Reason "${reason.label}" updated successfully`);
      setEditingReason(null);
      loadReasons();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingReason(false);
    }
  }

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
            Provider (Driver) Cancellations
          </h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            Monitor provider cancellations, enforce accountability for repeated unjustified cancellations, and manage structured reasons.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              loadReport();
              if (activeTab === 'records') loadRecords();
              loadReasons();
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {err && (
        <div style={{ padding: 12, backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
          <strong>Error:</strong> {err}
        </div>
      )}
      {actionSuccess && (
        <div style={{ padding: 12, backgroundColor: '#dcfce7', border: '1px solid #4ade80', borderRadius: 8, color: '#166534', marginBottom: 16 }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* KPI Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Total Driver Cancellations</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginTop: 4 }}>{summary.totalCancellations}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Last {windowDays} days</div>
          </div>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Unjustified Cancellations</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626', marginTop: 4 }}>{summary.totalUnjustified}</div>
            <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>Subject to warning / disciplinary actions</div>
          </div>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Unjustified Rate</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: summary.unjustifiedRate > 50 ? '#b91c1c' : '#111827', marginTop: 4 }}>
              {summary.unjustifiedRate}%
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Target: &lt; 20%</div>
          </div>
          <div style={{ backgroundColor: '#fff', border: '1px solid #fecaca', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>Flagged Repeat Offenders</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#991b1b', marginTop: 4 }}>{summary.flaggedDriversCount} Drivers</div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>&ge; {threshold} unjustified cancellations</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('offenders')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'offenders' ? 700 : 500,
            color: activeTab === 'offenders' ? '#0284c7' : '#6b7280',
            borderBottom: activeTab === 'offenders' ? '2px solid #0284c7' : 'none',
          }}
        >
          🚨 Repeat Offenders Leaderboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('records')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'records' ? 700 : 500,
            color: activeTab === 'records' ? '#0284c7' : '#6b7280',
            borderBottom: activeTab === 'records' ? '2px solid #0284c7' : 'none',
          }}
        >
          📜 Cancellation Audit Log
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reasons')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'reasons' ? 700 : 500,
            color: activeTab === 'reasons' ? '#0284c7' : '#6b7280',
            borderBottom: activeTab === 'reasons' ? '2px solid #0284c7' : 'none',
          }}
        >
          ⚙️ Structured Reasons Configuration
        </button>
      </div>

      {/* Tab 1: Repeat Offenders */}
      {activeTab === 'offenders' && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Drivers with Cancellations
            </h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: '#4b5563' }}>
                Window:
                <select
                  value={windowDays}
                  onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
                  style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                  <option value={365}>Last 1 Year</option>
                </select>
              </label>
              <label style={{ fontSize: 13, color: '#4b5563' }}>
                Flag Threshold:
                <select
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                  style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                >
                  <option value={2}>&ge; 2 Unjustified</option>
                  <option value={3}>&ge; 3 Unjustified (Standard)</option>
                  <option value={5}>&ge; 5 Unjustified</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading cancellation records...</div>
          ) : offenders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
              ✓ No provider cancellations recorded in the selected window.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Driver</th>
                  <th style={{ padding: '10px 8px' }}>Contact</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Total</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Justified</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Unjustified</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Rate</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Warnings</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {offenders.map((d) => (
                  <tr key={d.driverId} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: d.isFlagged ? '#fff7ed' : 'transparent' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                      <Link href={`/users/${d.userId}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                        {d.fullName}
                      </Link>
                      {d.isFlagged && (
                        <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          HIGH CANCEL
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#4b5563', fontSize: 13 }}>
                      <div>{d.email ?? '—'}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>{d.phone}</div>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 600 }}>{d.totalCancellations}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{d.justifiedCount}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', color: d.unjustifiedCount > 0 ? '#dc2626' : '#4b5563', fontWeight: 700 }}>
                      {d.unjustifiedCount}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: d.unjustifiedRate >= 50 ? '#fee2e2' : '#f3f4f6',
                        color: d.unjustifiedRate >= 50 ? '#b91c1c' : '#374151',
                      }}>
                        {d.unjustifiedRate}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {d.warningCount > 0 ? (
                        <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                          {d.warningCount} {d.warningCount === 1 ? 'warning' : 'warnings'}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>0</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {d.isSuspended ? (
                        <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          SUSPENDED
                        </span>
                      ) : d.approvalStatus === 'REJECTED' ? (
                        <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          TERMINATED
                        </span>
                      ) : (
                        <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="btn sm"
                              style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}
                              onClick={() => {
                                setWarnModalDriver(d);
                                setWarnReason(`Repeated unjustified cancellations (${d.unjustifiedCount} in last ${windowDays} days)`);
                              }}
                            >
                              Warn
                            </button>
                            {!d.isSuspended && (
                              <button
                                type="button"
                                className="btn sm bad"
                                onClick={() => {
                                  setSuspendModalDriver(d);
                                  setSuspendReason(`Account suspended due to repeated unjustified cancellations (${d.unjustifiedCount} in last ${windowDays} days).`);
                                }}
                              >
                                Suspend
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn sm ghost"
                              style={{ color: '#991b1b' }}
                              onClick={() => {
                                setTerminateModalDriver(d);
                                setTerminateReason(`Account terminated due to chronic cancellation non-compliance.`);
                              }}
                            >
                              Terminate
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Cancellation Records Audit Log */}
      {activeTab === 'records' && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Cancellation Audit Log</h3>
            <div>
              <label style={{ fontSize: 13, color: '#4b5563' }}>
                Filter:
                <select
                  value={recordFilterJustified}
                  onChange={(e) => setRecordFilterJustified(e.target.value)}
                  style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                >
                  <option value="all">All Cancellations</option>
                  <option value="false">Unjustified Only</option>
                  <option value="true">Justified Only</option>
                  <option value="no_show">Provider No-Show Only</option>
                </select>
              </label>
            </div>
          </div>

          {recordsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading audit records...</div>
          ) : records.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>No cancellation records found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Ride</th>
                  <th style={{ padding: '8px' }}>Driver</th>
                  <th style={{ padding: '8px' }}>Reason</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Classification</th>
                  <th style={{ padding: '8px' }}>Details / Note</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Admin Review</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const effectiveJustified = r.adminOverriddenJustified ?? r.isJustified;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                        <Link href={`/rides?search=${r.rideId}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                          #{r.rideId.slice(-6).toUpperCase()}
                        </Link>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.ride.fromLabel.slice(0, 20)}...</div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <Link href={`/users/${r.driver.user.id}`} style={{ color: '#111827', fontWeight: 600, textDecoration: 'none' }}>
                          {r.driver.fullName}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                        {r.reasonLabel}
                        {r.reasonCode === 'PROVIDER_NO_SHOW' && (
                          <span style={{ marginLeft: 6, backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            NO-SHOW
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        {r.adminOverriddenJustified !== null ? (
                          <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            ⚖️ {effectiveJustified ? 'PARDONED' : 'OVERRIDDEN UNJUSTIFIED'}
                          </span>
                        ) : effectiveJustified ? (
                          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            ✅ JUSTIFIED
                          </span>
                        ) : (
                          <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            ❌ UNJUSTIFIED
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#4b5563', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.reasonDetails ? `"${r.reasonDetails}"` : <span style={{ color: '#9ca3af' }}>—</span>}
                        {r.adminReviewNotes && (
                          <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 2 }}>Admin Note: {r.adminReviewNotes}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        {canEdit && (
                          <button
                            type="button"
                            className="btn sm ghost"
                            onClick={() => {
                              setOverrideModalRecord(r);
                              setOverrideJustified(!effectiveJustified);
                              setOverrideNotes(r.adminReviewNotes ?? '');
                            }}
                          >
                            Review / Pardon
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Structured Reasons Configuration */}
      {activeTab === 'reasons' && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Structured Reasons Configuration</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              Configure the structured reasons presented to drivers upon cancellation. You can toggle whether cancellations under a reason are considered Justified (penalty-free) or Unjustified (subject to warnings/suspensions).
            </p>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 8px' }}>Reason Code</th>
                <th style={{ padding: '10px 8px' }}>Display Label</th>
                <th style={{ padding: '10px 8px' }}>Guidance Description</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Classification</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Details Required</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Active</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => {
                const isEditing = editingReason?.code === r.code;
                const current = isEditing ? editingReason : r;
                return (
                  <tr key={r.code} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>
                      {r.code}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={current.label}
                          onChange={(e) => setEditingReason({ ...current, label: e.target.value })}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', width: '100%' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.label}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#6b7280', fontSize: 13 }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={current.description ?? ''}
                          onChange={(e) => setEditingReason({ ...current, description: e.target.value })}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', width: '100%' }}
                        />
                      ) : (
                        r.description ?? '—'
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {isEditing ? (
                        <select
                          value={current.isJustified ? 'true' : 'false'}
                          onChange={(e) => setEditingReason({ ...current, isJustified: e.target.value === 'true' })}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
                        >
                          <option value="false">Unjustified</option>
                          <option value="true">Justified</option>
                        </select>
                      ) : r.isJustified ? (
                        <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          ✅ JUSTIFIED
                        </span>
                      ) : (
                        <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          ❌ UNJUSTIFIED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={current.requiresDetails}
                          onChange={(e) => setEditingReason({ ...current, requiresDetails: e.target.checked })}
                        />
                      ) : r.requiresDetails ? (
                        <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }}>Mandatory</span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Optional</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={current.isActive}
                          onChange={(e) => setEditingReason({ ...current, isActive: e.target.checked })}
                        />
                      ) : r.isActive ? (
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>Active</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>Disabled</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      {canEdit && (
                        isEditing ? (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn sm"
                              disabled={savingReason}
                              onClick={() => saveReason(current)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => setEditingReason(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn sm ghost"
                            onClick={() => setEditingReason({ ...r })}
                          >
                            Edit
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Issue Warning */}
      {warnModalDriver && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>Issue Formal Warning</h3>
            <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14 }}>
              Issuing a warning will increment the driver&apos;s warning tally to <strong>{warnModalDriver.warningCount + 1}</strong> and send an official platform warning notice.
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Warning Reason *
              </label>
              <input
                type="text"
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Probation / Guidance Details (Optional)
              </label>
              <textarea
                value={warnDetails}
                onChange={(e) => setWarnDetails(e.target.value)}
                rows={3}
                placeholder="Specific instructions or next steps required from the driver..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={submittingAction}
                onClick={() => setWarnModalDriver(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ backgroundColor: '#d97706', color: '#fff' }}
                disabled={submittingAction || !warnReason.trim()}
                onClick={submitWarning}
              >
                {submittingAction ? 'Issuing...' : 'Issue Warning'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suspend Driver */}
      {suspendModalDriver && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#b91c1c' }}>Suspend Driver Account</h3>
            <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14 }}>
              Are you sure you want to suspend <strong>{suspendModalDriver.fullName}</strong>? The driver will be kicked offline and disqualified from receiving bookings.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Suspension Reason *
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={submittingAction}
                onClick={() => setSuspendModalDriver(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bad"
                disabled={submittingAction || !suspendReason.trim()}
                onClick={submitSuspend}
              >
                {submittingAction ? 'Suspending...' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Terminate Driver */}
      {terminateModalDriver && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#7f1d1d' }}>Terminate Driver Account</h3>
            <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14 }}>
              <strong>Permanent Action:</strong> Terminating <strong>{terminateModalDriver.fullName}</strong> will revoke all driving privileges, permanently suspend user access, and invalidate all active credentials.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Termination Cause / Audit Note *
              </label>
              <textarea
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                rows={3}
                placeholder="Chronic non-compliance with accepted bookings, excessive cancellations..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={submittingAction}
                onClick={() => setTerminateModalDriver(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bad"
                style={{ backgroundColor: '#7f1d1d' }}
                disabled={submittingAction || !terminateReason.trim()}
                onClick={submitTerminate}
              >
                {submittingAction ? 'Terminating...' : 'Permanent Termination'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Override Justification */}
      {overrideModalRecord && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>Review &amp; Override Cancellation</h3>
            <p style={{ margin: '0 0 16px', color: '#4b5563', fontSize: 14 }}>
              Ride: <strong>#{overrideModalRecord.rideId.slice(-6).toUpperCase()}</strong> | Driver: <strong>{overrideModalRecord.driver.fullName}</strong>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Justification Status *
              </label>
              <select
                value={overrideJustified ? 'true' : 'false'}
                onChange={(e) => setOverrideJustified(e.target.value === 'true')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}
              >
                <option value="true">✅ Justified (Penalty-Free / Pardoned)</option>
                <option value="false">❌ Unjustified (Counts towards repeat penalty)</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Admin Verification Notes *
              </label>
              <textarea
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Verified official mechanic repair receipt, police report incident #..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                disabled={submittingAction}
                onClick={() => setOverrideModalRecord(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={submittingAction || !overrideNotes.trim()}
                onClick={submitOverride}
              >
                {submittingAction ? 'Saving...' : 'Save Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
