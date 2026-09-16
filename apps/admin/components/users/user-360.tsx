'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../toast';
import { Chip, EmptyState, money, statusTone, when } from '../ui';
import { ImpersonateButton } from '../impersonate';
import { DangerZoneModal } from './danger-zone-modal';
import { LoginLinkModal } from './login-link-modal';
import { ResetPasswordModal } from './reset-password-modal';
import { SuspendUserModal } from './suspend-modal';
import {
  AccountStatusBadge,
  KycBadge,
  RiskBadge,
  RoleBadge,
  UserAvatar,
  VerifyIcon,
} from './badges';
import { relativeTime, roleLabel, shortId } from '../../lib/users';

type TabId =
  | 'overview'
  | 'rides'
  | 'payments'
  | 'payout'
  | 'kyc'
  | 'vehicles'
  | 'devices'
  | 'sessions'
  | 'support'
  | 'risk'
  | 'notes'
  | 'audit';

type User360 = {
  user: Record<string, unknown>;
  hasAvatar?: boolean;
  avatarPath?: string | null;
  avatarStorageKey?: string | null;
  marketplace: {
    rides: number;
    completed: number;
    cancelled: number;
    unfulfilled?: number;
    spend: number;
    earnings: number;
    avgRating: number | null;
  };
  rides?: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
  ratings: Array<Record<string, unknown>>;
  flaggedChats: Array<Record<string, unknown>>;
  cases: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  tags?: Array<Record<string, unknown>>;
  timeline: Array<{ at: string; kind: string; label: string }>;
  risk: { score: number; band: string };
};

function asObj(v: unknown) {
  return (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
}

function asArr<T = Record<string, unknown>>(v: unknown) {
  return (Array.isArray(v) ? v : []) as T[];
}

export function User360Workspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<User360 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [loginLinkOpen, setLoginLinkOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('danger') === '1') setDangerOpen(true);
    const t = searchParams.get('tab');
    if (
      t &&
      [
        'overview',
        'rides',
        'payments',
        'payout',
        'kyc',
        'vehicles',
        'devices',
        'sessions',
        'support',
        'risk',
        'notes',
        'audit',
      ].includes(t)
    ) {
      setTab(t as TabId);
    }
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setData(await api<User360>(`/admin/users/${id}/360`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const user = asObj(data?.user);
  const pax = asObj(user.passengerProfile);
  const drv = asObj(user.driverProfile);
  const name = String(pax.fullName || drv.fullName || user.email || user.id || 'User');
  const role = String(user.role || '');
  const isDriver = role === 'DRIVER' || Boolean(drv.id);
  const isPassenger = role === 'PASSENGER' || Boolean(pax.id);
  const sessions = asArr(user.sessions);
  const vehicles = asArr(drv.vehicles);
  const documents = asArr(drv.documents);
  const riskFlags = asArr(user.riskFlags);
  const watchlist = asArr(user.watchlistEntries);
  const mkt = data?.marketplace;
  const risk = data?.risk ?? { score: 0, band: 'LOW' };

  const tabs = useMemo(() => {
    const all: Array<{ id: TabId; label: string; show: boolean }> = [
      { id: 'overview', label: 'Overview', show: true },
      { id: 'rides', label: 'Rides', show: true },
      { id: 'payments', label: 'Payments', show: true },
      { id: 'payout', label: 'Payout', show: isDriver },
      { id: 'kyc', label: 'KYC', show: isDriver },
      { id: 'vehicles', label: 'Vehicles', show: isDriver },
      { id: 'devices', label: 'Devices', show: true },
      { id: 'sessions', label: 'Sessions', show: true },
      { id: 'support', label: 'Support', show: true },
      { id: 'risk', label: 'Risk', show: true },
      { id: 'notes', label: 'Notes', show: true },
      { id: 'audit', label: 'Audit', show: true },
    ];
    return all.filter((t) => t.show);
  }, [isDriver]);

  const canSuspend = hasPermission(me?.permissions, 'users.suspend');
  const canResetPassword = hasPermission(me?.permissions, 'users.reset_password');
  const canVip = hasPermission(me?.permissions, 'users.vip');
  const canRisk = hasPermission(me?.permissions, 'risk.act');
  const canImpersonate = hasPermission(me?.permissions, 'users.impersonate');
  const canArchive = hasPermission(me?.permissions, 'users.archive');
  const canAnonymize = hasPermission(me?.permissions, 'users.anonymize');
  const canDelete = hasPermission(me?.permissions, 'users.delete');
  const canPayoutReview = hasPermission(me?.permissions, 'finance.payout_review');
  const tags = asArr(data?.tags).map((t) => asObj(asObj(t).tag));
  const isArchived = Boolean(user.archivedAt);
  const isAnonymized = Boolean(user.anonymizedAt);

  async function confirmSuspend(payload: { reason: string; category: string }) {
    setBusy(true);
    try {
      await api(`/admin/users/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({
          isSuspended: !user.isSuspended,
          reason: `${payload.category}: ${payload.reason}`,
        }),
      });
      toast.push(user.isSuspended ? 'Account reactivated' : 'User suspended');
      setSuspendOpen(false);
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function toggleVip() {
    if (!pax.id) return;
    try {
      await api(`/admin/passengers/${pax.id}/vip`, {
        method: 'POST',
        body: JSON.stringify({ isVip: !pax.isVip }),
      });
      toast.push(pax.isVip ? 'VIP removed' : 'Marked VIP');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  }

  async function watch() {
    try {
      if (watchlist.length) {
        await api(`/admin/watchlist/${id}`, { method: 'DELETE' });
        toast.push('Removed from watchlist');
      } else {
        await api(`/admin/watchlist/${id}`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Added from User 360' }),
        });
        toast.push('Added to watchlist');
      }
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied`);
    } catch {
      toast.push(`Could not copy ${label}`, 'bad');
    }
  }

  if (err) {
    return (
      <div className="panel">
        <p className="err">{err}</p>
        <button type="button" className="btn sm" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="user360">
        <div className="skel" style={{ height: 120, marginBottom: 12 }} />
        <div className="skel" style={{ height: 64, marginBottom: 12 }} />
        <div className="skel" style={{ height: 280 }} />
      </div>
    );
  }

  const cancelRate =
    mkt && mkt.rides > 0 ? Math.round((mkt.cancelled / mkt.rides) * 100) : null;
  const lastSession = sessions[0] as { lastSeenAt?: string; ip?: string; userAgent?: string } | undefined;

  const kpis: Array<{ label: string; value: string }> = isDriver
    ? [
        { label: 'Trips', value: String(mkt?.rides ?? 0) },
        { label: 'Completed', value: String(mkt?.completed ?? 0) },
        { label: 'Cancelled', value: String(mkt?.cancelled ?? 0) },
        { label: 'Cancel %', value: cancelRate != null ? `${cancelRate}%` : '—' },
        { label: 'Earnings', value: money(mkt?.earnings) },
        { label: 'Avg rating', value: mkt?.avgRating != null ? String(mkt.avgRating) : '—' },
      ]
    : [
        { label: 'Rides', value: String(mkt?.rides ?? 0) },
        { label: 'Completed', value: String(mkt?.completed ?? 0) },
        { label: 'Cancelled', value: String(mkt?.cancelled ?? 0) },
        { label: 'Unfulfilled', value: String(mkt?.unfulfilled ?? 0) },
        { label: 'Spend', value: money(mkt?.spend) },
        { label: 'Avg rating', value: mkt?.avgRating != null ? String(mkt.avgRating) : '—' },
      ];

  return (
    <div className="user360">
      <p className="muted" style={{ marginBottom: 8 }}>
        <Link href="/users">Users</Link> / 360
      </p>

      <div className="user360-header">
        <div className="user360-identity">
          <UserAvatar
            name={name}
            size={56}
            hasAvatar={Boolean(data?.hasAvatar)}
            avatarPath={data?.avatarPath ?? null}
          />
          <div>
            <h1 className="page-title" style={{ marginBottom: 6 }}>
              {name}
            </h1>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <RoleBadge role={role} />
              <AccountStatusBadge
                suspended={Boolean(user.isSuspended)}
                archived={isArchived}
                anonymized={isAnonymized}
              />
              {isDriver ? <KycBadge status={String(drv.approvalStatus || '')} /> : null}
              <RiskBadge band={risk.band} />
              {Boolean(pax.isVip) && <Chip tone="warn">VIP</Chip>}
              {watchlist.length > 0 && <Chip tone="action">Watchlist</Chip>}
              {tags.map((t) => (
                <Chip key={String(t.id || t.slug)}>{String(t.label || t.slug)}</Chip>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              <button type="button" className="linkish" onClick={() => void copy('User ID', String(user.id))}>
                ID {shortId(String(user.id))}
              </button>
              {' · '}Registered {when(user.createdAt as string)}
              {' · '}Last active {relativeTime(lastSession?.lastSeenAt)}
              {drv.baseLocation ? ` · ${String(drv.baseLocation)}` : ''}
            </div>
            <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 4 }}>
                {String(user.email || '—')}
                <VerifyIcon ok={Boolean(user.email)} label="Email" />
                {user.email ? (
                  <button type="button" className="btn ghost sm" onClick={() => void copy('Email', String(user.email))}>
                    Copy
                  </button>
                ) : null}
              </span>
              <span className="row" style={{ gap: 4 }}>
                {String(user.phoneE164 || '—')}
                <VerifyIcon ok={Boolean(user.phoneVerifiedAt)} label="Phone" />
                {user.phoneE164 ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => void copy('Phone', String(user.phoneE164))}
                  >
                    Copy
                  </button>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        <div className="user360-actions">
          <ImpersonateButton userId={String(id)} name={name} />
          {canImpersonate && (
            <button type="button" className="btn ghost sm" onClick={() => setLoginLinkOpen(true)}>
              Login link
            </button>
          )}
          {canResetPassword && (
            <button type="button" className="btn ghost sm" onClick={() => setResetPasswordOpen(true)}>
              Reset password
            </button>
          )}
          {canSuspend && (
            <button type="button" className="btn danger sm" onClick={() => setSuspendOpen(true)}>
              {user.isSuspended ? 'Reactivate' : 'Suspend'}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn ghost sm" onClick={() => setMoreOpen((v) => !v)}>
              More
            </button>
            {moreOpen && (
              <div className="users-views-pop" style={{ right: 0 }}>
                {canVip && pax.id ? (
                  <button type="button" onClick={() => { void toggleVip(); setMoreOpen(false); }}>
                    {pax.isVip ? 'Remove VIP' : 'Make VIP'}
                  </button>
                ) : null}
                {canRisk ? (
                  <button type="button" onClick={() => { void watch(); setMoreOpen(false); }}>
                    {watchlist.length ? 'Remove watchlist' : 'Add to watchlist'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const label = window.prompt('Tag label (e.g. VIP, Fraud Review)');
                    if (!label?.trim()) return;
                    void api(`/admin/users/${id}/tags`, {
                      method: 'POST',
                      body: JSON.stringify({ label: label.trim() }),
                    })
                      .then(() => {
                        toast.push('Tag added');
                        return load();
                      })
                      .catch((e) => toast.push(e instanceof Error ? e.message : String(e), 'bad'));
                    setMoreOpen(false);
                  }}
                >
                  Add tag
                </button>
                <button type="button" onClick={() => { setTab('notes'); setMoreOpen(false); }}>
                  Add internal note
                </button>
                {(canArchive || canAnonymize || canDelete) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDangerOpen(true);
                      setMoreOpen(false);
                    }}
                  >
                    Danger zone…
                  </button>
                )}
                {isDriver && drv.id ? (
                  <button type="button" onClick={() => { router.push(`/kyc/${drv.id}`); setMoreOpen(false); }}>
                    Open KYC workspace
                  </button>
                ) : null}
                <button type="button" onClick={() => { router.push(`/rides?q=${id}`); setMoreOpen(false); }}>
                  View rides
                </button>
                <button type="button" onClick={() => { router.push('/payments'); setMoreOpen(false); }}>
                  View payments
                </button>
                <button type="button" onClick={() => { router.push(`/audit?q=${id}`); setMoreOpen(false); }}>
                  Audit history
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="user360-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="user360-kpi">
            <div className="label">{k.label}</div>
            <div className="value">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="user360-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="user360-body">
        {tab === 'overview' && (
          <OverviewTab
            user={user}
            pax={pax}
            drv={drv}
            mkt={mkt}
            risk={risk}
            cases={data.cases}
            flagged={data.flaggedChats}
            ratings={data.ratings}
            watchlist={watchlist}
            lastSession={lastSession}
            timeline={data.timeline}
            isDriver={isDriver}
            isPassenger={isPassenger}
            canDanger={canArchive || canAnonymize || canDelete}
            onOpenDanger={() => setDangerOpen(true)}
          />
        )}
        {tab === 'rides' && <RidesTab rides={data.rides ?? []} marketplace={mkt} userId={String(id)} />}
        {tab === 'payments' && <PaymentsTab payments={data.payments} refunds={data.refunds} />}
        {tab === 'payout' && (
          <PayoutTab
            userId={String(id)}
            drv={drv}
            canReview={canPayoutReview}
            onChanged={() => void load()}
          />
        )}
        {tab === 'kyc' && <KycTab drv={drv} documents={documents} driverId={String(drv.id || '')} />}
        {tab === 'vehicles' && <VehiclesTab vehicles={vehicles} />}
        {tab === 'devices' && <DevicesTab sessions={sessions} />}
        {tab === 'sessions' && <SessionsTab sessions={sessions} />}
        {tab === 'support' && <SupportTab cases={data.cases} />}
        {tab === 'risk' && (
          <RiskTab
            risk={risk}
            flags={riskFlags}
            watchlist={watchlist}
            flagged={data.flaggedChats}
            cancelled={mkt?.cancelled ?? 0}
            completed={mkt?.completed ?? 0}
            suspended={Boolean(user.isSuspended)}
          />
        )}
        {tab === 'notes' && (
          <NotesTab
            userId={String(id)}
            notes={asArr(data.notes)}
            onChanged={() => void load()}
          />
        )}
        {tab === 'audit' && <AuditTab timeline={data.timeline} userId={String(id)} />}
      </div>

      {suspendOpen && (
        <SuspendUserModal
          users={[
            {
              id: String(user.id),
              displayName: name,
              role,
              email: user.email as string,
              isSuspended: Boolean(user.isSuspended),
              accountStatus: user.isSuspended ? 'SUSPENDED' : 'ACTIVE',
              createdAt: String(user.createdAt),
              watchlisted: watchlist.length > 0,
              riskBand: risk.band,
              riskOpen: 0,
            },
          ]}
          suspending={!user.isSuspended}
          busy={busy}
          onClose={() => setSuspendOpen(false)}
          onConfirm={confirmSuspend}
        />
      )}
      {loginLinkOpen && (
        <LoginLinkModal userId={String(id)} name={name} onClose={() => setLoginLinkOpen(false)} />
      )}
      {resetPasswordOpen && (
        <ResetPasswordModal
          userId={String(id)}
          name={name}
          email={typeof user.email === 'string' ? user.email : null}
          onClose={() => setResetPasswordOpen(false)}
        />
      )}
      {dangerOpen && (
        <DangerZoneModal
          userId={String(id)}
          displayName={name}
          archived={isArchived}
          anonymized={isAnonymized}
          onClose={() => setDangerOpen(false)}
          onDone={(result) => {
            if (result.redirected) {
              router.push('/users');
              return;
            }
            void load();
          }}
        />
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel user360-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="user360-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function OverviewTab(props: {
  user: Record<string, unknown>;
  pax: Record<string, unknown>;
  drv: Record<string, unknown>;
  mkt?: User360['marketplace'];
  risk: { score: number; band: string };
  cases: Array<Record<string, unknown>>;
  flagged: Array<Record<string, unknown>>;
  ratings: Array<Record<string, unknown>>;
  watchlist: Array<Record<string, unknown>>;
  lastSession?: { lastSeenAt?: string; ip?: string; userAgent?: string };
  timeline: Array<{ at: string; kind: string; label: string }>;
  isDriver: boolean;
  isPassenger: boolean;
  canDanger?: boolean;
  onOpenDanger?: () => void;
}) {
  const {
    user,
    pax,
    drv,
    mkt,
    risk,
    cases,
    flagged,
    ratings,
    watchlist,
    lastSession,
    timeline,
    isDriver,
    canDanger,
    onOpenDanger,
  } = props;

  const steps = isDriver
    ? [
        { label: 'Account created', done: true },
        { label: 'Phone verified', done: Boolean(user.phoneVerifiedAt) },
        { label: 'Profile completed', done: Boolean(drv.fullName) },
        { label: 'Documents submitted', done: Boolean(drv.kycSubmittedAt) || asArr(drv.documents).length > 0 },
        { label: 'KYC review', done: ['APPROVED', 'IN_REVIEW'].includes(String(drv.approvalStatus)) },
        { label: 'Vehicle approved', done: asArr(drv.vehicles).length > 0 },
        {
          label: 'Payout details verified',
          done: ['VERIFIED', 'CONFIGURED'].includes(
            String(asObj(drv.payoutSettingsJson).status || ''),
          ),
        },
        { label: 'Driver approved', done: drv.approvalStatus === 'APPROVED' && Boolean(drv.isActivated) },
      ]
    : [];

  return (
    <div className="user360-overview">
      <div className="grid-2">
        <Card title="Profile">
          <Row label="Full name" value={String(pax.fullName || drv.fullName || '—')} />
          <Row label="Email" value={String(user.email || '—')} />
          <Row label="Phone" value={String(user.phoneE164 || '—')} />
          <Row label="Language" value={String(pax.language || '—')} />
          <Row label="Currency" value={String(pax.currency || '—')} />
          <Row label="Referral" value={String(pax.referralCode || drv.referredByCode || '—')} />
        </Card>
        <Card title="Account">
          <Row label="Status" value={user.isSuspended ? 'Suspended' : 'Active'} />
          <Row label="Role" value={roleLabel(String(user.role))} />
          <Row label="Phone verified" value={when(user.phoneVerifiedAt as string)} />
          <Row label="KYC" value={isDriver ? String(drv.approvalStatus || '—') : 'N/A'} />
          <Row label="Driver activated" value={isDriver ? String(Boolean(drv.isActivated)) : 'N/A'} />
          <Row label="Created" value={when(user.createdAt as string)} />
          <Row label="Updated" value={when(user.updatedAt as string)} />
        </Card>
        <Card title="Activity">
          <Row label="Last seen" value={when(lastSession?.lastSeenAt)} />
          <Row label="IP" value={lastSession?.ip || '—'} />
          <Row label="Device" value={lastSession?.userAgent || 'No active session'} />
          <Row label="Active sessions" value={asArr(user.sessions).length} />
        </Card>
        <Card title="Marketplace">
          <Row label="Total rides" value={mkt?.rides ?? 0} />
          <Row label="Completed" value={mkt?.completed ?? 0} />
          <Row label="Cancelled" value={mkt?.cancelled ?? 0} />
          <Row label="Spend" value={money(mkt?.spend)} />
          <Row label="Earnings" value={money(mkt?.earnings)} />
          <Row label="Avg rating" value={mkt?.avgRating ?? '—'} />
        </Card>
        <Card title="Financial">
          <Row label="Lifetime spend" value={money(mkt?.spend)} />
          <Row label="Driver earnings" value={money(mkt?.earnings)} />
          <Row label="Open cases" value={cases.filter((c) => c.status !== 'RESOLVED').length} />
        </Card>
        <Card title="Trust & safety">
          <Row label="Risk score" value={`${risk.score} / 100`} />
          <Row label="Risk level" value={<RiskBadge band={risk.band} />} />
          <Row label="Open cases" value={cases.length} />
          <Row label="Flagged chats" value={flagged.length} />
          <Row label="Ratings" value={ratings.length} />
          <Row label="Watchlist" value={watchlist.length ? 'Yes' : 'No'} />
        </Card>
      </div>

      {isDriver && (
        <Card title="Driver onboarding">
          <ol className="onboarding-steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : 'pending'}>
                <span className="mark">{s.done ? '✓' : '○'}</span>
                {s.label}
              </li>
            ))}
          </ol>
          {drv.id ? (
            <Link className="btn ghost sm" href={`/kyc/${drv.id}`} style={{ marginTop: 8 }}>
              Open KYC review
            </Link>
          ) : null}
          {drv.id ? (
            <Link className="btn ghost sm" href={`?tab=payout`} style={{ marginTop: 8, marginLeft: 8 }}>
              Review payout details
            </Link>
          ) : null}
        </Card>
      )}

      {canDanger && (
        <Card title="Danger zone">
          <p className="muted" style={{ marginTop: 0 }}>
            Archive hides the account. Anonymize removes personal data but keeps rides/payments/audit.
            Permanent delete is only allowed when no marketplace history exists.
          </p>
          <button type="button" className="btn danger sm" onClick={onOpenDanger}>
            Open danger zone
          </button>
        </Card>
      )}

      <Card title="Activity timeline">
        {timeline.length === 0 ? (
          <EmptyState title="No activity yet" description="Events will appear as the account is used." />
        ) : (
          <ul className="timeline user360-timeline">
            {[...timeline].reverse().slice(0, 30).map((t, i) => (
              <li key={`${t.at}-${i}`}>
                <strong>{t.label}</strong>
                <div className="muted">
                  {when(t.at)} · {t.kind}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RidesTab({
  rides,
  marketplace,
  userId,
}: {
  rides: Array<Record<string, unknown>>;
  marketplace?: User360['marketplace'];
  userId: string;
}) {
  if (!rides.length) {
    return (
      <div className="panel">
        <EmptyState
          title="No rides recorded"
          description="Completed and cancelled trips for this account will appear here."
          action={
            <Link className="btn ghost sm" href={`/rides?q=${userId}`}>
              Open rides module
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Rides</h3>
          <p className="muted" style={{ margin: 0 }}>
            {marketplace?.rides ?? rides.length} total · {marketplace?.completed ?? 0} completed ·{' '}
            {marketplace?.cancelled ?? 0} cancelled · {marketplace?.unfulfilled ?? 0} unfulfilled
          </p>
        </div>
        <Link className="btn sm" href={`/rides?q=${userId}`}>
          Open rides module
        </Link>
      </div>
      <table className="users-table">
        <thead>
          <tr>
            <th>Ride</th>
            <th>Created</th>
            <th>Scheduled Pickup</th>
            <th>Route</th>
            <th>Service</th>
            <th>Fare</th>
            <th>Offers</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((r) => (
            <tr key={String(r.id)} onClick={() => (window.location.href = `/rides/${r.id}`)}>
              <td className="mono">{String(r.publicCode || shortId(String(r.id)))}</td>
              <td>{when(r.createdAt as string)}</td>
              <td>{when((r.pickupAt as string) || null)}</td>
              <td>
                <div>{String(r.fromLabel || '—')}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  → {String(r.toLabel || '—')}
                </div>
              </td>
              <td>{String(r.serviceType || '—')}</td>
              <td>{money(Number(r.fare || 0), String(r.currency || 'USD'))}</td>
              <td>{String(r.offerCount ?? '—')}</td>
              <td>
                <Chip tone={statusTone(String(r.status))}>{formatRideStatus(String(r.status))}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRideStatus(status: string) {
  const map: Record<string, string> = {
    WAITING_FOR_OFFERS: 'OPEN',
    OFFER_SELECTION: 'OFFERS AVAILABLE',
    PAYMENT_PENDING: 'PAYMENT PENDING',
    BOOKED: 'SCHEDULED',
    DRIVER_EN_ROUTE: 'DRIVER EN ROUTE',
    DRIVER_ARRIVED: 'DRIVER ARRIVED',
    TRIP_STARTED: 'IN PROGRESS',
    IN_PROGRESS: 'IN PROGRESS',
    COMPLETED: 'COMPLETED',
    PASSENGER_CANCELLED: 'CANCELLED',
    DRIVER_CANCELLED: 'CANCELLED (DRIVER)',
    ADMIN_CANCELLED: 'CANCELLED (ADMIN)',
    EXPIRED: 'EXPIRED / UNFULFILLED',
    NO_SHOW: 'NO SHOW',
    PAYMENT_FAILED: 'PAYMENT FAILED',
  };
  return map[status] ?? status;
}

function PaymentsTab({
  payments,
  refunds,
}: {
  payments: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
}) {
  if (!payments.length && !refunds.length) {
    return (
      <div className="panel">
        <EmptyState title="No payments yet" description="Charges, refunds and payouts will appear here." />
      </div>
    );
  }
  return (
    <div className="panel">
      <h3>Transactions</h3>
      <table className="users-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Ride</th>
          </tr>
        </thead>
        <tbody>
          {payments.slice(0, 40).map((p) => (
            <tr key={String(p.id)}>
              <td className="mono">{shortId(String(p.id))}</td>
              <td>{money(Number(p.amount), String(p.currency || 'USD'))}</td>
              <td>
                <Chip tone={String(p.status).toLowerCase().includes('fail') ? 'bad' : 'ok'}>
                  {String(p.status)}
                </Chip>
              </td>
              <td className="mono">{p.rideId ? shortId(String(p.rideId)) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {refunds.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Refunds</h3>
          {refunds.map((r) => (
            <div key={String(r.id)}>
              {money(Number(r.amount))} · {String(r.status)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function PayoutTab({
  userId,
  drv,
  canReview,
  onChanged,
}: {
  userId: string;
  drv: Record<string, unknown>;
  canReview: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const payout = asObj(drv.payoutSettingsJson);
  const status = String(
    payout.status ?? (payout.outpaymentCurrency ? 'CONFIGURED' : 'NOT_CONFIGURED'),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const configured = Boolean(
    payout.payoutMethod && payout.outpaymentCurrency && payout.bankCountry,
  );
  const canApprove =
    canReview && configured && (status === 'PENDING' || status === 'REJECTED');
  const canReject =
    canReview &&
    configured &&
    (status === 'PENDING' || status === 'VERIFIED' || status === 'CONFIGURED');

  async function review(decision: 'APPROVE' | 'REJECT') {
    setBusy(true);
    try {
      await api(`/admin/users/${userId}/payout-details/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          ...(decision === 'REJECT' || note.trim() ? { note: note.trim() || undefined } : {}),
        }),
      });
      toast.push(decision === 'APPROVE' ? 'Payout details approved' : 'Payout details rejected');
      setNote('');
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  if (!drv.id) {
    return (
      <div className="panel">
        <EmptyState title="No driver profile" description="Payout details apply to drivers only." />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Bank / payout details</h3>
        <Chip tone={statusTone(status)}>{status}</Chip>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Driver must have verified payout details before wallet withdrawals are allowed.
      </p>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <Card title="Submitted details">
          <Row label="Account holder" value={String(payout.accountHolderName || '—')} />
          <Row label="Account mask" value={String(payout.accountMask || '—')} />
          <Row label="Bank country" value={String(payout.bankCountry || '—')} />
          <Row label="Currency" value={String(payout.outpaymentCurrency || '—')} />
          <Row label="Method" value={String(payout.payoutMethod || '—')} />
          <Row label="Billing period" value={String(payout.billingPeriod || '—')} />
        </Card>
        <Card title="Review">
          <Row label="Status" value={<Chip tone={statusTone(status)}>{status}</Chip>} />
          <Row label="Reviewed at" value={when((payout.reviewedAt as string) || null)} />
          <Row label="Reviewed by" value={String(payout.reviewedByAdminId || '—')} />
          <Row label="Note" value={String(payout.reviewNote || '—')} />
        </Card>
      </div>

      {canReview && (
        <div style={{ marginTop: 16 }}>
          <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Review note {canReject ? '(required to reject)' : '(optional)'}
          </label>
          <textarea
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for rejection or internal note…"
            style={{ width: '100%', maxWidth: 520 }}
          />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !canApprove}
              onClick={() => void review('APPROVE')}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={busy || !canReject || note.trim().length < 2}
              onClick={() => void review('REJECT')}
            >
              Reject
            </button>
            <Link className="btn ghost" href="/payouts">
              Open queue
            </Link>
          </div>
        </div>
      )}
      {!canReview && (
        <p className="muted" style={{ marginTop: 12 }}>
          You need finance.payout_review to approve or reject.
        </p>
      )}
    </div>
  );
}

function KycTab({
  drv,
  documents,
  driverId,
}: {
  drv: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  driverId: string;
}) {
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ marginTop: 0 }}>KYC status</h3>
          <KycBadge status={String(drv.approvalStatus || '')} />
        </div>
        {driverId ? (
          <Link className="btn sm" href={`/kyc/${driverId}`}>
            Open full KYC review
          </Link>
        ) : null}
      </div>
      <Row label="Submitted" value={when(drv.kycSubmittedAt as string)} />
      <Row label="Reviewed" value={when(drv.kycDecidedAt as string)} />
      <Row label="Decision note" value={String(drv.kycDecisionNote || '—')} />
      <Row label="Reason" value={String(drv.kycDecisionReason || '—')} />
      <h4>Documents</h4>
      {documents.length === 0 ? (
        <EmptyState title="No KYC submission" description="Documents will appear after the driver uploads them." />
      ) : (
        <ul>
          {documents.map((d) => (
            <li key={String(d.id)}>
              {String(d.docType)} · {String(d.status)} · {when(d.createdAt as string)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VehiclesTab({ vehicles }: { vehicles: Array<Record<string, unknown>> }) {
  if (!vehicles.length) {
    return (
      <div className="panel">
        <EmptyState title="No vehicles" description="Approved or pending vehicles will show here." />
      </div>
    );
  }
  return (
    <div className="panel">
      <table className="users-table">
        <thead>
          <tr>
            <th>Plate</th>
            <th>Name</th>
            <th>Class</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={String(v.id)}>
              <td>{String(v.plate || '—')}</td>
              <td>{String(v.name || '—')}</td>
              <td>{String(v.vehicleClass || '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DevicesTab({ sessions }: { sessions: Array<Record<string, unknown>> }) {
  const devices = sessions.filter((s) => s.deviceId || s.userAgent);
  if (!devices.length) {
    return (
      <div className="panel">
        <EmptyState title="No devices recorded" description="Device fingerprints appear when sessions report a device ID." />
      </div>
    );
  }
  return (
    <div className="panel">
      <table className="users-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>IP</th>
            <th>Last seen</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d, i) => (
            <tr key={String(d.id || i)}>
              <td style={{ maxWidth: 280 }}>
                <div className="mono" style={{ fontSize: 11 }}>{String(d.deviceId || '—')}</div>
                <div className="muted" style={{ fontSize: 11 }}>{String(d.userAgent || '').slice(0, 80)}</div>
              </td>
              <td>{String(d.ip || '—')}</td>
              <td>{when(d.lastSeenAt as string)}</td>
              <td>{d.revokedAt ? <Chip tone="bad">Revoked</Chip> : <Chip tone="ok">Active</Chip>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: Array<Record<string, unknown>> }) {
  if (!sessions.length) {
    return (
      <div className="panel">
        <EmptyState title="No active sessions" description="Login sessions will appear here." />
      </div>
    );
  }
  return (
    <div className="panel">
      <table className="users-table">
        <thead>
          <tr>
            <th>Started</th>
            <th>Last active</th>
            <th>IP</th>
            <th>Agent</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={String(s.id || i)}>
              <td>{when(s.createdAt as string)}</td>
              <td>{when(s.lastSeenAt as string)}</td>
              <td>{String(s.ip || '—')}</td>
              <td className="muted" style={{ fontSize: 11, maxWidth: 240 }}>
                {String(s.userAgent || '—').slice(0, 90)}
              </td>
              <td>{s.revokedAt ? <Chip tone="bad">Revoked</Chip> : <Chip tone="ok">Active</Chip>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupportTab({ cases }: { cases: Array<Record<string, unknown>> }) {
  if (!cases.length) {
    return (
      <div className="panel">
        <EmptyState title="No support cases" description="Cases linked to this user will appear here." />
      </div>
    );
  }
  return (
    <div className="panel">
      <table className="users-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Status</th>
            <th>Type</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={String(c.id)}>
              <td>{String(c.title || c.id)}</td>
              <td>
                <Chip>{String(c.status)}</Chip>
              </td>
              <td>{String(c.type || '—')}</td>
              <td>{when(c.createdAt as string)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskTab({
  risk,
  flags,
  watchlist,
  flagged,
  cancelled,
  completed,
  suspended,
}: {
  risk: { score: number; band: string };
  flags: Array<Record<string, unknown>>;
  watchlist: Array<Record<string, unknown>>;
  flagged: Array<Record<string, unknown>>;
  cancelled: number;
  completed: number;
  suspended: boolean;
}) {
  const signals = [
    suspended && 'Account currently suspended',
    watchlist.length > 0 && 'On watchlist',
    flagged.length > 0 && `${flagged.length} flagged chat message(s)`,
    cancelled > 3 && `Elevated cancellations (${cancelled})`,
    completed > 0 && cancelled / (completed + cancelled) > 0.4 && 'High cancellation ratio',
    flags.map((f) => `${String(f.code)} (${String(f.severity)})`),
  ]
    .flat()
    .filter(Boolean) as string[];

  return (
    <div className="panel">
      <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="label-xs muted">Risk score</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{risk.score} / 100</div>
        </div>
        <RiskBadge band={risk.band} />
      </div>
      <h4>Signals from system data</h4>
      {signals.length === 0 ? (
        <EmptyState title="No elevated risk signals" description="Only real system signals are shown — nothing invented." />
      ) : (
        <ul>
          {signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesTab({
  userId,
  notes,
  onChanged,
}: {
  userId: string;
  notes: Array<Record<string, unknown>>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('General');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      await api(`/admin/users/${userId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), category, priority }),
      });
      setBody('');
      toast.push('Internal note added');
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Internal notes</h3>
      <p className="muted">Never visible to passengers or drivers.</p>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <label>
          <span className="label-xs muted">Category</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {['General', 'Support', 'Safety', 'Payments', 'KYC', 'Fraud', 'Driver Operations'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label-xs muted">Priority</span>
          <select className="field" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>
      <textarea
        className="field"
        rows={3}
        placeholder="Add an internal operational note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button type="button" className="btn sm" disabled={busy || body.trim().length < 2} onClick={() => void submit()}>
        {busy ? 'Saving…' : 'Add note'}
      </button>
      <div style={{ marginTop: 16 }}>
        {notes.length === 0 ? (
          <EmptyState title="No internal notes" description="Ops notes about this account will appear here." />
        ) : (
          <ul className="timeline">
            {notes.map((n) => {
              const author = asObj(n.author);
              return (
                <li key={String(n.id)}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Chip>{String(n.category || 'General')}</Chip>
                    {n.priority && n.priority !== 'normal' ? <Chip tone="warn">{String(n.priority)}</Chip> : null}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {String(author.email || 'Admin')} · {when(n.createdAt as string)}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0' }}>{String(n.body)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AuditTab({
  timeline,
  userId,
}: {
  timeline: Array<{ at: string; kind: string; label: string }>;
  userId: string;
}) {
  const adminEvents = timeline.filter((t) => t.kind === 'admin' || /SUSPEND|KYC|WATCH|IMPERSON/i.test(t.label));
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ marginTop: 0 }}>Audit trail</h3>
        <Link className="btn ghost sm" href={`/audit?q=${userId}`}>
          Open audit module
        </Link>
      </div>
      {adminEvents.length === 0 ? (
        <EmptyState title="No admin events yet" description="Sensitive operations against this account will appear here." />
      ) : (
        <ul className="timeline">
          {[...adminEvents].reverse().map((t, i) => (
            <li key={`${t.at}-${i}`}>
              <strong>{t.label}</strong>
              <div className="muted">{when(t.at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
