'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DOC_TYPE_LABELS,
  bytesLabel,
  formatWhen,
  kycStatusLabel,
  sourceLabel,
  type DocType,
  type DocVersionSummary,
  type KycDocument,
  type VerificationCheck,
} from '../../lib/kyc';
import { useKycDocumentContent } from '../../hooks/use-kyc-document-content';
import { KycStatusBadge } from './status';

export type DocViewerActions = {
  onApprove: () => void;
  onResubmit: () => void;
  onReject: () => void;
  onEditMetadata: () => void;
  onUploadVersion: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onSoftDelete: () => void;
  onOverride: () => void;
  onCopyId: () => void;
  onDownload: () => void;
  onSelectVersion: (versionId: string) => void;
};

export function DocumentViewer({
  driverId,
  doc,
  versions,
  checks,
  canDecide,
  canHistory,
  canUpload,
  canEditMeta,
  canArchive,
  canRestore,
  canDelete,
  canOverride,
  readOnly,
  onAction,
}: {
  driverId: string;
  doc: KycDocument | null;
  versions: DocVersionSummary[];
  checks: VerificationCheck[];
  canDecide: boolean;
  canHistory: boolean;
  canUpload: boolean;
  canEditMeta: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  canOverride: boolean;
  readOnly: boolean;
  onAction: DocViewerActions;
}) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const content = useKycDocumentContent(driverId, doc?.id);
  const mime = content.mimeType || doc?.mimeType || '';
  const isImage = Boolean(mime.startsWith('image/'));
  const isPdf = mime === 'application/pdf';

  useEffect(() => {
    setZoom(1);
    setRot(0);
  }, [doc?.id]);

  const fit = useCallback(() => setZoom(1), []);
  const fullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const handleDownload = useCallback(() => {
    void content.download().catch(() => undefined);
  }, [content]);

  const versionIndex = useMemo(() => {
    if (!doc) return -1;
    return versions.findIndex((v) => v.id === doc.id);
  }, [doc, versions]);

  const prevVersion = versionIndex >= 0 ? versions[versionIndex + 1] : undefined;
  const nextVersion = versionIndex > 0 ? versions[versionIndex - 1] : undefined;

  const meta = useMemo(() => {
    if (!doc) return [];
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Uploaded', value: formatWhen(doc.createdAt) },
      { label: 'Type', value: doc.mimeType },
      { label: 'Size', value: bytesLabel(doc.sizeBytes) },
      { label: 'Status', value: doc.status },
      { label: 'Lifecycle', value: kycStatusLabel(doc.lifecycleStatus) },
      { label: 'Source', value: sourceLabel(doc.uploadSource) },
      { label: 'Version', value: `V${doc.versionNumber}` },
    ];
    if (doc.originalFilename) rows.push({ label: 'Filename', value: doc.originalFilename });
    if (doc.documentNumber) rows.push({ label: 'Doc #', value: doc.documentNumber });
    if (doc.issueDate) rows.push({ label: 'Issued', value: formatWhen(doc.issueDate) });
    if (doc.expiresAt) rows.push({ label: 'Expiry', value: formatWhen(doc.expiresAt) });
    if (doc.issuingJurisdiction) rows.push({ label: 'Jurisdiction', value: doc.issuingJurisdiction });
    if (doc.sourceReference) rows.push({ label: 'Source ref', value: doc.sourceReference });
    if (doc.adminNote) rows.push({ label: 'Admin note', value: doc.adminNote });
    if (doc.rejectionReason) rows.push({ label: 'Reviewer note', value: doc.rejectionReason });
    if (doc.checksumSha256) rows.push({ label: 'Checksum', value: doc.checksumSha256.slice(0, 16) + '…' });
    return rows;
  }, [doc]);

  if (!doc) {
    return (
      <div className="kyc-viewer empty">
        <p className="muted">Select a document from the checklist to inspect it.</p>
      </div>
    );
  }

  const decideEnabled = canDecide && !readOnly && doc.isCurrent;
  const previewUrl = content.blobUrl;

  return (
    <section className="kyc-viewer" aria-label="Document inspection">
      {readOnly && (
        <div className="kyc-readonly-banner" role="status">
          Historical version — read only. Approve, reject, and edit are disabled.
        </div>
      )}
      <header className="kyc-viewer-head">
        <div>
          <h2>{doc.label || DOC_TYPE_LABELS[doc.docType as DocType] || doc.docType}</h2>
          <div className="row kyc-viewer-badges">
            <KycStatusBadge status={doc.status} />
            <span className="kyc-ver-badge">V{doc.versionNumber}</span>
            <span className={`kyc-life-badge ${(doc.lifecycleStatus || '').toLowerCase()}`}>
              {doc.isCurrent ? 'CURRENT' : kycStatusLabel(doc.lifecycleStatus)}
            </span>
            <span className="muted">{sourceLabel(doc.uploadSource)}</span>
            <span className="muted">Uploaded {formatWhen(doc.createdAt)}</span>
            {doc.expiryLabel ? <span className="kyc-expiry">{doc.expiryLabel}</span> : null}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            className="btn ghost sm"
            type="button"
            disabled={!prevVersion}
            onClick={() => prevVersion && onAction.onSelectVersion(prevVersion.id)}
            title="Previous version"
          >
            ← Prev ver
          </button>
          <button
            className="btn ghost sm"
            type="button"
            disabled={!nextVersion}
            onClick={() => nextVersion && onAction.onSelectVersion(nextVersion.id)}
            title="Next version"
          >
            Next ver →
          </button>
          <DocumentToolbar
            zoom={zoom}
            onZoom={setZoom}
            onFit={fit}
            onRotate={(d) => setRot((r) => r + d)}
            onFullscreen={fullscreen}
            onDownload={handleDownload}
            hasPreview={Boolean(previewUrl) || content.status === 'success'}
          />
          <div className="kyc-menu-wrap">
            <button className="btn ghost sm" type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Document actions">
              More
            </button>
            {menuOpen && (
              <div className="kyc-pop right" onMouseLeave={() => setMenuOpen(false)}>
                {canHistory && (
                  <button type="button" className="menu-item" onClick={() => { setShowHistory(true); setMenuOpen(false); }}>
                    View history
                  </button>
                )}
                <button type="button" className="menu-item" onClick={() => { handleDownload(); setMenuOpen(false); }}>
                  Download
                </button>
                <button type="button" className="menu-item" onClick={() => { onAction.onCopyId(); setMenuOpen(false); }}>
                  Copy ID
                </button>
                {decideEnabled && (
                  <>
                    <button type="button" className="menu-item" onClick={() => { onAction.onApprove(); setMenuOpen(false); }}>
                      Approve
                    </button>
                    <button type="button" className="menu-item" onClick={() => { onAction.onReject(); setMenuOpen(false); }}>
                      Reject
                    </button>
                    <button type="button" className="menu-item" onClick={() => { onAction.onResubmit(); setMenuOpen(false); }}>
                      Request replacement
                    </button>
                  </>
                )}
                {canUpload && doc.isCurrent && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onUploadVersion(); setMenuOpen(false); }}>
                    Upload new version
                  </button>
                )}
                {canEditMeta && doc.isCurrent && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onEditMetadata(); setMenuOpen(false); }}>
                    Edit metadata
                  </button>
                )}
                {canArchive && doc.isCurrent && doc.lifecycleStatus !== 'ARCHIVED' && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onArchive(); setMenuOpen(false); }}>
                    Archive
                  </button>
                )}
                {canRestore && (doc.lifecycleStatus === 'ARCHIVED' || doc.lifecycleStatus === 'SOFT_DELETED' || doc.isHistorical) && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onRestore(); setMenuOpen(false); }}>
                    Restore
                  </button>
                )}
                {canDelete && doc.lifecycleStatus !== 'SOFT_DELETED' && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onSoftDelete(); setMenuOpen(false); }}>
                    Soft delete
                  </button>
                )}
                {canOverride && (
                  <button type="button" className="menu-item" onClick={() => { onAction.onOverride(); setMenuOpen(false); }}>
                    Override
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="kyc-viewer-body">
        <div className="kyc-viewer-stage" ref={stageRef}>
          {content.status === 'loading' || content.status === 'idle' ? (
            <div className="kyc-viewer-missing" aria-busy="true">
              <p className="muted">Loading preview…</p>
            </div>
          ) : content.status === 'error' ? (
            <div className="kyc-viewer-missing">
              <p>Document preview unavailable.</p>
              <p className="muted">{content.error}</p>
              <button className="btn sm" type="button" onClick={() => void content.retry()}>
                Retry
              </button>
            </div>
          ) : isImage && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={doc.label}
              style={{
                transform: `scale(${zoom}) rotate(${rot}deg)`,
                objectFit: 'contain',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            />
          ) : isPdf && previewUrl ? (
            <iframe title={doc.label} src={previewUrl} className="kyc-pdf" />
          ) : (
            <div className="kyc-viewer-missing">
              <p>Preview not available for this file type.</p>
              <button className="btn sm" type="button" onClick={handleDownload}>
                Download
              </button>
            </div>
          )}
        </div>

        {canHistory && showHistory && (
          <aside className="kyc-version-panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Version history</h3>
              <button className="btn ghost sm" type="button" onClick={() => setShowHistory(false)}>
                Hide
              </button>
            </div>
            <ul className="kyc-version-list">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={v.id === doc.id ? 'on' : ''}
                    onClick={() => onAction.onSelectVersion(v.id)}
                  >
                    <span className="kyc-ver-badge">V{v.versionNumber}</span>
                    <span className={`kyc-life-badge ${(v.lifecycleStatus || '').toLowerCase()}`}>
                      {v.lifecycleStatus}
                    </span>
                    <span className="muted">{formatWhen(v.createdAt)}</span>
                    <span className="muted">{sourceLabel(v.uploadSource)}</span>
                    <span className="muted">{v.status}</span>
                  </button>
                </li>
              ))}
              {!versions.length && <li className="muted">No versions.</li>}
            </ul>
          </aside>
        )}
      </div>

      {!showHistory && canHistory && (
        <button className="btn ghost sm" type="button" onClick={() => setShowHistory(true)} style={{ marginTop: 8 }}>
          Show version history
        </button>
      )}

      <div className="kyc-viewer-meta">
        <div className="kyc-inspector">
          <h3>Document information</h3>
          <dl className="kyc-dl">
            {meta.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>Verification checks</h3>
          <ul className="kyc-checks">
            {checks.map((c) => (
              <li key={c.id} className={c.result}>
                <span aria-hidden>{c.result === 'pass' ? '✓' : c.result === 'fail' ? '!' : '•'}</span>
                <span>
                  {c.label}
                  {c.detail ? <small className="muted"> {c.detail}</small> : null}
                  {c.result === 'unavailable' ? <small className="muted"> — unavailable</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {decideEnabled && (
        <div className="kyc-doc-actions">
          <button className="btn sm" type="button" onClick={onAction.onApprove} title="Approve selected document (A)">
            Approve Document
          </button>
          <button className="btn ghost sm" type="button" onClick={onAction.onResubmit} title="Request resubmission (R)">
            Request Resubmission
          </button>
          <button className="btn danger sm" type="button" onClick={onAction.onReject}>
            Reject Document
          </button>
        </div>
      )}
    </section>
  );
}

export function DocumentToolbar({
  zoom,
  onZoom,
  onFit,
  onRotate,
  onFullscreen,
  onDownload,
  hasPreview,
}: {
  zoom: number;
  onZoom: (n: number) => void;
  onFit: () => void;
  onRotate: (deg: number) => void;
  onFullscreen: () => void;
  onDownload?: () => void;
  hasPreview?: boolean;
}) {
  return (
    <div className="kyc-toolbar" role="toolbar" aria-label="Document viewer">
      <button className="btn ghost sm" type="button" onClick={() => onZoom(Math.max(0.25, zoom - 0.25))} aria-label="Zoom out">
        Zoom −
      </button>
      <button className="btn ghost sm" type="button" onClick={() => onZoom(Math.min(4, zoom + 0.25))} aria-label="Zoom in">
        Zoom +
      </button>
      <button className="btn ghost sm" type="button" onClick={onFit}>
        Fit
      </button>
      <button className="btn ghost sm" type="button" onClick={() => onZoom(1)}>
        100%
      </button>
      <button className="btn ghost sm" type="button" onClick={() => onRotate(-90)} aria-label="Rotate left">
        Rotate L
      </button>
      <button className="btn ghost sm" type="button" onClick={() => onRotate(90)} aria-label="Rotate right">
        Rotate R
      </button>
      <button className="btn ghost sm" type="button" onClick={onFullscreen}>
        Fullscreen
      </button>
      {hasPreview && onDownload ? (
        <button className="btn ghost sm" type="button" onClick={onDownload}>
          Download
        </button>
      ) : null}
    </div>
  );
}

export function CompareIdentity({
  driverId,
  selfie,
  license,
  onClose,
}: {
  driverId: string;
  selfie: KycDocument;
  license: KycDocument;
  onClose: () => void;
}) {
  const [z1, setZ1] = useState(1);
  const [z2, setZ2] = useState(1);
  const selfieContent = useKycDocumentContent(driverId, selfie.id);
  const licenseContent = useKycDocumentContent(driverId, license.id);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide kyc-compare" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Compare Identity</h3>
          <button className="btn ghost sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">Manual visual comparison only. No facial-recognition scoring.</p>
        <div className="kyc-compare-grid">
          <div>
            <div className="row">
              <strong>Selfie</strong>
              <button className="btn ghost sm" type="button" onClick={() => setZ1((z) => Math.min(4, z + 0.25))}>
                Zoom +
              </button>
              <button className="btn ghost sm" type="button" onClick={() => setZ1((z) => Math.max(0.25, z - 0.25))}>
                Zoom −
              </button>
            </div>
            <div className="kyc-compare-pane">
              {selfieContent.blobUrl && (selfieContent.mimeType || selfie.mimeType).startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selfieContent.blobUrl} alt="Selfie" style={{ transform: `scale(${z1})` }} />
              ) : (
                <p className="muted">
                  {selfieContent.status === 'loading' ? 'Loading…' : 'No image'}
                </p>
              )}
            </div>
          </div>
          <div>
            <div className="row">
              <strong>Licence</strong>
              <button className="btn ghost sm" type="button" onClick={() => setZ2((z) => Math.min(4, z + 0.25))}>
                Zoom +
              </button>
              <button className="btn ghost sm" type="button" onClick={() => setZ2((z) => Math.max(0.25, z - 0.25))}>
                Zoom −
              </button>
            </div>
            <div className="kyc-compare-pane">
              {licenseContent.blobUrl && (licenseContent.mimeType || license.mimeType).startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={licenseContent.blobUrl} alt="Driving licence" style={{ transform: `scale(${z2})` }} />
              ) : (
                <p className="muted">
                  {licenseContent.status === 'loading' ? 'Loading…' : 'No image'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
