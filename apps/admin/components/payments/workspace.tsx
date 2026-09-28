'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { shortId } from '../../lib/users';
import { Chip, Modal, money, statusTone, when } from '../ui';

export type PaymentDetail = {
  id: string;
  rideId: string;
  provider: string;
  providerRef?: string | null;
  amount: number | string;
  currency: string;
  status: string;
  paymentMode?: string | null;
  onlineAmount?: number | string | null;
  cashAmount?: number | string | null;
  cashCurrency?: string | null;
  paymentMethod?: string | null;
  termsVersion?: string | null;
  policyVersion?: string | null;
  termsAcceptedAt?: string | null;
  idempotencyKey?: string | null;
  rawWebhookLast?: unknown;
  metaJson?: unknown;
  createdAt: string;
  updatedAt: string;
  refundedTotal: number;
  refundableRemaining: number;
  refunds: Array<{
    id: string;
    amount: number | string;
    currency: string;
    type: string;
    reason: string;
    internalNote?: string | null;
    status: string;
    gatewayRefundId?: string | null;
    createdAt: string;
    requestedBy?: { id: string; email?: string | null } | null;
  }>;
  supportCases: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;
    assignee?: { id: string; email?: string | null } | null;
  }>;
  auditLogs?: Array<{
    id: string;
    action: string;
    reason?: string | null;
    createdAt: string;
    actor?: { id: string; email?: string | null } | null;
  }>;
  ride?: {
    id: string;
    publicCode?: string;
    status: string;
    serviceType: string;
    fromLabel: string;
    toLabel?: string | null;
    pickupAt?: string;
    createdAt: string;
    passengerId: string;
    assignedDriverId?: string | null;
    passenger?: {
      id: string;
      fullName?: string | null;
      userId: string;
      isVip?: boolean;
      user?: { id: string; email?: string | null; phoneE164?: string | null };
    } | null;
    assignedDriver?: {
      id: string;
      fullName?: string | null;
      userId: string;
      user?: { id: string; email?: string | null; phoneE164?: string | null };
    } | null;
    financial?: Record<string, unknown> | null;
  } | null;
};

const REFUND_REASONS = [
  'Customer dispute',
  'Service issue / incomplete trip',
  'Duplicate charge',
  'Driver no-show',
  'Goodwill gesture',
  'Other',
];

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'waterfall', label: 'Money' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'parties', label: 'Ride & parties' },
  { id: 'cases', label: 'Cases' },
  { id: 'audit', label: 'Audit' },
] as const;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function stripeDashboardUrl(providerRef?: string | null) {
  if (!providerRef) return null;
  return `https://dashboard.stripe.com/payments/${encodeURIComponent(providerRef)}`;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PaymentWorkspace({
  data,
  permissions,
  onReload,
  onToast,
}: {
  data: PaymentDetail;
  permissions: { refund: boolean; cases: boolean };
  onReload: () => Promise<void> | void;
  onToast: (msg: string, tone?: 'ok' | 'bad' | 'info') => void;
}) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState(REFUND_REASONS[0]);
  const [refundCustom, setRefundCustom] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const [caseTitle, setCaseTitle] = useState('');

  const currency = data.currency || 'CAD';
  const amount = n(data.amount);
  const remaining = n(data.refundableRemaining);
  const refunded = n(data.refundedTotal);
  const ride = data.ride;
  const financial = ride?.financial ?? null;
  const stripeUrl =
    String(data.provider || '')
      .toLowerCase()
      .includes('stripe') && data.providerRef
      ? stripeDashboardUrl(data.providerRef)
      : null;

  const reasonText = useMemo(() => {
    if (refundReason === 'Other') return refundCustom.trim();
    return refundReason;
  }, [refundReason, refundCustom]);

  async function doCopy(label: string, value: string) {
    try {
      await copyText(value);
      onToast(`${label} copied`, 'ok');
    } catch {
      onToast(`Could not copy ${label}`, 'bad');
    }
  }

  async function copyReceipt() {
    const lines = [
      `Payment ${data.id}`,
      `Amount: ${money(amount, currency)}`,
      `Status: ${data.status}`,
      `Provider: ${data.provider}${data.providerRef ? ` (${data.providerRef})` : ''}`,
      `Refunded: ${money(refunded, currency)}`,
      `Remaining: ${money(remaining, currency)}`,
      ride ? `Ride: ${ride.publicCode ?? ride.id}` : null,
      `Created: ${when(data.createdAt)}`,
    ].filter(Boolean);
    await doCopy('Receipt', lines.join('\n'));
  }

  async function submitRefund() {
    if (!reasonText || reasonText.length < 4) {
      onToast('Refund reason required (min 4 chars)', 'bad');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/payments/${data.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reasonText,
          amount: refundAmount ? Number(refundAmount) : undefined,
          internalNote: internalNote.trim() || undefined,
        }),
      });
      onToast('Refund issued', 'ok');
      setRefundOpen(false);
      setRefundAmount('');
      setInternalNote('');
      await onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function submitCase() {
    const title = caseTitle.trim();
    if (title.length < 3) {
      onToast('Case title required', 'bad');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/cases', {
        method: 'POST',
        body: JSON.stringify({
          title,
          type: 'DISPUTE',
          paymentId: data.id,
          rideId: data.rideId,
          passengerProfileId: ride?.passenger?.id,
          driverProfileId: ride?.assignedDriver?.id ?? ride?.assignedDriverId ?? undefined,
        }),
      });
      onToast('Dispute case created', 'ok');
      setCaseOpen(false);
      setCaseTitle('');
      await onReload();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pay-workspace">
      <div className="pay-breadcrumb">
        <Link href="/payments">Payments</Link>
        <span className="muted">/</span>
        <span className="mono">{shortId(data.id)}</span>
      </div>

      <header className="pay-header">
        <div className="pay-header-main">
          <div className="pay-amount">{money(amount, currency)}</div>
          <div className="pay-chips">
            <Chip tone={statusTone(data.status)}>{data.status}</Chip>
            <Chip>{data.provider}</Chip>
            <Chip>{data.paymentMode || 'FULL'}</Chip>
            {refunded > 0 && <Chip tone="warn">Refunded {money(refunded, currency)}</Chip>}
            {remaining <= 0 && amount > 0 && <Chip tone="info">Fully refunded</Chip>}
          </div>
          <div className="pay-meta muted">
            <span className="mono" title={data.id}>
              {data.id}
            </span>
            <span>·</span>
            <span>Created {when(data.createdAt)}</span>
            {data.providerRef && (
              <>
                <span>·</span>
                <span className="mono" title={data.providerRef}>
                  Ref {shortId(data.providerRef)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="pay-actions">
          {permissions.refund && remaining > 0 && (
            <button type="button" className="btn sm" onClick={() => setRefundOpen(true)}>
              Issue refund
            </button>
          )}
          {stripeUrl && (
            <a className="btn ghost sm" href={stripeUrl} target="_blank" rel="noreferrer">
              Open in Stripe
            </a>
          )}
          {permissions.cases && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setCaseTitle(
                  `Payment dispute · ${ride?.publicCode ?? shortId(data.id)} · ${money(amount, currency)}`,
                );
                setCaseOpen(true);
              }}
            >
              Create dispute case
            </button>
          )}
          {ride && (
            <Link className="btn ghost sm" href={`/rides/${ride.id}`}>
              Open ride
            </Link>
          )}
          {ride?.passenger?.userId && (
            <Link className="btn ghost sm" href={`/users/${ride.passenger.userId}`}>
              Passenger
            </Link>
          )}
          {ride?.assignedDriver?.userId && (
            <Link className="btn ghost sm" href={`/users/${ride.assignedDriver.userId}`}>
              Driver
            </Link>
          )}
          <button type="button" className="btn ghost sm" onClick={() => doCopy('Payment ID', data.id)}>
            Copy ID
          </button>
          {data.providerRef && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => doCopy('Provider ref', data.providerRef!)}
            >
              Copy ref
            </button>
          )}
          <button type="button" className="btn ghost sm" onClick={copyReceipt}>
            Copy receipt
          </button>
        </div>
      </header>

      <div className="pay-kpis">
        <div className="pay-kpi">
          <span className="label">Charged</span>
          <span className="value">{money(amount, currency)}</span>
        </div>
        <div className="pay-kpi">
          <span className="label">Refunded</span>
          <span className="value">{money(refunded, currency)}</span>
        </div>
        <div className="pay-kpi">
          <span className="label">Remaining</span>
          <span className="value">{money(remaining, currency)}</span>
        </div>
        <div className="pay-kpi">
          <span className="label">Online</span>
          <span className="value">
            {data.onlineAmount != null ? money(n(data.onlineAmount), currency) : '—'}
          </span>
        </div>
        <div className="pay-kpi">
          <span className="label">Cash</span>
          <span className="value">
            {data.cashAmount != null
              ? money(n(data.cashAmount), data.cashCurrency || currency)
              : '—'}
          </span>
        </div>
        <div className="pay-kpi">
          <span className="label">Marketplace fee</span>
          <span className="value">
            {financial?.marketplaceFee != null ? money(n(financial.marketplaceFee), currency) : '—'}
          </span>
        </div>
        <div className="pay-kpi">
          <span className="label">Driver net</span>
          <span className="value">
            {financial?.driverNetEarning != null
              ? money(n(financial.driverNetEarning), currency)
              : '—'}
          </span>
        </div>
      </div>

      <nav className="pay-section-nav" aria-label="Payment sections">
        {SECTIONS.map((s) => (
          <a key={s.id} className="btn ghost sm" href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className="pay-body">
        <section id="overview" className="panel pay-section">
          <h3>Overview</h3>
          <dl className="pay-dl">
            <div>
              <dt>Payment method</dt>
              <dd>{data.paymentMethod || '—'}</dd>
            </div>
            <div>
              <dt>Payment mode</dt>
              <dd>{data.paymentMode || 'FULL'}</dd>
            </div>
            <div>
              <dt>Idempotency key</dt>
              <dd className="mono">{data.idempotencyKey || '—'}</dd>
            </div>
            <div>
              <dt>Terms version</dt>
              <dd>{data.termsVersion || '—'}</dd>
            </div>
            <div>
              <dt>Policy version</dt>
              <dd>{data.policyVersion || '—'}</dd>
            </div>
            <div>
              <dt>Terms accepted</dt>
              <dd>{when(data.termsAcceptedAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{when(data.updatedAt)}</dd>
            </div>
            <div>
              <dt>Provider reference</dt>
              <dd className="mono">{data.providerRef || '—'}</dd>
            </div>
          </dl>
          {data.metaJson != null && (
            <details className="pay-details">
              <summary>Meta JSON</summary>
              <pre className="pay-json">{JSON.stringify(data.metaJson, null, 2)}</pre>
            </details>
          )}
        </section>

        <section id="waterfall" className="panel pay-section">
          <h3>Money waterfall</h3>
          {!financial ? (
            <p className="muted">No RideFinancial record for this ride yet.</p>
          ) : (
            <ul className="pay-waterfall">
              <WaterfallRow label="Ride fare" value={n(financial.rideFare)} currency={currency} />
              <WaterfallRow
                label="Marketplace fee"
                value={n(financial.marketplaceFee)}
                currency={currency}
              />
              <WaterfallRow
                label={`Taxes${financial.taxJurisdiction ? ` (${String(financial.taxJurisdiction)})` : ''}`}
                value={n(financial.taxes)}
                currency={currency}
              />
              <WaterfallRow
                label="Passenger total charged"
                value={n(financial.passengerTotalCharged)}
                currency={currency}
                strong
              />
              <WaterfallRow
                label={`Driver commission${financial.driverCommissionRate != null ? ` (${(n(financial.driverCommissionRate) * 100).toFixed(1)}%)` : ''}`}
                value={n(financial.driverCommission)}
                currency={currency}
              />
              <WaterfallRow
                label="Driver net earning"
                value={n(financial.driverNetEarning)}
                currency={currency}
                strong
              />
              <WaterfallRow
                label="Stripe processing fee"
                value={financial.stripeProcessingFee != null ? n(financial.stripeProcessingFee) : null}
                currency={currency}
              />
              <WaterfallRow
                label="CAN-RIDE gross revenue"
                value={n(financial.canRideGrossRevenue)}
                currency={currency}
              />
              <WaterfallRow
                label="CAN-RIDE net revenue"
                value={financial.canRideNetRevenue != null ? n(financial.canRideNetRevenue) : null}
                currency={currency}
                strong
              />
              <WaterfallRow
                label="Refund amount (ledger)"
                value={n(financial.refundAmount)}
                currency={currency}
              />
              <li className="pay-waterfall-meta">
                <span>Driver payout status</span>
                <Chip tone={statusTone(String(financial.driverPayoutStatus ?? ''))}>
                  {String(financial.driverPayoutStatus ?? '—')}
                </Chip>
              </li>
              {financial.refundReason != null && String(financial.refundReason) !== '' ? (
                <li className="pay-waterfall-meta">
                  <span>Refund reason</span>
                  <span>{String(financial.refundReason)}</span>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section id="refunds" className="panel pay-section">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Refunds</h3>
            {permissions.refund && remaining > 0 && (
              <button type="button" className="btn sm" onClick={() => setRefundOpen(true)}>
                Issue refund
              </button>
            )}
          </div>
          {data.refunds.length === 0 ? (
            <p className="muted">No refunds yet. Remaining refundable: {money(remaining, currency)}.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>By</th>
                    <th>Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {data.refunds.map((r) => (
                    <tr key={r.id}>
                      <td>{when(r.createdAt)}</td>
                      <td>{money(n(r.amount), r.currency || currency)}</td>
                      <td>
                        <Chip>{r.type}</Chip>
                      </td>
                      <td>
                        <Chip tone={statusTone(r.status)}>{r.status}</Chip>
                      </td>
                      <td>
                        <div>{r.reason}</div>
                        {r.internalNote && <div className="muted sm">{r.internalNote}</div>}
                      </td>
                      <td className="muted">{r.requestedBy?.email ?? '—'}</td>
                      <td className="mono">{r.gatewayRefundId ? shortId(r.gatewayRefundId) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="parties" className="panel pay-section">
          <h3>Ride &amp; parties</h3>
          {ride ? (
            <div className="grid-2">
              <div>
                <h4 style={{ marginTop: 0 }}>Ride</h4>
                <dl className="pay-dl">
                  <div>
                    <dt>Code</dt>
                    <dd>
                      <Link href={`/rides/${ride.id}`}>{ride.publicCode ?? shortId(ride.id)}</Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Chip tone={statusTone(ride.status)}>{ride.status}</Chip>
                    </dd>
                  </div>
                  <div>
                    <dt>Service</dt>
                    <dd>{ride.serviceType}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>
                      {ride.fromLabel} → {ride.toLabel ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Pickup</dt>
                    <dd>{when(ride.pickupAt)}</dd>
                  </div>
                </dl>
              </div>
              <div className="pay-parties">
                <PartyCard
                  role="Passenger"
                  name={ride.passenger?.fullName}
                  userId={ride.passenger?.userId}
                  email={ride.passenger?.user?.email}
                  phone={ride.passenger?.user?.phoneE164}
                  badge={ride.passenger?.isVip ? 'VIP' : undefined}
                />
                <PartyCard
                  role="Driver"
                  name={ride.assignedDriver?.fullName}
                  userId={ride.assignedDriver?.userId}
                  email={ride.assignedDriver?.user?.email}
                  phone={ride.assignedDriver?.user?.phoneE164}
                />
              </div>
            </div>
          ) : (
            <p className="muted">Ride not found for this payment.</p>
          )}
        </section>

        <section id="cases" className="panel pay-section">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Support cases</h3>
            {permissions.cases && (
              <button type="button" className="btn ghost sm" onClick={() => setCaseOpen(true)}>
                New dispute case
              </button>
            )}
          </div>
          {data.supportCases.length === 0 ? (
            <p className="muted">No cases linked to this payment.</p>
          ) : (
            <ul className="pay-case-list">
              {data.supportCases.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.title}</strong>
                    <div className="muted sm">
                      {when(c.createdAt)}
                      {c.assignee?.email ? ` · ${c.assignee.email}` : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Chip>{c.type}</Chip>
                    <Chip tone={statusTone(c.status)}>{c.status}</Chip>
                    <Link className="btn ghost sm" href={`/cases?q=${c.id}`}>
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="audit" className="panel pay-section">
          <h3>Audit &amp; webhooks</h3>
          {(data.auditLogs?.length ?? 0) === 0 ? (
            <p className="muted">No payment audit events yet.</p>
          ) : (
            <ul className="timeline">
              {data.auditLogs!.map((a) => (
                <li key={a.id}>
                  <strong>{a.action}</strong>
                  <div className="muted">
                    {when(a.createdAt)}
                    {a.actor?.email ? ` · ${a.actor.email}` : ''}
                    {a.reason ? ` · ${a.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.rawWebhookLast != null && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn ghost sm" onClick={() => setWebhookOpen((v) => !v)}>
                {webhookOpen ? 'Hide' : 'Show'} last webhook payload
              </button>
              {webhookOpen && (
                <pre className="pay-json">{JSON.stringify(data.rawWebhookLast, null, 2)}</pre>
              )}
            </div>
          )}
        </section>
      </div>

      {refundOpen && (
        <Modal title="Issue refund" onClose={() => !busy && setRefundOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Remaining refundable: <strong>{money(remaining, currency)}</strong>. Leave amount blank for
            full remaining.
          </p>
          <label className="pay-label">
            Amount
            <input
              className="field"
              type="number"
              min={0}
              step="0.01"
              max={remaining}
              placeholder={`Blank = ${remaining.toFixed(2)}`}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="pay-label">
            Reason preset
            <select
              className="field"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              disabled={busy}
            >
              {REFUND_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {refundReason === 'Other' && (
            <label className="pay-label">
              Custom reason
              <textarea
                className="field"
                rows={2}
                value={refundCustom}
                onChange={(e) => setRefundCustom(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <label className="pay-label">
            Internal note (optional)
            <textarea
              className="field"
              rows={2}
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setRefundOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn sm" disabled={busy} onClick={submitRefund}>
              {busy ? 'Refunding…' : 'Confirm refund'}
            </button>
          </div>
        </Modal>
      )}

      {caseOpen && (
        <Modal title="Create dispute case" onClose={() => !busy && setCaseOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Links this payment{ride ? ` and ride ${ride.publicCode ?? shortId(ride.id)}` : ''} to a
            support case of type DISPUTE.
          </p>
          <label className="pay-label">
            Title
            <input
              className="field"
              value={caseTitle}
              onChange={(e) => setCaseTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setCaseOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn sm" disabled={busy} onClick={submitCase}>
              {busy ? 'Creating…' : 'Create case'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WaterfallRow({
  label,
  value,
  currency,
  strong,
}: {
  label: string;
  value: number | null;
  currency: string;
  strong?: boolean;
}) {
  return (
    <li className={strong ? 'strong' : undefined}>
      <span>{label}</span>
      <span>{value == null ? '—' : money(value, currency)}</span>
    </li>
  );
}

function PartyCard({
  role,
  name,
  userId,
  email,
  phone,
  badge,
}: {
  role: string;
  name?: string | null;
  userId?: string;
  email?: string | null;
  phone?: string | null;
  badge?: string;
}) {
  return (
    <div className="pay-party-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {role}
        </span>
        {badge && <Chip tone="action">{badge}</Chip>}
      </div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{name || '—'}</div>
      <div className="muted sm">{email || '—'}</div>
      <div className="muted sm">{phone || '—'}</div>
      {userId && (
        <Link className="btn ghost sm" href={`/users/${userId}`} style={{ marginTop: 8 }}>
          Open profile
        </Link>
      )}
    </div>
  );
}
