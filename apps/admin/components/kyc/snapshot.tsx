'use client';

import { formatWhen, type DocIndicator, type KycWorkspace } from '../../lib/kyc';
import { AccountBadge, Avatar, DocGlyph, KycProgress, KycStatusBadge } from './status';

export function DriverSnapshot({
  workspace,
  selectedType,
  onSelect,
}: {
  workspace: KycWorkspace;
  selectedType: string | null;
  onSelect: (docType: string) => void;
}) {
  const v = workspace.vehicles[0];
  const zone = workspace.operatingZones[0];

  return (
    <aside className="kyc-snapshot">
      <div className="kyc-snap-head">
        <Avatar name={workspace.fullName} size={52} />
        <div>
          <h2>{workspace.fullName || 'Unnamed driver'}</h2>
          <div className="mono muted">{workspace.shortId}</div>
        </div>
      </div>
      <KycProgress
        approved={workspace.progress.approved}
        required={workspace.progress.required}
        percent={workspace.progress.percent}
      />
      <p className="muted" style={{ marginTop: 6 }}>
        {workspace.progress.approved} of {workspace.progress.required} documents approved
      </p>

      <h3>Personal</h3>
      <dl className="kyc-dl">
        {workspace.user.email && (
          <div>
            <dt>Email</dt>
            <dd>{workspace.user.email}</dd>
          </div>
        )}
        {workspace.user.phoneE164 && (
          <div>
            <dt>Phone</dt>
            <dd>{workspace.user.phoneE164}</dd>
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
        {workspace.checklist.map((item) => (
          <li key={item.docType}>
            <button
              type="button"
              className={selectedType === item.docType ? 'on' : ''}
              onClick={() => onSelect(item.docType)}
            >
              <DocGlyph indicator={item.indicator as DocIndicator} />
              <span>{item.label}</span>
              <span className="muted">{item.status === 'MISSING' ? 'Missing' : item.status.replace(/_/g, ' ')}</span>
            </button>
          </li>
        ))}
      </ul>

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
