'use client';

import { useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  KYC_FLAG_LABELS,
  auditCategory,
  formatWhen,
  relativeFrom,
  type AuditEvent,
  type EligibilityItem,
  type KycFlag,
  type KycFlagType,
  type KycNote,
  type KycWorkspace,
} from '../../lib/kyc';
import { JsonDiff } from './dialogs';
import { AccountBadge, Avatar, KycStatusBadge } from './status';

export type NoteFocusHandle = { focusNote: () => void };

export const KycDecisionPanel = forwardRef<
  NoteFocusHandle,
  {
    workspace: KycWorkspace;
    meId?: string;
    canReview: boolean;
    canApprove: boolean;
    canReject: boolean;
    canActivate: boolean;
    canOverride: boolean;
    canSuspend: boolean;
    canFlag: boolean;
    busy: boolean;
    note: string;
    onNote: (v: string) => void;
    onAssign: () => void;
    onApprove: () => void;
    onChanges: () => void;
    onReject: () => void;
    onActivate: () => void;
    onDeactivate: () => void;
    onSuspend: () => void;
    onUnsuspend: () => void;
    onEligibilityClick: (item: EligibilityItem) => void;
    onAddFlag: () => void;
    onClearFlag: (flagId: string) => void;
  }
>(function KycDecisionPanel(
  {
    workspace,
    meId,
    canReview,
    canApprove,
    canReject,
    canActivate,
    canOverride,
    canSuspend,
    canFlag,
    busy,
    note,
    onNote,
    onAssign,
    onApprove,
    onChanges,
    onReject,
    onActivate,
    onDeactivate,
    onSuspend,
    onUnsuspend,
    onEligibilityClick,
    onAddFlag,
    onClearFlag,
  },
  ref,
) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    focusNote: () => noteRef.current?.focus(),
  }));

  const health = workspace.caseHealth;
  const pending = health?.pendingReview ?? workspace.checklist.filter((c) => c.status === 'PENDING' || c.status === 'MISSING').length;
  const rejected =
    (health?.rejected ?? 0) + (health?.needsResubmission ?? 0) ||
    workspace.checklist.filter((c) => c.status === 'REJECTED' || c.status === 'NEEDS_RESUBMISSION').length;
  const approved = health?.approved ?? workspace.checklist.filter((c) => c.status === 'APPROVED').length;
  const assignedToMe = workspace.reviewer?.id === meId;
  const kycApproved = workspace.approvalStatus === 'APPROVED';
  const eligibilityItems: EligibilityItem[] =
    workspace.eligibility.items ??
    ([
      { id: 'identity', label: 'Identity verified', result: workspace.eligibility.identityVerified ? 'pass' : 'fail', docType: 'selfie' },
      { id: 'licence', label: 'Licence verified', result: workspace.eligibility.licenceVerified ? 'pass' : 'fail', docType: 'license' },
      { id: 'vehicle', label: 'Vehicle verified', result: workspace.eligibility.vehicleVerified ? 'pass' : 'fail', docType: 'vehicle_registration' },
      {
        id: 'required',
        label: 'Required documents complete',
        result: workspace.eligibility.requiredDocumentsComplete ? 'pass' : 'fail',
      },
    ] as EligibilityItem[]);

  return (
    <aside className="kyc-decision">
      <h2>KYC Decision</h2>
      <p className="muted">{workspace.checklist.length} Documents</p>
      <div className="kyc-decision-counts">
        <span className="ok">✓ {approved} Approved</span>
        <span className="warn">• {pending} Pending</span>
        <span className="bad">× {rejected} Rejected / needs resub</span>
      </div>

      {workspace.kycOverrideUsed && (
        <div className="kyc-override-banner" title={workspace.kycOverrideReason ?? undefined}>
          MANUAL OVERRIDE
          {workspace.kycOverrideReason ? <span className="muted"> — {workspace.kycOverrideReason}</span> : null}
        </div>
      )}

      <h3>Eligibility</h3>
      <ul className="kyc-elig">
        {eligibilityItems.map((item) => (
          <li key={item.id} className={item.result}>
            <button
              type="button"
              className="kyc-elig-btn"
              disabled={!item.docType || item.result === 'pass'}
              onClick={() => onEligibilityClick(item)}
              title={item.docType && item.result !== 'pass' ? `Jump to ${item.docType}` : undefined}
            >
              <span className="kyc-elig-mark" aria-hidden>
                {item.result === 'pass' ? '✓' : item.result === 'warn' ? '!' : '×'}
              </span>
              <span>
                {item.label}
                {item.detail ? <small className="muted"> — {item.detail}</small> : null}
              </span>
            </button>
          </li>
        ))}
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
        <textarea
          ref={noteRef}
          id="kyc-admin-note"
          className="field"
          rows={3}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
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
      {canActivate && !workspace.isActivated && (
        <button className="btn" type="button" disabled={busy} onClick={onActivate}>
          {workspace.canActivate ? 'Activate Driver' : 'Activate (override)'}
        </button>
      )}
      {canActivate && workspace.isActivated && (
        <button className="btn ghost" type="button" disabled={busy} onClick={onDeactivate}>
          Deactivate Driver
        </button>
      )}
      {canSuspend && !workspace.user.isSuspended && (
        <button className="btn danger" type="button" disabled={busy} onClick={onSuspend}>
          Suspend
        </button>
      )}
      {canSuspend && workspace.user.isSuspended && (
        <button className="btn ghost" type="button" disabled={busy} onClick={onUnsuspend}>
          Unsuspend
        </button>
      )}
      {!kycApproved && (
        <p className="muted">Approve KYC activates the driver when documents are ready.</p>
      )}

      <hr className="kyc-hr" />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Flags</h3>
        {canFlag && (
          <button className="btn ghost sm" type="button" disabled={busy} onClick={onAddFlag}>
            + Flag
          </button>
        )}
      </div>
      <FlagsList flags={workspace.flags ?? []} canClear={canFlag} busy={busy} onClear={onClearFlag} />
    </aside>
  );
});

function FlagsList({
  flags,
  canClear,
  busy,
  onClear,
}: {
  flags: KycFlag[];
  canClear: boolean;
  busy?: boolean;
  onClear: (id: string) => void;
}) {
  if (!flags.length) return <p className="muted">No active flags.</p>;
  return (
    <ul className="kyc-flag-list">
      {flags.map((f) => (
        <li key={f.id}>
          <span className="kyc-flag-pill">
            {KYC_FLAG_LABELS[f.flagType as KycFlagType] ?? f.flagType}
          </span>
          <span className="muted">{f.reason}</span>
          <span className="muted">{formatWhen(f.createdAt)}</span>
          {canClear && (
            <button className="btn ghost sm" type="button" disabled={busy} onClick={() => onClear(f.id)}>
              Clear
            </button>
          )}
        </li>
      ))}
    </ul>
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

type AuditFilter = 'all' | 'documents' | 'kyc' | 'account' | 'admin' | 'system';

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  const [filter, setFilter] = useState<AuditFilter>('all');
  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => auditCategory(e.action, e.resource) === filter);
  }, [events, filter]);

  const chips: Array<{ id: AuditFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'documents', label: 'Documents' },
    { id: 'kyc', label: 'KYC' },
    { id: 'account', label: 'Account' },
    { id: 'admin', label: 'Admin' },
    { id: 'system', label: 'System' },
  ];

  return (
    <section className="panel kyc-audit">
      <h3>Audit trail</h3>
      <div className="kyc-audit-chips">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`kyc-chip ${filter === c.id ? 'on' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ol className="kyc-timeline">
        {filtered.map((e) => {
          const before = e.before ?? (e.meta && 'before' in e.meta ? e.meta.before : undefined);
          const after = e.after ?? (e.meta && 'after' in e.meta ? e.meta.after : undefined);
          return (
            <li key={e.id}>
              <time dateTime={typeof e.at === 'string' ? e.at : new Date(e.at).toISOString()}>
                {relativeFrom(e.at)}
              </time>
              <div>
                <strong>{e.label}</strong>
                <div className="muted">
                  by {e.actor}
                  {e.reason ? ` · ${e.reason}` : ''}
                  <span> · {formatWhen(e.at)}</span>
                </div>
                {(before != null || after != null) && (
                  <div className="kyc-audit-diff">
                    {before != null && (
                      <div>
                        <span className="muted">Before</span>
                        <JsonDiff value={before} />
                      </div>
                    )}
                    {after != null && (
                      <div>
                        <span className="muted">After</span>
                        <JsonDiff value={after} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {!filtered.length && <li className="muted">No audit events yet.</li>}
      </ol>
    </section>
  );
}
