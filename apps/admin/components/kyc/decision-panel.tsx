'use client';

import { useState } from 'react';
import { formatWhen, relativeFrom, type KycNote, type AuditEvent, type KycWorkspace } from '../../lib/kyc';
import { AccountBadge, Avatar, KycStatusBadge } from './status';

export function KycDecisionPanel({
  workspace,
  meId,
  canReview,
  canApprove,
  canReject,
  canActivate,
  canOverride,
  busy,
  note,
  onNote,
  onAssign,
  onApprove,
  onChanges,
  onReject,
  onActivate,
  onDeactivate,
}: {
  workspace: KycWorkspace;
  meId?: string;
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canActivate: boolean;
  canOverride: boolean;
  busy: boolean;
  note: string;
  onNote: (v: string) => void;
  onAssign: () => void;
  onApprove: () => void;
  onChanges: () => void;
  onReject: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const pending = workspace.checklist.filter((c) => c.status === 'PENDING' || c.status === 'MISSING').length;
  const rejected = workspace.checklist.filter((c) => c.status === 'REJECTED' || c.status === 'NEEDS_RESUBMISSION').length;
  const approved = workspace.checklist.filter((c) => c.status === 'APPROVED').length;
  const assignedToMe = workspace.reviewer?.id === meId;
  const kycApproved = workspace.approvalStatus === 'APPROVED';

  return (
    <aside className="kyc-decision">
      <h2>KYC Decision</h2>
      <p className="muted">{workspace.checklist.length} Documents</p>
      <div className="kyc-decision-counts">
        <span className="ok">✓ {approved} Approved</span>
        <span className="warn">• {pending} Pending</span>
        <span className="bad">× {rejected} Rejected</span>
      </div>

      <h3>Eligibility</h3>
      <ul className="kyc-elig">
        <li className={workspace.eligibility.identityVerified ? 'ok' : ''}>Identity verified</li>
        <li className={workspace.eligibility.licenceVerified ? 'ok' : ''}>Licence verified</li>
        <li className={workspace.eligibility.vehicleVerified ? 'ok' : ''}>Vehicle verified</li>
        <li className={workspace.eligibility.requiredDocumentsComplete ? 'ok' : ''}>Required documents complete</li>
      </ul>

      <div className="kyc-decision-status">
        <div>
          <span className="muted">KYC Status</span>
          <KycStatusBadge status={workspace.approvalStatus} />
        </div>
        <div>
          <span className="muted">Account Status</span>
          <AccountBadge isActivated={workspace.isActivated} isSuspended={workspace.user.isSuspended} />
        </div>
      </div>

      <div className="kyc-reviewer">
        <span className="muted">Reviewer</span>
        <div>{workspace.reviewer ? workspace.reviewer.name : 'Unassigned'}</div>
        {canReview && !assignedToMe && (
          <button className="btn ghost sm" type="button" disabled={busy} onClick={onAssign}>
            Assign to me
          </button>
        )}
      </div>

      <label className="kyc-label">
        Admin note
        <textarea className="field" rows={3} value={note} onChange={(e) => onNote(e.target.value)} />
      </label>

      {canApprove && (
        <button
          className="btn"
          type="button"
          disabled={busy || (!workspace.canApproveKyc && !canOverride) || kycApproved}
          title={
            workspace.canApproveKyc
              ? 'Approve overall KYC'
              : canOverride
                ? 'Override required — confirmation will be requested'
                : 'Required documents must be approved first'
          }
          onClick={onApprove}
        >
          Approve KYC
        </button>
      )}
      {canReview && (
        <button className="btn ghost" type="button" disabled={busy} onClick={onChanges}>
          Request Changes
        </button>
      )}
      {canReject && (
        <button className="btn danger" type="button" disabled={busy} onClick={onReject}>
          Reject KYC
        </button>
      )}

      <hr className="kyc-hr" />
      <h3>Account</h3>
      {canActivate && kycApproved && !workspace.isActivated && (
        <button className="btn" type="button" disabled={busy || !workspace.canActivate} onClick={onActivate}>
          Activate Driver
        </button>
      )}
      {canActivate && workspace.isActivated && (
        <button className="btn ghost" type="button" disabled={busy} onClick={onDeactivate}>
          Deactivate Driver
        </button>
      )}
      {!kycApproved && (
        <p className="muted">Activate Driver becomes available after KYC is approved.</p>
      )}
    </aside>
  );
}

export function ReviewNotes({
  notes,
  canAdd,
  busy,
  onAdd,
}: {
  notes: KycNote[];
  canAdd: boolean;
  busy: boolean;
  onAdd: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  return (
    <section className="panel kyc-notes">
      <h3>Review notes</h3>
      <p className="muted">Internal only — not shown to the driver unless marked customer-facing.</p>
      <ul className="kyc-note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <Avatar name={n.author.name} size={28} />
            <div>
              <strong>{n.author.name}</strong>
              <span className="muted"> {formatWhen(n.createdAt)}</span>
              {n.customerFacing ? <span className="chip info">Customer-facing</span> : null}
              <p>{n.body}</p>
            </div>
          </li>
        ))}
        {!notes.length && <li className="muted">No notes yet.</li>}
      </ul>
      {canAdd && (
        <div className="kyc-note-compose">
          <textarea
            className="field"
            rows={2}
            placeholder="Add an internal note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            className="btn sm"
            type="button"
            disabled={busy || !body.trim()}
            onClick={async () => {
              await onAdd(body.trim());
              setBody('');
            }}
          >
            Add note
          </button>
        </div>
      )}
    </section>
  );
}

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <section className="panel kyc-audit">
      <h3>Audit trail</h3>
      <ol className="kyc-timeline">
        {events.map((e) => (
          <li key={e.id}>
            <time dateTime={e.at}>{relativeFrom(e.at)}</time>
            <div>
              <strong>{e.label}</strong>
              <div className="muted">
                by {e.actor}
                {e.reason ? ` · ${e.reason}` : ''}
                <span> · {formatWhen(e.at)}</span>
              </div>
            </div>
          </li>
        ))}
        {!events.length && <li className="muted">No audit events yet.</li>}
      </ol>
    </section>
  );
}
