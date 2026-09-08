'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DOC_TYPE_LABELS,
  bytesLabel,
  formatWhen,
  type DocType,
  type KycDocument,
  type VerificationCheck,
} from '../../lib/kyc';
import { KycStatusBadge } from './status';

export function DocumentViewer({
  doc,
  checks,
  canDecide,
  onApprove,
  onResubmit,
  onReject,
}: {
  doc: KycDocument | null;
  checks: VerificationCheck[];
  canDecide: boolean;
  onApprove: () => void;
  onResubmit: () => void;
  onReject: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const isImage = Boolean(doc?.mimeType?.startsWith('image/'));
  const isPdf = doc?.mimeType === 'application/pdf';

  const fit = useCallback(() => setZoom(1), []);
  const fullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const meta = useMemo(() => {
    if (!doc) return [];
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Uploaded', value: formatWhen(doc.createdAt) },
      { label: 'Type', value: doc.mimeType },
      { label: 'Size', value: bytesLabel(doc.sizeBytes) },
      { label: 'Status', value: doc.status },
    ];
    if (doc.expiresAt) rows.push({ label: 'Expiry', value: formatWhen(doc.expiresAt) });
    if (doc.rejectionReason) rows.push({ label: 'Reviewer note', value: doc.rejectionReason });
    if (doc.docType === 'vehicle_registration' || doc.docType === 'vehicle_photo') {
      /* plate/VIN live on the vehicle snapshot, not OCR */
    }
    return rows;
  }, [doc]);

  if (!doc) {
    return (
      <div className="kyc-viewer empty">
        <p className="muted">Select a document from the checklist to inspect it.</p>
      </div>
    );
  }

  return (
    <section className="kyc-viewer" aria-label="Document inspection">
      <header className="kyc-viewer-head">
        <div>
          <h2>{doc.label || DOC_TYPE_LABELS[doc.docType as DocType] || doc.docType}</h2>
          <div className="row">
            <KycStatusBadge status={doc.status} />
            <span className="muted">Uploaded {formatWhen(doc.createdAt)}</span>
            {doc.expiryLabel ? <span className="kyc-expiry">{doc.expiryLabel}</span> : null}
          </div>
        </div>
        <DocumentToolbar
          zoom={zoom}
          onZoom={setZoom}
          onFit={fit}
          onRotate={(d) => setRot((r) => r + d)}
          onFullscreen={fullscreen}
          url={doc.url}
        />
      </header>

      <div className="kyc-viewer-stage" ref={stageRef}>
        {!doc.url ? (
          <div className="kyc-viewer-missing">
            <p>Document preview unavailable.</p>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.url}
            alt={doc.label}
            style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}
          />
        ) : isPdf ? (
          <iframe title={doc.label} src={doc.url} className="kyc-pdf" />
        ) : (
          <div className="kyc-viewer-missing">
            <p>Preview not available for this file type.</p>
            {doc.url && (
              <a className="btn sm" href={doc.url} target="_blank" rel="noreferrer">
                Open original
              </a>
            )}
          </div>
        )}
      </div>

      <div className="kyc-viewer-meta">
        <div>
          <h3>Document information</h3>
          <dl className="kyc-dl">
            {meta.map((m) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
          <p className="muted kyc-ocr-note">OCR fields will appear here when extraction is enabled.</p>
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

      {canDecide && (
        <div className="kyc-doc-actions">
          <button className="btn sm" type="button" onClick={onApprove} title="Approve selected document (A)">
            Approve Document
          </button>
          <button className="btn ghost sm" type="button" onClick={onResubmit} title="Request resubmission (R)">
            Request Resubmission
          </button>
          <button className="btn danger sm" type="button" onClick={onReject}>
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
  url,
}: {
  zoom: number;
  onZoom: (n: number) => void;
  onFit: () => void;
  onRotate: (deg: number) => void;
  onFullscreen: () => void;
  url?: string;
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
      {url ? (
        <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">
          Open original
        </a>
      ) : null}
    </div>
  );
}

export function CompareIdentity({
  selfie,
  license,
  onClose,
}: {
  selfie: KycDocument;
  license: KycDocument;
  onClose: () => void;
}) {
  const [z1, setZ1] = useState(1);
  const [z2, setZ2] = useState(1);
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
              {selfie.url && selfie.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selfie.url} alt="Selfie" style={{ transform: `scale(${z1})` }} />
              ) : (
                <p className="muted">No image</p>
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
              {license.url && license.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={license.url} alt="Driving licence" style={{ transform: `scale(${z2})` }} />
              ) : (
                <p className="muted">No image</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
