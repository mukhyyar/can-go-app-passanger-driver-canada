'use client';

import { useEffect, useState } from 'react';
import { api, hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Modal } from '../ui';
import { useToast } from '../toast';

type Mode = 'archive' | 'unarchive' | 'anonymize' | 'delete';

type LifecycleImpact = {
  user: {
    id: string;
    role: string;
    email?: string | null;
    displayName: string;
    isSuspended: boolean;
    archivedAt?: string | null;
    anonymizedAt?: string | null;
  };
  counts: {
    passengerRides: number;
    driverAssignedRides: number;
    activeTrips: number;
    payments: number;
    refunds: number;
    openCases: number;
  };
  warnings: string[];
  canHardDelete: boolean;
  hasMarketplaceHistory: boolean;
  hasActiveTrip: boolean;
};

export function DangerZoneModal({
  userId,
  displayName,
  archived,
  anonymized,
  initialMode,
  onClose,
  onDone,
}: {
  userId: string;
  displayName: string;
  archived?: boolean;
  anonymized?: boolean;
  initialMode?: Mode;
  onClose: () => void;
  onDone: (result: { status: string; redirected?: boolean }) => void;
}) {
  const { me } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(
    initialMode ?? (archived ? 'unarchive' : 'archive'),
  );
  const [impact, setImpact] = useState<LifecycleImpact | null>(null);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canArchive = hasPermission(me?.permissions, 'users.archive');
  const canAnonymize = hasPermission(me?.permissions, 'users.anonymize');
  const canDelete = hasPermission(me?.permissions, 'users.delete');

  useEffect(() => {
    api<LifecycleImpact>(`/admin/users/${userId}/lifecycle`)
      .then(setImpact)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [userId]);

  const name = impact?.user.displayName || displayName;
  const confirmArchivePhrase = `ARCHIVE ${name}`.toUpperCase();
  const confirmAnonymizePhrase = `ANONYMIZE ${name}`.toUpperCase();
  const confirmDeletePhrase = `DELETE ${name}`.toUpperCase();

  const title =
    mode === 'archive'
      ? 'Archive account'
      : mode === 'unarchive'
        ? 'Unarchive account'
        : mode === 'anonymize'
          ? 'Anonymize personal data'
          : 'Permanently delete account';

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'archive' || mode === 'unarchive') {
        await api(`/admin/users/${userId}/archive`, {
          method: 'POST',
          body: JSON.stringify({ reason, unarchive: mode === 'unarchive' }),
        });
        toast.push(mode === 'unarchive' ? 'Account unarchived' : 'Account archived');
        onDone({ status: mode === 'unarchive' ? 'ACTIVE' : 'ARCHIVED' });
      } else if (mode === 'anonymize') {
        await api(`/admin/users/${userId}/anonymize`, {
          method: 'POST',
          body: JSON.stringify({ reason, confirmName }),
        });
        toast.push('Personal data anonymized');
        onDone({ status: 'ANONYMIZED' });
      } else {
        await api(`/admin/users/${userId}/delete`, {
          method: 'POST',
          body: JSON.stringify({ reason, confirmName }),
        });
        toast.push('Account permanently deleted');
        onDone({ status: 'DELETED', redirected: true });
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.push(msg, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const needsTyped =
    mode === 'anonymize' || mode === 'delete' || mode === 'archive';
  const expected =
    mode === 'archive'
      ? confirmArchivePhrase
      : mode === 'anonymize'
        ? confirmAnonymizePhrase
        : mode === 'delete'
          ? confirmDeletePhrase
          : '';
  const typedOk = !needsTyped || confirmName.trim().toUpperCase() === expected;
  const reasonOk = reason.trim().length >= 4;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="danger-zone">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {canArchive && !anonymized && (
            <button
              type="button"
              className={`btn ghost sm ${mode === 'archive' || mode === 'unarchive' ? 'on' : ''}`}
              onClick={() => setMode(archived ? 'unarchive' : 'archive')}
            >
              {archived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          {canAnonymize && !anonymized && (
            <button
              type="button"
              className={`btn ghost sm ${mode === 'anonymize' ? 'on' : ''}`}
              onClick={() => setMode('anonymize')}
            >
              Anonymize
            </button>
          )}
          {canDelete && !anonymized && (
            <button
              type="button"
              className={`btn danger sm ${mode === 'delete' ? 'on' : ''}`}
              onClick={() => setMode('delete')}
            >
              Permanently delete
            </button>
          )}
        </div>

        <p>
          <strong>{name}</strong>
          <span className="muted">
            {' '}
            · {impact?.user.role ?? '—'} · {impact?.user.email || 'no email'}
          </span>
        </p>

        {impact && (
          <div className="danger-impact">
            <div className="label-xs muted">Impact</div>
            <ul>
              <li>Passenger rides: {impact.counts.passengerRides}</li>
              <li>Driver assigned rides: {impact.counts.driverAssignedRides}</li>
              <li>Active trips: {impact.counts.activeTrips}</li>
              <li>Payments: {impact.counts.payments}</li>
              <li>Refunds requested: {impact.counts.refunds}</li>
              <li>Support cases: {impact.counts.openCases}</li>
            </ul>
            {impact.warnings.map((w) => (
              <p key={w} className="err" style={{ margin: '6px 0' }}>
                {w}
              </p>
            ))}
            {mode === 'delete' && !impact.canHardDelete && (
              <p className="err">
                Permanent delete is blocked. Use <strong>Anonymize</strong> to remove PII while
                keeping rides, payments, and audit history.
              </p>
            )}
            {mode === 'anonymize' && (
              <p className="muted">
                Email, phone, name, login credentials and devices will be wiped. Rides, payments,
                refunds and audit logs are retained.
              </p>
            )}
            {mode === 'archive' && (
              <p className="muted">
                Account is hidden from the default user directory and loses login access immediately.
              </p>
            )}
          </div>
        )}

        <label>
          <span className="label-xs muted">Reason *</span>
          <textarea
            className="field"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this action required?"
          />
        </label>

        {needsTyped && (
          <label>
            <span className="label-xs muted">
              Type <code>{expected}</code> to confirm
            </span>
            <input
              className="field"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {err && <p className="err">{err}</p>}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn sm ${mode === 'delete' || mode === 'anonymize' ? 'danger' : ''}`}
            disabled={
              busy ||
              !reasonOk ||
              !typedOk ||
              (mode === 'delete' && impact != null && !impact.canHardDelete) ||
              (mode === 'anonymize' && !!impact?.hasActiveTrip) ||
              (mode === 'archive' && !!impact?.hasActiveTrip)
            }
            onClick={() => void submit()}
          >
            {busy
              ? 'Working…'
              : mode === 'archive'
                ? 'Archive account'
                : mode === 'unarchive'
                  ? 'Unarchive account'
                  : mode === 'anonymize'
                    ? 'Anonymize data'
                    : 'Delete forever'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
