'use client';

import { useEffect, useId, useState } from 'react';
import { Modal } from '../ui';
import {
  DOC_TYPE_LABELS,
  KYC_REJECT_REASONS,
  RESUBMISSION_REASONS,
  type DocType,
  type KycDocument,
  type KycWorkspace,
} from '../../lib/kyc';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="kyc-dialog-body">{body}</div>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn sm ${danger ? 'danger' : ''}`}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ApproveKycDialog({
  workspace,
  busy,
  onClose,
  onConfirm,
}: {
  workspace: KycWorkspace;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      title="Approve driver verification?"
      confirmLabel="Approve KYC"
      busy={busy}
      onClose={onClose}
      onConfirm={() => onConfirm(note)}
      body={
        <>
          <p>
            Driver: <strong>{workspace.fullName}</strong>
          </p>
          <p className="muted">
            Documents: {workspace.progress.approved}/{workspace.progress.required} verified
          </p>
          <label className="kyc-label">
            Admin note (internal)
            <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="muted">This approves KYC only. Account activation is a separate step.</p>
        </>
      }
    />
  );
}

export function RejectKycDialog({
  workspace,
  busy,
  onClose,
  onConfirm,
}: {
  workspace: KycWorkspace;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    reasonCode: string;
    reason: string;
    internalNote: string;
    customerMessage: string;
  }) => void;
}) {
  const [reasonCode, setReasonCode] = useState(KYC_REJECT_REASONS[0].id);
  const [internalNote, setInternalNote] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const [ack, setAck] = useState(false);
  const reason = KYC_REJECT_REASONS.find((r) => r.id === reasonCode)?.label ?? reasonCode;

  return (
    <Modal title="Reject KYC application" onClose={onClose}>
      <p>
        Driver: <strong>{workspace.fullName}</strong>
      </p>
      <label className="kyc-label">
        Reason
        <select className="field" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
          {KYC_REJECT_REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="kyc-label">
        Internal notes
        <textarea className="field" rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
      </label>
      <label className="kyc-label">
        Optional message to driver
        <textarea
          className="field"
          rows={2}
          value={customerMessage}
          onChange={(e) => setCustomerMessage(e.target.value)}
        />
      </label>
      <label className="row muted">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        I understand this will reject this driver&apos;s KYC application.
      </label>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn danger sm"
          type="button"
          disabled={busy || !ack}
          onClick={() =>
            onConfirm({ reasonCode, reason, internalNote, customerMessage })
          }
        >
          Reject Application
        </button>
      </div>
    </Modal>
  );
}

export function RequestChangesDialog({
  workspace,
  busy,
  onClose,
  onConfirm,
}: {
  workspace: KycWorkspace;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    documents: Array<{ documentId: string; reason: string }>;
    message: string;
  }) => void;
}) {
  const docs = workspace.documents.filter((d) =>
    ['selfie', 'license', 'vehicle_registration', 'vehicle_photo'].includes(d.docType),
  );
  const unique: KycDocument[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    if (seen.has(d.docType)) continue;
    seen.add(d.docType);
    unique.push(d);
  }
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('Please upload a clearer image of your driving licence.');

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  const chosen = unique.filter((d) => selected[d.id]);

  return (
    <Modal title="Request KYC Changes" onClose={onClose} wide>
      <p className="muted">Select documents that need to be resubmitted.</p>
      <div className="kyc-change-list">
        {unique.map((d) => (
          <label key={d.id} className="kyc-change-row">
            <input type="checkbox" checked={Boolean(selected[d.id])} onChange={() => toggle(d.id)} />
            <span>
              <strong>{d.label || DOC_TYPE_LABELS[d.docType as DocType] || d.docType}</strong>
              <span className="muted"> {d.status}</span>
            </span>
            {selected[d.id] && (
              <select
                className="field"
                value={reasons[d.id] ?? 'image_unclear'}
                onChange={(e) => setReasons((r) => ({ ...r, [d.id]: e.target.value }))}
              >
                {RESUBMISSION_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
      </div>
      <label className="kyc-label">
        Message to driver
        <textarea className="field" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn sm"
          type="button"
          disabled={busy || chosen.length === 0}
          onClick={() =>
            onConfirm({
              documents: chosen.map((d) => ({
                documentId: d.id,
                reason: reasons[d.id] ?? 'image_unclear',
              })),
              message,
            })
          }
        >
          Send Request
        </button>
      </div>
    </Modal>
  );
}

export function DocumentDecisionDialog({
  mode,
  doc,
  busy,
  onClose,
  onConfirm,
}: {
  mode: 'approve' | 'reject' | 'resubmit';
  doc: KycDocument;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason?: string; note?: string; customerMessage?: string }) => void;
}) {
  const [reason, setReason] = useState(RESUBMISSION_REASONS[0].id);
  const [note, setNote] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const title =
    mode === 'approve'
      ? `Approve ${doc.label}?`
      : mode === 'reject'
        ? `Reject ${doc.label}?`
        : `Request resubmission — ${doc.label}`;

  useEffect(() => {
    setReason(RESUBMISSION_REASONS[0].id);
    setNote('');
    setCustomerMessage('');
  }, [doc.id, mode]);

  return (
    <Modal title={title} onClose={onClose}>
      {mode !== 'approve' && (
        <>
          <label className="kyc-label">
            Reason
            <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
              {RESUBMISSION_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="kyc-label">
            Reviewer note
            <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {mode === 'resubmit' && (
            <label className="kyc-label">
              Optional customer-facing message
              <textarea
                className="field"
                rows={2}
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {mode === 'approve' && <p className="muted">This marks the document as approved. It does not approve overall KYC.</p>}
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn sm ${mode === 'reject' ? 'danger' : ''}`}
          type="button"
          disabled={busy || (mode !== 'approve' && !reason)}
          onClick={() =>
            onConfirm({
              reason,
              note,
              customerMessage,
            })
          }
        >
          {mode === 'approve' ? 'Approve Document' : mode === 'reject' ? 'Reject Document' : 'Request Resubmission'}
        </button>
      </div>
    </Modal>
  );
}

export function useDialogId() {
  return useId();
}
