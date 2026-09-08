'use client';

import {
  formatDate,
  formatWhen,
  isoDateInput,
  sourceLabel,
  type DocIndicator,
  type KycWorkspace,
} from '../../lib/kyc';
import { InlineEditField } from './dialogs';
import { AccountBadge, Avatar, DocGlyph, KycProgress, KycStatusBadge } from './status';

export function DriverSnapshot({
  workspace,
  selectedType,
  selectedDocId,
  canEdit,
  busy,
  onSelectType,
  onSelectDoc,
  onInlineSave,
  onEditApplicant,
  onAddDocument,
}: {
  workspace: KycWorkspace;
  selectedType: string | null;
  selectedDocId: string | null;
  canEdit: boolean;
  busy?: boolean;
  onSelectType: (docType: string) => void;
  onSelectDoc: (docId: string) => void;
  onInlineSave: (field: string, value: string) => Promise<void>;
  onEditApplicant: () => void;
  onAddDocument: () => void;
}) {
  const v = workspace.vehicles[0];
  const zone = workspace.operatingZones[0];
  const queueTypes = new Set(workspace.checklist.map((c) => c.docType));
  const extraDocs = workspace.documents.filter(
    (d) => d.isCurrent && !queueTypes.has(d.docType),
  );

  return (
    <aside className="kyc-snapshot">
      <div className="kyc-snap-head">
        <Avatar name={workspace.fullName} size={52} />
        <div>
          <h2>{workspace.fullName || 'Unnamed driver'}</h2>
          <div className="mono muted">{workspace.shortId}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {canEdit && (
          <button className="btn ghost sm" type="button" onClick={onEditApplicant}>
            Edit applicant
          </button>
        )}
        <button className="btn ghost sm" type="button" onClick={onAddDocument}>
          + Add document
        </button>
      </div>
      <KycProgress
        approved={workspace.progress.approved}
        required={workspace.progress.required}
        percent={workspace.progress.percent}
      />
      <p className="muted" style={{ marginTop: 6 }}>
        {workspace.progress.approved} of {workspace.progress.required} documents approved
      </p>
      {workspace.caseHealth && (
        <div className="kyc-case-health muted">
          {workspace.caseHealth.current} current · {workspace.caseHealth.superseded} superseded ·{' '}
          {workspace.caseHealth.pendingReview} pending
        </div>
      )}

      <h3>Personal</h3>
      <dl className="kyc-dl">
        <InlineEditField
          label="Email"
          value={workspace.user.email ?? ''}
          canEdit={canEdit}
          busy={busy}
          onSave={(next) => onInlineSave('email', next)}
        />
        <InlineEditField
          label="Phone"
          value={workspace.user.phoneE164 ?? ''}
          canEdit={canEdit}
          busy={busy}
          onSave={(next) => onInlineSave('phoneE164', next)}
        />
        {workspace.dateOfBirth && (
          <div>
            <dt>DOB</dt>
            <dd>{formatDate(workspace.dateOfBirth)}</dd>
          </div>
        )}
        {(workspace.addressLine1 || workspace.city) && (
          <div>
            <dt>Address</dt>
            <dd>
              {[workspace.addressLine1, workspace.addressLine2, workspace.city, workspace.province, workspace.postalCode, workspace.country]
                .filter(Boolean)
                .join(', ')}
            </dd>
          </div>
        )}
        {workspace.baseLocation && (
          <div>
            <dt>Base</dt>
            <dd>{workspace.baseLocation}</dd>
          </div>
        )}
        <div>
          <dt>Account created</dt>
          <dd>{formatWhen(workspace.user.createdAt)}</dd>
        </div>
        {workspace.user.lastSeenAt && (
          <div>
            <dt>Last login</dt>
            <dd>{formatWhen(workspace.user.lastSeenAt)}</dd>
          </div>
        )}
      </dl>

      <h3>Licence</h3>
      <dl className="kyc-dl">
        <InlineEditField
          label="Number"
          value={workspace.licenceNumber ?? ''}
          canEdit={canEdit}
          busy={busy}
          onSave={(next) => onInlineSave('licenceNumber', next)}
        />
        {workspace.licenceJurisdiction && (
          <div>
            <dt>Jurisdiction</dt>
            <dd>{workspace.licenceJurisdiction}</dd>
          </div>
        )}
        <InlineEditField
          label="Expiry"
          value={isoDateInput(workspace.licenceExpiryDate)}
          canEdit={canEdit}
          busy={busy}
          onSave={(next) => onInlineSave('licenceExpiryDate', next)}
        />
      </dl>

      <h3>Driver</h3>
      <dl className="kyc-dl">
        {zone && (
          <div>
            <dt>Operating zone</dt>
            <dd>{zone.name}</dd>
          </div>
        )}
        {v?.vehicleClass && (
          <div>
            <dt>Service type</dt>
            <dd>{v.vehicleClass}</dd>
          </div>
        )}
        <div>
          <dt>KYC status</dt>
          <dd>
            <KycStatusBadge status={workspace.approvalStatus} />
            {workspace.kycOverrideUsed ? <span className="kyc-override-badge">MANUAL OVERRIDE</span> : null}
          </dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd>
            <AccountBadge
              isActivated={workspace.isActivated}
              isSuspended={workspace.user.isSuspended}
            />
          </dd>
        </div>
        {workspace.suspensionReason && (
          <div>
            <dt>Suspension</dt>
            <dd>{workspace.suspensionReason}</dd>
          </div>
        )}
      </dl>

      {v && (
        <>
          <h3>Vehicle</h3>
          <dl className="kyc-dl">
            <div>
              <dt>Name</dt>
              <dd>{v.name}</dd>
            </div>
            <div>
              <dt>Plate</dt>
              <dd>{v.plate}</dd>
            </div>
            <div>
              <dt>Vehicle type</dt>
              <dd>{v.vehicleClass}</dd>
            </div>
          </dl>
        </>
      )}

      <h3>Verification checklist</h3>
      <ul className="kyc-checklist">
        {workspace.checklist.map((item) => {
          const active =
            selectedType === item.docType ||
            (item.documentId != null && item.documentId === selectedDocId);
          return (
            <li key={item.docType}>
              <button
                type="button"
                className={active ? 'on' : ''}
                onClick={() => {
                  onSelectType(item.docType);
                  if (item.documentId) onSelectDoc(item.documentId);
                }}
              >
                <DocGlyph indicator={item.indicator as DocIndicator} />
                <span>
                  {item.label}
                  {item.versionCount && item.versionCount > 1 ? (
                    <span className="kyc-ver-badge sm">{item.versionCount} vers</span>
                  ) : null}
                </span>
                <span className="kyc-check-meta muted">
                  {item.status === 'MISSING'
                    ? 'Missing'
                    : item.status.replace(/_/g, ' ')}
                  {item.uploadSource ? ` · ${sourceLabel(item.uploadSource)}` : ''}
                  {item.expiryLabel ? ` · ${item.expiryLabel}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {extraDocs.length > 0 && (
        <>
          <h3>Other documents</h3>
          <ul className="kyc-checklist">
            {extraDocs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className={selectedDocId === d.id ? 'on' : ''}
                  onClick={() => {
                    onSelectType(d.docType);
                    onSelectDoc(d.id);
                  }}
                >
                  <DocGlyph indicator={d.status === 'APPROVED' ? 'approved' : d.status === 'REJECTED' ? 'rejected' : 'pending'} />
                  <span>
                    {d.label}
                    <span className="kyc-ver-badge sm">V{d.versionNumber}</span>
                  </span>
                  <span className="muted">{d.status.replace(/_/g, ' ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {workspace.signals.length > 0 && (
        <>
          <h3>Review signals</h3>
          <ul className="kyc-signals">
            {workspace.signals.map((s) => (
              <li key={s.id} className={s.severity}>
                <strong>{s.label}</strong>
                {s.detail ? <span className="muted">{s.detail}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
