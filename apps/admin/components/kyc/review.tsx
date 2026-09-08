'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../toast';
import { ImpersonateButton } from '../impersonate';
import {
  canPerm,
  formatWhen,
  relativeFrom,
  type KycDocument,
  type KycWorkspace,
} from '../../lib/kyc';
import { AccountBadge, Avatar, KycStatusBadge } from './status';
import { DriverSnapshot } from './snapshot';
import { CompareIdentity, DocumentViewer } from './document-viewer';
import { AuditTimeline, KycDecisionPanel, ReviewNotes } from './decision-panel';
import {
  ApproveKycDialog,
  ConfirmDialog,
  DocumentDecisionDialog,
  RejectKycDialog,
  RequestChangesDialog,
} from './dialogs';

export function KycReviewWorkspace({ driverId }: { driverId: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<KycWorkspace | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('license');
  const [adminNote, setAdminNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: 'approve-doc' }
    | { kind: 'reject-doc' }
    | { kind: 'resubmit-doc' }
    | { kind: 'approve-kyc' }
    | { kind: 'reject-kyc' }
    | { kind: 'changes' }
    | { kind: 'override' }
    | { kind: 'activate' }
    | null
  >(null);
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
    return data.latestByType[selectedType] ?? data.documents.find((d) => d.docType === selectedType) ?? data.documents[0] ?? null;
  }, [data, selectedType]);

  useEffect(() => {
    if (!data) return;
    if (data.latestByType[selectedType]) return;
    const first = data.checklist.find((c) => c.status !== 'MISSING');
    if (first) setSelectedType(first.docType);
  }, [data, selectedType]);

  const canReview = canPerm(me?.permissions, 'kyc.review', 'kyc.approve');
  const canApprove = canPerm(me?.permissions, 'kyc.approve');
  const canReject = canPerm(me?.permissions, 'kyc.reject', 'kyc.approve');
  const canActivate = canPerm(me?.permissions, 'drivers.activate', 'kyc.approve');
  const canOverride = canPerm(me?.permissions, 'kyc.override');
  const canSuspend = canPerm(me?.permissions, 'users.suspend');

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      if (ok) toast.push(ok);
      setDialog(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.push(msg, 'bad');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!data || !selectedDoc) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (canReview) setDialog({ kind: 'approve-doc' });
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (canReview) setDialog({ kind: 'resubmit-doc' });
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const types = data.checklist.map((c) => c.docType);
        const i = types.indexOf(selectedType);
        const next = e.key === 'ArrowRight' ? types[i + 1] ?? types[0] : types[i - 1] ?? types[types.length - 1];
        if (next) setSelectedType(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, selectedDoc, selectedType, canReview]);

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
              <div className="kyc-pop right">
                <ImpersonateButton userId={data.userId} name={data.fullName} variant="menu" />
                {canSuspend && (
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() =>
                      void run(async () => {
                        await api(`/admin/users/${data.userId}/suspend`, {
                          method: 'POST',
                          body: JSON.stringify({
                            isSuspended: !data.user.isSuspended,
                            reason: adminNote || 'KYC review action',
                          }),
                        });
                      }, data.user.isSuspended ? 'Account unsuspended' : 'Account suspended')
                    }
                  >
                    {data.user.isSuspended ? 'Unsuspend account' : 'Suspend account'}
                  </button>
                )}
                <a href={`/users/${data.userId}`}>Open user 360</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {err && <p className="err">{err}</p>}

      <div className="kyc-review-grid">
        <DriverSnapshot workspace={data} selectedType={selectedType} onSelect={setSelectedType} />
        <DocumentViewer
          doc={selectedDoc}
          checks={data.verificationChecks}
          canDecide={canReview}
          onApprove={() => setDialog({ kind: 'approve-doc' })}
          onResubmit={() => setDialog({ kind: 'resubmit-doc' })}
          onReject={() => setDialog({ kind: 'reject-doc' })}
        />
        <KycDecisionPanel
          workspace={data}
          meId={me?.id}
          canReview={canReview}
          canApprove={canApprove}
          canReject={canReject}
          canActivate={canActivate}
          canOverride={canOverride}
          busy={busy}
          note={adminNote}
          onNote={setAdminNote}
          onAssign={() =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/assign`, {
                method: 'POST',
                body: JSON.stringify({ expectedUpdatedAt: data.updatedAt }),
              });
            }, 'Assigned to you')
          }
          onApprove={() =>
            setDialog(data.canApproveKyc ? { kind: 'approve-kyc' } : { kind: 'override' })
          }
          onChanges={() => setDialog({ kind: 'changes' })}
          onReject={() => setDialog({ kind: 'reject-kyc' })}
          onActivate={() => setDialog({ kind: 'activate' })}
          onDeactivate={() =>
            void run(async () => {
              await api(`/admin/drivers/${data.id}/deactivate`, { method: 'POST', body: '{}' });
            }, 'Driver deactivated')
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
                body: JSON.stringify({ status: 'APPROVED', expectedUpdatedAt: data.updatedAt }),
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
                body: JSON.stringify({
                  status: 'REJECTED',
                  rejectionReason: p.note?.trim() || p.reason,
                  expectedUpdatedAt: data.updatedAt,
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
                body: JSON.stringify({
                  reason: p.reason,
                  note: p.note,
                  customerMessage: p.customerMessage,
                  expectedUpdatedAt: data.updatedAt,
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
                body: JSON.stringify({ note: note || adminNote, expectedUpdatedAt: data.updatedAt }),
              });
            }, 'KYC approved')
          }
        />
      )}
      {dialog?.kind === 'override' && (
        <ConfirmDialog
          title={canOverride ? 'Override and approve KYC?' : 'Cannot approve yet'}
          confirmLabel={canOverride ? 'Override & Approve' : 'Close'}
          danger={canOverride}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            if (!canOverride) {
              setDialog(null);
              return;
            }
            void run(async () => {
              await api(`/admin/drivers/${data.id}/kyc/approve`, {
                method: 'POST',
                body: JSON.stringify({
                  override: true,
                  overrideReason,
                  note: adminNote,
                  expectedUpdatedAt: data.updatedAt,
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
                body: JSON.stringify({
                  reason: p.reason,
                  reasonCode: p.reasonCode,
                  internalNote: p.internalNote || adminNote,
                  customerMessage: p.customerMessage,
                  confirmed: true,
                  expectedUpdatedAt: data.updatedAt,
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
                body: JSON.stringify({ ...p, expectedUpdatedAt: data.updatedAt }),
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
              await api(`/admin/drivers/${data.id}/activate`, { method: 'POST', body: '{}' });
            }, 'Driver activated')
          }
          body={
            <p>
              KYC is approved. Activating lets this driver receive marketplace offers. This does not change document
              decisions.
            </p>
          }
        />
      )}
    </div>
  );
}
