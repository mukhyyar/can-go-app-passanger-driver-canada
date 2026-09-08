'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, apiForm } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../toast';
import { ImpersonateButton } from '../impersonate';
import {
  canPerm,
  downloadText,
  findDocForType,
  formatWhen,
  relativeFrom,
  type DocVersionSummary,
  type EligibilityItem,
  type KycDocument,
  type KycWorkspace,
} from '../../lib/kyc';
import { AccountBadge, Avatar, KycStatusBadge } from './status';
import { DriverSnapshot } from './snapshot';
import { CompareIdentity, DocumentViewer } from './document-viewer';
import { AuditTimeline, KycDecisionPanel, ReviewNotes, type NoteFocusHandle } from './decision-panel';
import {
  ActivateOverrideDialog,
  AddFlagDialog,
  ApproveKycDialog,
  ConfirmDialog,
  DocOverrideDialog,
  DocumentDecisionDialog,
  EditApplicantDialog,
  EditDocumentMetadataDialog,
  ReasonConfirmDialog,
  RejectKycDialog,
  RequestChangesDialog,
  UploadDocumentDialog,
} from './dialogs';

type DialogState =
  | { kind: 'approve-doc' }
  | { kind: 'reject-doc' }
  | { kind: 'resubmit-doc' }
  | { kind: 'approve-kyc' }
  | { kind: 'reject-kyc' }
  | { kind: 'changes' }
  | { kind: 'override-kyc' }
  | { kind: 'activate' }
  | { kind: 'activate-override' }
  | { kind: 'upload'; mode: 'add' | 'version' | 'replace' }
  | { kind: 'edit-meta' }
  | { kind: 'edit-applicant' }
  | { kind: 'archive-doc' }
  | { kind: 'restore-doc' }
  | { kind: 'delete-doc' }
  | { kind: 'override-doc' }
  | { kind: 'reopen' }
  | { kind: 'reset' }
  | { kind: 'suspend' }
  | { kind: 'unsuspend' }
  | { kind: 'add-flag' }
  | null;

export function KycReviewWorkspace({ driverId }: { driverId: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const decisionRef = useRef<NoteFocusHandle>(null);
  const [data, setData] = useState<KycWorkspace | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('license');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    const ws = await api<KycWorkspace>(`/admin/drivers/${driverId}/kyc`);
    setData(ws);
    return ws;
  }, [driverId]);

  useEffect(() => {
    setErr(null);
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const selectedDoc: KycDocument | null = useMemo(() => {
    if (!data) return null;
    if (selectedDocId) {
      const byId = data.documents.find((d) => d.id === selectedDocId);
      if (byId) return byId;
    }
    return findDocForType(data, selectedType);
  }, [data, selectedDocId, selectedType]);

  const versions: DocVersionSummary[] = useMemo(() => {
    if (!data || !selectedDoc) return [];
    const gid = selectedDoc.documentGroupId;
    return data.versionsByGroup?.[gid] ?? [];
  }, [data, selectedDoc]);

  useEffect(() => {
    if (!data) return;
    if (selectedDocId && data.documents.some((d) => d.id === selectedDocId)) return;
    const doc = findDocForType(data, selectedType);
    if (doc) {
      setSelectedDocId(doc.id);
      return;
    }
    const first = data.checklist.find((c) => c.documentId);
    if (first?.documentId) {
      setSelectedType(first.docType);
      setSelectedDocId(first.documentId);
    }
  }, [data, selectedType, selectedDocId]);

  const perms = me?.permissions;
  const canReview = canPerm(perms, 'kyc.review', 'kyc.approve');
  const canApprove = canPerm(perms, 'kyc.approve');
  const canReject = canPerm(perms, 'kyc.reject', 'kyc.approve');
  const canActivate = canPerm(perms, 'drivers.activate', 'kyc.approve');
  const canOverride = canPerm(perms, 'kyc.override');
  const canSuspend = canPerm(perms, 'drivers.suspend', 'users.suspend');
  const canEdit = canPerm(perms, 'kyc.edit', 'kyc.approve');
  const canUpload = canPerm(perms, 'kyc.document.upload', 'kyc.approve');
  const canEditMeta = canPerm(perms, 'kyc.document.edit', 'kyc.edit', 'kyc.approve');
  const canArchive = canPerm(perms, 'kyc.document.archive', 'kyc.approve');
  const canRestore = canPerm(perms, 'kyc.document.restore', 'kyc.approve');
  const canDelete = canPerm(perms, 'kyc.document.delete', 'kyc.override');
  const canHistory = canPerm(perms, 'kyc.history.view', 'kyc.view', 'kyc.document.view');
  const canReopen = canPerm(perms, 'kyc.reopen', 'kyc.approve');
  const canFlag = canReview;

  const readOnly = Boolean(selectedDoc && (selectedDoc.isHistorical || !selectedDoc.isCurrent));

  async function run(fn: () => Promise<void>, ok?: string): Promise<boolean> {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      if (ok) toast.push(ok);
      setDialog(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.push(msg, 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function expectedBody(extra: Record<string, unknown> = {}) {
    return JSON.stringify({ ...extra, expectedUpdatedAt: data!.updatedAt });
  }

  async function selectVersion(versionId: string) {
    if (!data || !selectedDoc) return;
    const local = data.documents.find((d) => d.id === versionId);
    if (local?.url) {
      setSelectedDocId(versionId);
      setSelectedType(local.docType);
      return;
    }
    try {
      const ver = await api<KycDocument>(
        `/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}/versions/${versionId}`,
      );
      setData((prev) => {
        if (!prev) return prev;
        const exists = prev.documents.some((d) => d.id === ver.id);
        return {
          ...prev,
          documents: exists
            ? prev.documents.map((d) => (d.id === ver.id ? { ...d, ...ver } : d))
            : [...prev.documents, ver],
        };
      });
      setSelectedDocId(ver.id);
      setSelectedType(ver.docType);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  }

  function jumpEligibility(item: EligibilityItem) {
    if (!item.docType || !data) return;
    setSelectedType(item.docType);
    const doc = findDocForType(data, item.docType);
    if (doc) setSelectedDocId(doc.id);
  }

  async function exportSummary() {
    if (!data) return;
    try {
      const summary = await api<unknown>(`/admin/drivers/${data.id}/kyc/export`);
      downloadText(
        `kyc-summary-${data.shortId}.json`,
        JSON.stringify(summary, null, 2),
        'application/json',
      );
      toast.push('KYC summary downloaded');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied`);
    } catch {
      toast.push('Copy failed', 'bad');
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
      if (!data) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (canReview && selectedDoc && !readOnly) setDialog({ kind: 'approve-doc' });
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (canReview && selectedDoc && !readOnly) setDialog({ kind: 'resubmit-doc' });
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        decisionRef.current?.focusNote();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const types = data.checklist.map((c) => c.docType);
        const i = types.indexOf(selectedType);
        const next = e.key === 'ArrowRight' ? types[i + 1] ?? types[0] : types[i - 1] ?? types[types.length - 1];
        if (next) {
          setSelectedType(next);
          const doc = findDocForType(data, next);
          setSelectedDocId(doc?.id ?? null);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, selectedDoc, selectedType, canReview, readOnly]);

  if (err && !data) {
    return (
      <div className="err">
        Unable to load verification data. {err}{' '}
        <button className="btn ghost sm" type="button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="kyc-review-skel" aria-busy="true">
        <div className="dg-skel-row" style={{ height: 64 }} />
        <div className="kyc-review-grid">
          <div className="dg-skel-row" style={{ height: 420 }} />
          <div className="dg-skel-row" style={{ height: 420 }} />
          <div className="dg-skel-row" style={{ height: 420 }} />
        </div>
      </div>
    );
  }

  const selfie = data.latestByType.selfie;
  const license = data.latestByType.license;
  const canCompare = Boolean(selfie?.url && license?.url);

  return (
    <div className="kyc-workspace">
      <header className="kyc-review-head">
        <Link href="/kyc" className="kyc-back">
          ← Back to Queue
        </Link>
        <div className="kyc-review-identity">
          <Avatar name={data.fullName} size={44} />
          <div>
            <h1>{data.fullName || 'Unnamed driver'}</h1>
            <div className="mono muted">{data.shortId}</div>
          </div>
          <KycStatusBadge status={data.approvalStatus} />
          <AccountBadge isActivated={data.isActivated} isSuspended={data.user.isSuspended} />
          {data.kycOverrideUsed && <span className="kyc-override-badge">MANUAL OVERRIDE</span>}
        </div>
        <div className="kyc-review-meta muted">
          Submitted {data.kycSubmittedAt ? relativeFrom(data.kycSubmittedAt) : formatWhen(data.createdAt)}
          {' · '}
          Last updated {relativeFrom(data.updatedAt)}
        </div>
        <div className="kyc-review-nav">
          <button
            className="btn ghost sm"
            type="button"
            disabled={!data.neighbors.prevId}
            onClick={() => data.neighbors.prevId && router.push(`/kyc/${data.neighbors.prevId}`)}
          >
            Previous Applicant
          </button>
          <button
            className="btn ghost sm"
            type="button"
            disabled={!data.neighbors.nextId}
            onClick={() => data.neighbors.nextId && router.push(`/kyc/${data.neighbors.nextId}`)}
          >
            Next Applicant
          </button>
          {canCompare && (
            <button className="btn ghost sm" type="button" onClick={() => setCompare(true)}>
              Compare Identity
            </button>
          )}
          <div className="kyc-menu-wrap">
            <button className="btn ghost sm" type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More admin actions">
              More
            </button>
            {menuOpen && (
              <div className="kyc-pop right" onMouseLeave={() => setMenuOpen(false)}>
                {canEdit && (
                  <button type="button" className="menu-item" onClick={() => { setDialog({ kind: 'edit-applicant' }); setMenuOpen(false); }}>
                    Edit Applicant
                  </button>
                )}
                {canUpload && (
                  <button type="button" className="menu-item" onClick={() => { setDialog({ kind: 'upload', mode: 'add' }); setMenuOpen(false); }}>
                    Add Document
                  </button>
                )}
                <button type="button" className="menu-item" onClick={() => { void exportSummary(); setMenuOpen(false); }}>
                  Export KYC Summary
                </button>
                {canReopen && (
                  <button type="button" className="menu-item" onClick={() => { setDialog({ kind: 'reopen' }); setMenuOpen(false); }}>
                    Reopen KYC
                  </button>
                )}
                {canOverride && (
                  <button type="button" className="menu-item" onClick={() => { setDialog({ kind: 'reset' }); setMenuOpen(false); }}>
                    Reset KYC
                  </button>
                )}
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    document.querySelector('.kyc-audit')?.scrollIntoView({ behavior: 'smooth' });
                    setMenuOpen(false);
                  }}
                >
                  View audit
                </button>
                <a href={`/drivers/${data.id}`} onClick={() => setMenuOpen(false)}>
                  View driver
                </a>
                <a href={`/users/${data.userId}`} onClick={() => setMenuOpen(false)}>
                  View user
                </a>
                {data.vehicles[0] && (
                  <a href={`/vehicles?q=${encodeURIComponent(data.vehicles[0].plate)}`} onClick={() => setMenuOpen(false)}>
                    View vehicle
                  </a>
                )}
                <button type="button" className="menu-item" onClick={() => { void copyText('Driver ID', data.id); setMenuOpen(false); }}>
                  Copy driver ID
                </button>
                <button type="button" className="menu-item" onClick={() => { void copyText('User ID', data.userId); setMenuOpen(false); }}>
                  Copy user ID
                </button>
                <ImpersonateButton userId={data.userId} name={data.fullName} variant="menu" />
                {canSuspend && (
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setDialog({ kind: data.user.isSuspended ? 'unsuspend' : 'suspend' });
                      setMenuOpen(false);
                    }}
                  >
                    {data.user.isSuspended ? 'Unsuspend' : 'Suspend'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {err && <p className="err">{err}</p>}

      <div className="kyc-review-grid">
        <DriverSnapshot
          workspace={data}
          selectedType={selectedType}
          selectedDocId={selectedDocId}
          canEdit={canEdit}
          busy={busy}
          onSelectType={setSelectedType}
          onSelectDoc={setSelectedDocId}
          onEditApplicant={() => setDialog({ kind: 'edit-applicant' })}
          onAddDocument={() => setDialog({ kind: 'upload', mode: 'add' })}
          onInlineSave={async (field, value) => {
            const ok = await run(async () => {
              const payload: Record<string, unknown> = {
                reason: `Inline update ${field}`,
                expectedUpdatedAt: data.updatedAt,
              };
              if (field === 'licenceExpiryDate') {
                const parsed = new Date(value);
                payload[field] = Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
              } else {
                payload[field] = value;
              }
              await api(`/admin/drivers/${data.id}/kyc`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
              });
            }, 'Applicant updated');
            if (!ok) throw new Error('Save failed');
          }}
        />
        <DocumentViewer
          doc={selectedDoc}
          versions={versions}
          checks={data.verificationChecks}
          canDecide={canReview}
          canHistory={canHistory}
          canUpload={canUpload}
          canEditMeta={canEditMeta}
          canArchive={canArchive}
          canRestore={canRestore}
          canDelete={canDelete}
          canOverride={canOverride}
          readOnly={readOnly}
          onAction={{
            onApprove: () => setDialog({ kind: 'approve-doc' }),
            onResubmit: () => setDialog({ kind: 'resubmit-doc' }),
            onReject: () => setDialog({ kind: 'reject-doc' }),
            onEditMetadata: () => setDialog({ kind: 'edit-meta' }),
            onUploadVersion: () => setDialog({ kind: 'upload', mode: 'version' }),
            onArchive: () => setDialog({ kind: 'archive-doc' }),
            onRestore: () => setDialog({ kind: 'restore-doc' }),
            onSoftDelete: () => setDialog({ kind: 'delete-doc' }),
            onOverride: () => setDialog({ kind: 'override-doc' }),
            onCopyId: () => {
              if (selectedDoc) void copyText('Document ID', selectedDoc.id);
            },
            onDownload: () => {
              if (selectedDoc?.url) window.open(selectedDoc.url, '_blank', 'noopener');
            },
            onSelectVersion: (id) => void selectVersion(id),
          }}
        />
        <KycDecisionPanel
          ref={decisionRef}
          workspace={data}
          meId={me?.id}
          canReview={canReview}
          canApprove={canApprove}
          canReject={canReject}
          canActivate={canActivate}
          canOverride={canOverride}
          canSuspend={canSuspend}
          canFlag={canFlag}
          busy={busy}
          note={adminNote}
          onNote={setAdminNote}
          onAssign={() =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/assign`, {
                method: 'POST',
                body: expectedBody(),
              });
            }, 'Assigned to you')
          }
          onApprove={() =>
            setDialog(data.canApproveKyc ? { kind: 'approve-kyc' } : { kind: 'override-kyc' })
          }
          onChanges={() => setDialog({ kind: 'changes' })}
          onReject={() => setDialog({ kind: 'reject-kyc' })}
          onActivate={() =>
            setDialog(data.canActivate ? { kind: 'activate' } : { kind: 'activate-override' })
          }
          onDeactivate={() =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/deactivate`, { method: 'POST', body: '{}' });
            }, 'Driver deactivated')
          }
          onSuspend={() => setDialog({ kind: 'suspend' })}
          onUnsuspend={() => setDialog({ kind: 'unsuspend' })}
          onEligibilityClick={jumpEligibility}
          onAddFlag={() => setDialog({ kind: 'add-flag' })}
          onClearFlag={(flagId) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/flags/${flagId}/clear`, {
                method: 'POST',
                body: JSON.stringify({ reason: 'Cleared from decision panel' }),
              });
            }, 'Flag cleared')
          }
        />
      </div>

      <div className="kyc-review-footer">
        <ReviewNotes
          notes={data.notes}
          canAdd={canReview}
          busy={busy}
          onAdd={async (body) => {
            await run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/notes`, {
                method: 'POST',
                body: JSON.stringify({ body }),
              });
            }, 'Note added');
          }}
        />
        <AuditTimeline events={data.audit} />
      </div>

      {compare && selfie && license && (
        <CompareIdentity selfie={selfie} license={license} onClose={() => setCompare(false)} />
      )}

      {dialog?.kind === 'approve-doc' && selectedDoc && (
        <DocumentDecisionDialog
          mode="approve"
          doc={selectedDoc}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void run(async () => {
              await api(`/admin/documents/${selectedDoc.id}/review`, {
                method: 'POST',
                body: expectedBody({ status: 'APPROVED' }),
              });
            }, 'Document approved')
          }
        />
      )}
      {dialog?.kind === 'reject-doc' && selectedDoc && (
        <DocumentDecisionDialog
          mode="reject"
          doc={selectedDoc}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/documents/${selectedDoc.id}/review`, {
                method: 'POST',
                body: expectedBody({
                  status: 'REJECTED',
                  rejectionReason: p.note?.trim() || p.reason,
                }),
              });
            }, 'Document rejected')
          }
        />
      )}
      {dialog?.kind === 'resubmit-doc' && selectedDoc && (
        <DocumentDecisionDialog
          mode="resubmit"
          doc={selectedDoc}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/documents/${selectedDoc.id}/request-resubmission`, {
                method: 'POST',
                body: expectedBody({
                  reason: p.reason,
                  note: p.note,
                  customerMessage: p.customerMessage,
                }),
              });
            }, 'Resubmission requested')
          }
        />
      )}
      {dialog?.kind === 'approve-kyc' && (
        <ApproveKycDialog
          workspace={data}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/approve`, {
                method: 'POST',
                body: expectedBody({ note: note || adminNote }),
              });
            }, 'KYC approved')
          }
        />
      )}
      {dialog?.kind === 'override-kyc' && (
        <ConfirmDialog
          title={canOverride ? 'Override and approve KYC?' : 'Cannot approve yet'}
          confirmLabel={canOverride ? 'Override & Approve' : 'Close'}
          danger={canOverride}
          busy={busy}
          disabled={canOverride && overrideReason.trim().length < 3}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            if (!canOverride) {
              setDialog(null);
              return;
            }
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/approve`, {
                method: 'POST',
                body: expectedBody({
                  override: true,
                  overrideReason,
                  note: adminNote,
                }),
              });
            }, 'KYC approved with override');
          }}
          body={
            canOverride ? (
              <>
                <p>Required documents are not all approved. An override will be audited.</p>
                <label className="kyc-label">
                  Override reason
                  <textarea
                    className="field"
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p>Required documents + at least one vehicle photo must be approved first.</p>
            )
          }
        />
      )}
      {dialog?.kind === 'reject-kyc' && (
        <RejectKycDialog
          workspace={data}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/reject-kyc`, {
                method: 'POST',
                body: expectedBody({
                  reason: p.reason,
                  reasonCode: p.reasonCode,
                  internalNote: p.internalNote || adminNote,
                  customerMessage: p.customerMessage,
                  confirmed: true,
                }),
              });
            }, 'KYC rejected')
          }
        />
      )}
      {dialog?.kind === 'changes' && (
        <RequestChangesDialog
          workspace={data}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/request-changes`, {
                method: 'POST',
                body: expectedBody(p),
              });
            }, 'Changes requested')
          }
        />
      )}
      {dialog?.kind === 'activate' && (
        <ConfirmDialog
          title="Activate driver?"
          confirmLabel="Activate Driver"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/activate`, {
                method: 'POST',
                body: expectedBody(),
              });
            }, 'Driver activated')
          }
          body={
            <p>
              Activating lets this driver receive marketplace offers. Prefer Approve KYC when
              documents are ready — that now activates automatically.
            </p>
          }
        />
      )}
      {dialog?.kind === 'activate-override' && (
        <ActivateOverrideDialog
          canOverride={canOverride}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(or, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/activate`, {
                method: 'POST',
                body: expectedBody({ override: true, overrideReason: or, note }),
              });
            }, 'Driver activated with override')
          }
        />
      )}
      {dialog?.kind === 'upload' && (
        <UploadDocumentDialog
          mode={dialog.mode}
          documentTypes={data.documentTypes ?? []}
          defaultDocType={selectedDoc?.docType ?? selectedType}
          replaceDocumentId={
            dialog.mode !== 'add' && selectedDoc ? selectedDoc.id : undefined
          }
          vehicles={data.vehicles}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (fd) => {
            fd.append('expectedUpdatedAt', data.updatedAt);
            setBusy(true);
            try {
              await apiForm(`/admin/drivers/${data.id}/kyc/documents`, fd);
              await load();
              toast.push(dialog.mode === 'add' ? 'Document uploaded' : 'New version uploaded');
              setDialog(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {dialog?.kind === 'edit-meta' && selectedDoc && (
        <EditDocumentMetadataDialog
          doc={selectedDoc}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (payload) => {
            const ok = await run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}`, {
                method: 'PATCH',
                body: expectedBody(payload),
              });
            }, 'Metadata updated');
            if (!ok) throw new Error('Save failed');
          }}
        />
      )}
      {dialog?.kind === 'edit-applicant' && (
        <EditApplicantDialog
          workspace={data}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async (payload) => {
            const ok = await run(async () => {
              await api(`/admin/drivers/${data.id}/kyc`, {
                method: 'PATCH',
                body: expectedBody(payload),
              });
            }, 'Applicant updated');
            if (!ok) throw new Error('Save failed');
          }}
        />
      )}
      {dialog?.kind === 'archive-doc' && selectedDoc && (
        <ReasonConfirmDialog
          title={`Archive ${selectedDoc.label}?`}
          confirmLabel="Archive"
          danger
          busy={busy}
          hint="Archived documents leave the active checklist until restored."
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}/archive`, {
                method: 'POST',
                body: expectedBody({ reason, note }),
              });
            }, 'Document archived')
          }
        />
      )}
      {dialog?.kind === 'restore-doc' && selectedDoc && (
        <ReasonConfirmDialog
          title={`Restore ${selectedDoc.label}?`}
          confirmLabel="Restore as current"
          busy={busy}
          hint="Restores this version as CURRENT for its document group."
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}/restore`, {
                method: 'POST',
                body: expectedBody({ reason, makeCurrent: true }),
              });
            }, 'Document restored')
          }
        />
      )}
      {dialog?.kind === 'delete-doc' && selectedDoc && (
        <ReasonConfirmDialog
          title={`Soft-delete ${selectedDoc.label}?`}
          confirmLabel="Soft delete"
          danger
          busy={busy}
          hint="Soft-deleted documents remain in audit history but are removed from active review."
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}`, {
                method: 'DELETE',
                body: expectedBody({ reason, note }),
              });
            }, 'Document soft-deleted')
          }
        />
      )}
      {dialog?.kind === 'override-doc' && selectedDoc && (
        <DocOverrideDialog
          doc={selectedDoc}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/documents/${selectedDoc.id}/override`, {
                method: 'POST',
                body: expectedBody(p),
              });
            }, 'Document override applied')
          }
        />
      )}
      {dialog?.kind === 'reopen' && (
        <ReasonConfirmDialog
          title="Reopen KYC?"
          confirmLabel="Reopen"
          busy={busy}
          hint="Moves the case back to In Review."
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/reopen`, {
                method: 'POST',
                body: expectedBody({ reason, note }),
              });
            }, 'KYC reopened')
          }
        />
      )}
      {dialog?.kind === 'reset' && (
        <ReasonConfirmDialog
          title="Reset KYC review?"
          confirmLabel="Reset KYC"
          danger
          busy={busy}
          minLength={8}
          hint="Clears decision state and returns the case to review. Requires a strong reason."
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/reset`, {
                method: 'POST',
                body: expectedBody({ reason, note }),
              });
            }, 'KYC reset')
          }
        />
      )}
      {dialog?.kind === 'suspend' && (
        <ReasonConfirmDialog
          title="Suspend driver?"
          confirmLabel="Suspend"
          danger
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/suspend`, {
                method: 'POST',
                body: expectedBody({ reason, note }),
              });
            }, 'Driver suspended')
          }
        />
      )}
      {dialog?.kind === 'unsuspend' && (
        <ReasonConfirmDialog
          title="Unsuspend driver?"
          confirmLabel="Unsuspend"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(reason, note) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/unsuspend`, {
                method: 'POST',
                body: expectedBody({ reason, note }),
              });
            }, 'Driver unsuspended')
          }
        />
      )}
      {dialog?.kind === 'add-flag' && (
        <AddFlagDialog
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={(p) =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/flags`, {
                method: 'POST',
                body: JSON.stringify(p),
              });
            }, 'Flag added')
          }
        />
      )}
    </div>
  );
}
