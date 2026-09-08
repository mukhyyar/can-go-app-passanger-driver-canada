'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui';
import {
  DOC_TYPE_LABELS,
  KYC_FLAG_LABELS,
  KYC_FLAG_TYPES,
  KYC_REJECT_REASONS,
  RESUBMISSION_REASONS,
  UPLOAD_SOURCES,
  UPLOAD_SOURCE_LABELS,
  bytesLabel,
  isoDateInput,
  validateUploadFile,
  type DocType,
  type DocumentTypeCatalog,
  type KycDocument,
  type KycFlagType,
  type KycWorkspace,
  type UploadSource,
} from '../../lib/kyc';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  disabled,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
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
          disabled={busy || disabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Destructive / override actions that require a mandatory reason. */
export function ReasonConfirmDialog({
  title,
  confirmLabel,
  danger,
  busy,
  minLength = 3,
  hint,
  onClose,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  minLength?: number;
  hint?: string;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ok = reason.trim().length >= minLength;
  return (
    <ConfirmDialog
      title={title}
      confirmLabel={confirmLabel}
      danger={danger}
      busy={busy}
      disabled={!ok}
      onClose={onClose}
      onConfirm={() => onConfirm(reason.trim(), note.trim() || undefined)}
      body={
        <>
          {hint ? <p className="muted">{hint}</p> : null}
          <label className="kyc-label">
            Reason (required)
            <textarea
              className="field"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`At least ${minLength} characters`}
            />
          </label>
          <label className="kyc-label">
            Optional note
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      }
    />
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
          <p className="muted">
            Approves KYC and activates the driver when all required documents are verified.
          </p>
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
  const [reasonCode, setReasonCode] = useState<string>(KYC_REJECT_REASONS[0].id);
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
  const docs = workspace.documents.filter((d) => d.isCurrent);
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
  const [reason, setReason] = useState<string>(RESUBMISSION_REASONS[0].id);
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

export function UploadDocumentDialog({
  mode,
  documentTypes,
  defaultDocType,
  replaceDocumentId,
  vehicles,
  busy,
  onClose,
  onConfirm,
}: {
  mode: 'add' | 'version' | 'replace';
  documentTypes: DocumentTypeCatalog[];
  defaultDocType?: string;
  replaceDocumentId?: string;
  vehicles: Array<{ id: string; name: string; plate: string }>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (form: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState(defaultDocType || documentTypes[0]?.id || 'license');
  const [customLabel, setCustomLabel] = useState('');
  const [uploadSource, setUploadSource] = useState<UploadSource>('EMAIL');
  const [sourceReference, setSourceReference] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [issuingJurisdiction, setIssuingJurisdiction] = useState('');
  const [reason, setReason] = useState('');
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const title =
    mode === 'add' ? 'Add Document' : mode === 'version' ? 'Upload New Version' : 'Replace Document';

  function pickFile(f: File | null) {
    if (!f) return;
    const err = validateUploadFile(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
    setDirty(true);
  }

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty || submitting) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, submitting]);

  async function submit() {
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Reason is required (min 3 characters).');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    if (customLabel.trim()) fd.append('customLabel', customLabel.trim());
    fd.append('uploadSource', uploadSource);
    if (sourceReference.trim()) fd.append('sourceReference', sourceReference.trim());
    if (adminNote.trim()) fd.append('adminNote', adminNote.trim());
    if (documentNumber.trim()) fd.append('documentNumber', documentNumber.trim());
    if (issueDate) fd.append('issueDate', new Date(issueDate).toISOString());
    if (expiresAt) fd.append('expiresAt', new Date(expiresAt).toISOString());
    if (issuingJurisdiction.trim()) fd.append('issuingJurisdiction', issuingJurisdiction.trim());
    fd.append('reason', reason.trim());
    if (vehicleId && (docType === 'vehicle_photo' || docType === 'vehicle_registration')) {
      fd.append('vehicleId', vehicleId);
    }
    if (replaceDocumentId) fd.append('replaceDocumentId', replaceDocumentId);

    setSubmitting(true);
    setProgress(12);
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 8));
    }, 180);
    try {
      await onConfirm(fd);
      setProgress(100);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(0);
    } finally {
      window.clearInterval(tick);
      setSubmitting(false);
    }
  }

  function tryClose() {
    if (dirty && !submitting && !window.confirm('Discard unsaved upload form?')) return;
    onClose();
  }

  return (
    <Modal title={title} onClose={tryClose} wide>
      <div
        className={`kyc-dropzone ${dragOver ? 'over' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div>
            <strong>{file.name}</strong>
            <div className="muted">
              {file.type} · {bytesLabel(file.size)}
            </div>
          </div>
        ) : (
          <div>
            <strong>Drop file here or click to browse</strong>
            <div className="muted">PDF, JPG, PNG, WebP · max 10 MB</div>
          </div>
        )}
      </div>
      {progress > 0 && (
        <div className="kyc-upload-progress" aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="err">{error}</p>}

      <div className="kyc-form-grid">
        <label className="kyc-label">
          Document type
          <select
            className="field"
            value={docType}
            disabled={mode !== 'add'}
            onChange={(e) => {
              setDocType(e.target.value);
              setDirty(true);
            }}
          >
            {(documentTypes.length ? documentTypes : Object.entries(DOC_TYPE_LABELS).map(([id, label]) => ({ id, label }))).map(
              (t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="kyc-label">
          Custom label
          <input className="field" value={customLabel} onChange={(e) => { setCustomLabel(e.target.value); setDirty(true); }} />
        </label>
        <label className="kyc-label">
          Source
          <select
            className="field"
            value={uploadSource}
            onChange={(e) => {
              setUploadSource(e.target.value as UploadSource);
              setDirty(true);
            }}
          >
            {UPLOAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {UPLOAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="kyc-label">
          Source reference
          <input
            className="field"
            value={sourceReference}
            placeholder="Ticket #, email thread…"
            onChange={(e) => {
              setSourceReference(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="kyc-label">
          Document number
          <input className="field" value={documentNumber} onChange={(e) => { setDocumentNumber(e.target.value); setDirty(true); }} />
        </label>
        <label className="kyc-label">
          Issuing jurisdiction
          <input className="field" value={issuingJurisdiction} onChange={(e) => { setIssuingJurisdiction(e.target.value); setDirty(true); }} />
        </label>
        <label className="kyc-label">
          Issue date
          <input className="field" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); setDirty(true); }} />
        </label>
        <label className="kyc-label">
          Expiry date
          <input className="field" type="date" value={expiresAt} onChange={(e) => { setExpiresAt(e.target.value); setDirty(true); }} />
        </label>
        {(docType === 'vehicle_photo' || docType === 'vehicle_registration') && vehicles.length > 0 && (
          <label className="kyc-label">
            Vehicle
            <select className="field" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setDirty(true); }}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.plate}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="kyc-label">
        Admin note
        <textarea className="field" rows={2} value={adminNote} onChange={(e) => { setAdminNote(e.target.value); setDirty(true); }} />
      </label>
      <label className="kyc-label">
        Reason (required)
        <textarea
          className="field"
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={tryClose} disabled={busy || submitting}>
          Cancel
        </button>
        <button className="btn sm" type="button" disabled={busy || submitting || !file} onClick={() => void submit()}>
          {submitting ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </Modal>
  );
}

export function EditDocumentMetadataDialog({
  doc,
  busy,
  onClose,
  onConfirm,
}: {
  doc: KycDocument;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [documentNumber, setDocumentNumber] = useState(doc.documentNumber ?? '');
  const [issueDate, setIssueDate] = useState(isoDateInput(doc.issueDate));
  const [expiresAt, setExpiresAt] = useState(isoDateInput(doc.expiresAt));
  const [issuingJurisdiction, setIssuingJurisdiction] = useState(doc.issuingJurisdiction ?? '');
  const [customLabel, setCustomLabel] = useState(doc.customLabel ?? '');
  const [adminNote, setAdminNote] = useState(doc.adminNote ?? '');
  const [sourceReference, setSourceReference] = useState(doc.sourceReference ?? '');
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function tryClose() {
    if (dirty && !window.confirm('Discard unsaved metadata changes?')) return;
    onClose();
  }

  return (
    <Modal title={`Edit metadata — ${doc.label}`} onClose={tryClose} wide>
      {error && <p className="err">{error}</p>}
      <div className="kyc-form-grid">
        <label className="kyc-label">
          Document number
          <input className="field" value={documentNumber} onChange={(e) => mark(setDocumentNumber)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Custom label
          <input className="field" value={customLabel} onChange={(e) => mark(setCustomLabel)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Issue date
          <input className="field" type="date" value={issueDate} onChange={(e) => mark(setIssueDate)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Expiry date
          <input className="field" type="date" value={expiresAt} onChange={(e) => mark(setExpiresAt)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Issuing jurisdiction
          <input className="field" value={issuingJurisdiction} onChange={(e) => mark(setIssuingJurisdiction)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Source reference
          <input className="field" value={sourceReference} onChange={(e) => mark(setSourceReference)(e.target.value)} />
        </label>
      </div>
      <label className="kyc-label">
        Admin note
        <textarea className="field" rows={2} value={adminNote} onChange={(e) => mark(setAdminNote)(e.target.value)} />
      </label>
      <label className="kyc-label">
        Reason (required)
        <textarea className="field" rows={2} value={reason} onChange={(e) => mark(setReason)(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={tryClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn sm"
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => {
            void (async () => {
              try {
                await onConfirm({
                  documentNumber: documentNumber.trim() || undefined,
                  customLabel: customLabel.trim() || undefined,
                  issueDate: issueDate ? new Date(issueDate).toISOString() : null,
                  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                  issuingJurisdiction: issuingJurisdiction.trim() || undefined,
                  sourceReference: sourceReference.trim() || undefined,
                  adminNote: adminNote.trim() || undefined,
                  reason: reason.trim(),
                });
                setDirty(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          Save metadata
        </button>
      </div>
    </Modal>
  );
}

export function EditApplicantDialog({
  workspace,
  busy,
  onClose,
  onConfirm,
}: {
  workspace: KycWorkspace;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(workspace.fullName ?? '');
  const [legalName, setLegalName] = useState(workspace.legalName ?? '');
  const [email, setEmail] = useState(workspace.user.email ?? '');
  const [phoneE164, setPhone] = useState(workspace.user.phoneE164 ?? '');
  const [dateOfBirth, setDob] = useState(isoDateInput(workspace.dateOfBirth));
  const [addressLine1, setA1] = useState(workspace.addressLine1 ?? '');
  const [addressLine2, setA2] = useState(workspace.addressLine2 ?? '');
  const [city, setCity] = useState(workspace.city ?? '');
  const [province, setProvince] = useState(workspace.province ?? '');
  const [postalCode, setPostal] = useState(workspace.postalCode ?? '');
  const [country, setCountry] = useState(workspace.country ?? '');
  const [baseLocation, setBase] = useState(workspace.baseLocation ?? '');
  const [licenceNumber, setLic] = useState(workspace.licenceNumber ?? '');
  const [licenceJurisdiction, setLicJ] = useState(workspace.licenceJurisdiction ?? '');
  const [licenceIssueDate, setLicI] = useState(isoDateInput(workspace.licenceIssueDate));
  const [licenceExpiryDate, setLicE] = useState(isoDateInput(workspace.licenceExpiryDate));
  const [reason, setReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function tryClose() {
    if (dirty && !window.confirm('Discard unsaved applicant changes?')) return;
    onClose();
  }

  return (
    <Modal title="Edit applicant" onClose={tryClose} wide>
      {error && <p className="err">{error}</p>}
      <div className="kyc-form-grid">
        <label className="kyc-label">
          Full name
          <input className="field" value={fullName} onChange={(e) => mark(setFullName)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Legal name
          <input className="field" value={legalName} onChange={(e) => mark(setLegalName)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Email
          <input className="field" value={email} onChange={(e) => mark(setEmail)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Phone
          <input className="field" value={phoneE164} onChange={(e) => mark(setPhone)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Date of birth
          <input className="field" type="date" value={dateOfBirth} onChange={(e) => mark(setDob)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Base location
          <input className="field" value={baseLocation} onChange={(e) => mark(setBase)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Address line 1
          <input className="field" value={addressLine1} onChange={(e) => mark(setA1)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Address line 2
          <input className="field" value={addressLine2} onChange={(e) => mark(setA2)(e.target.value)} />
        </label>
        <label className="kyc-label">
          City
          <input className="field" value={city} onChange={(e) => mark(setCity)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Province
          <input className="field" value={province} onChange={(e) => mark(setProvince)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Postal code
          <input className="field" value={postalCode} onChange={(e) => mark(setPostal)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Country
          <input className="field" value={country} onChange={(e) => mark(setCountry)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Licence number
          <input className="field" value={licenceNumber} onChange={(e) => mark(setLic)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Licence jurisdiction
          <input className="field" value={licenceJurisdiction} onChange={(e) => mark(setLicJ)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Licence issue
          <input className="field" type="date" value={licenceIssueDate} onChange={(e) => mark(setLicI)(e.target.value)} />
        </label>
        <label className="kyc-label">
          Licence expiry
          <input className="field" type="date" value={licenceExpiryDate} onChange={(e) => mark(setLicE)(e.target.value)} />
        </label>
      </div>
      <label className="kyc-label">
        Reason (required)
        <textarea className="field" rows={2} value={reason} onChange={(e) => mark(setReason)(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" type="button" onClick={tryClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn sm"
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => {
            void (async () => {
              try {
                await onConfirm({
                  fullName: fullName.trim() || undefined,
                  legalName: legalName.trim() || undefined,
                  email: email.trim() || undefined,
                  phoneE164: phoneE164.trim() || undefined,
                  dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null,
                  addressLine1: addressLine1.trim() || undefined,
                  addressLine2: addressLine2.trim() || undefined,
                  city: city.trim() || undefined,
                  province: province.trim() || undefined,
                  postalCode: postalCode.trim() || undefined,
                  country: country.trim() || undefined,
                  baseLocation: baseLocation.trim() || undefined,
                  licenceNumber: licenceNumber.trim() || undefined,
                  licenceJurisdiction: licenceJurisdiction.trim() || undefined,
                  licenceIssueDate: licenceIssueDate ? new Date(licenceIssueDate).toISOString() : null,
                  licenceExpiryDate: licenceExpiryDate ? new Date(licenceExpiryDate).toISOString() : null,
                  reason: reason.trim(),
                });
                setDirty(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })();
          }}
        >
          Save applicant
        </button>
      </div>
    </Modal>
  );
}

export function AddFlagDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: { flagType: KycFlagType; reason: string; note?: string }) => void;
}) {
  const [flagType, setFlagType] = useState<KycFlagType>('MANUAL_REVIEW');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      title="Add KYC flag"
      confirmLabel="Add flag"
      danger
      busy={busy}
      disabled={reason.trim().length < 3}
      onClose={onClose}
      onConfirm={() => onConfirm({ flagType, reason: reason.trim(), note: note.trim() || undefined })}
      body={
        <>
          <label className="kyc-label">
            Flag type
            <select className="field" value={flagType} onChange={(e) => setFlagType(e.target.value as KycFlagType)}>
              {KYC_FLAG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KYC_FLAG_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="kyc-label">
            Reason (required)
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="kyc-label">
            Note
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      }
    />
  );
}

export function ActivateOverrideDialog({
  canOverride,
  busy,
  onClose,
  onConfirm,
}: {
  canOverride: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (overrideReason: string, note?: string) => void;
}) {
  const [overrideReason, setOverrideReason] = useState('');
  const [note, setNote] = useState('');
  if (!canOverride) {
    return (
      <ConfirmDialog
        title="Cannot activate yet"
        confirmLabel="Close"
        busy={busy}
        onClose={onClose}
        onConfirm={onClose}
        body={<p>Driver does not meet activation requirements. Approve KYC documents first, or use an override permission.</p>}
      />
    );
  }
  return (
    <ConfirmDialog
      title="Activate with override?"
      confirmLabel="Override & Activate"
      danger
      busy={busy}
      disabled={overrideReason.trim().length < 3}
      onClose={onClose}
      onConfirm={() => onConfirm(overrideReason.trim(), note.trim() || undefined)}
      body={
        <>
          <p>Activation requirements are not met. An override will be audited.</p>
          <label className="kyc-label">
            Override reason
            <textarea className="field" rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </label>
          <label className="kyc-label">
            Note
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      }
    />
  );
}

export function DocOverrideDialog({
  doc,
  busy,
  onClose,
  onConfirm,
}: {
  doc: KycDocument;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: { status: 'APPROVED' | 'REJECTED' | 'PENDING'; reason: string; note?: string }) => void;
}) {
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED' | 'PENDING'>('APPROVED');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      title={`Override status — ${doc.label}`}
      confirmLabel="Apply override"
      danger
      busy={busy}
      disabled={reason.trim().length < 8}
      onClose={onClose}
      onConfirm={() => onConfirm({ status, reason: reason.trim(), note: note.trim() || undefined })}
      body={
        <>
          <label className="kyc-label">
            New status
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </label>
          <label className="kyc-label">
            Reason (min 8 chars)
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="kyc-label">
            Note
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      }
    />
  );
}

export function useDialogId() {
  return useId();
}

export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/** Inline field with explicit Save / Cancel (not blur-save). */
export function InlineEditField({
  label,
  value,
  canEdit,
  busy,
  onSave,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  busy?: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!canEdit || !editing) {
    return (
      <div className="kyc-inline-row">
        <dt>{label}</dt>
        <dd>
          <span>{value || '—'}</span>
          {canEdit && (
            <button className="btn ghost sm kyc-inline-edit" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="kyc-inline-row editing">
      <dt>{label}</dt>
      <dd>
        <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <span className="kyc-inline-actions">
          <button
            className="btn sm"
            type="button"
            disabled={busy || draft === value}
            onClick={() =>
              void onSave(draft).then(() => setEditing(false))
            }
          >
            Save
          </button>
          <button className="btn ghost sm" type="button" disabled={busy} onClick={() => { setDraft(value); setEditing(false); }}>
            Cancel
          </button>
        </span>
      </dd>
    </div>
  );
}

export function JsonDiff({ value }: { value: unknown }) {
  const text = useMemo(() => {
    if (value == null) return null;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  if (!text) return null;
  return <pre className="kyc-audit-json">{text}</pre>;
}
