'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, hasPermission } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Chip, statusTone, when, money } from '../../../../components/ui';
import { ImpersonateButton } from '../../../../components/impersonate';

export default function User360Page() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function load() {
    setData(await api<Record<string, unknown>>(`/admin/users/${id}/360`));
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  async function suspend(isSuspended: boolean) {
    await api(`/admin/users/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ isSuspended, reason: reason || 'Admin action from 360' }),
    });
    await load();
  }

  async function vip(isVip: boolean, profileId: string) {
    await api(`/admin/passengers/${profileId}/vip`, {
      method: 'POST',
      body: JSON.stringify({ isVip }),
    });
    await load();
  }

  async function watch() {
    await api(`/admin/watchlist/${id}`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Watch from 360' }),
    });
    await load();
  }

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">Loading 360…</p>;

  const user = data.user as Record<string, unknown>;
  const pax = user.passengerProfile as Record<string, unknown> | undefined;
  const drv = user.driverProfile as Record<string, unknown> | undefined;
  const name = String(pax?.fullName || drv?.fullName || user.email || user.id);
  const mkt = data.marketplace as Record<string, number>;
  const timeline = (data.timeline as Array<{ at: string; kind: string; label: string }>) ?? [];
  const risk = data.risk as { score: number; band: string };
  const sessions = (user.sessions as Array<{ lastSeenAt?: string; ip?: string; userAgent?: string; deviceId?: string }>) ?? [];
  const payments = (data.payments as Array<{ id: string; amount: number; status: string; currency?: string }>) ?? [];
  const refunds = (data.refunds as Array<{ id: string; amount: number; status: string }>) ?? [];
  const ratings = (data.ratings as Array<{ stars: number; comment?: string }>) ?? [];
  const flagged = (data.flaggedChats as Array<{ id: string; body?: string }>) ?? [];
  const cases = (data.cases as Array<{ id: string; title: string; status: string }>) ?? [];
  const watchlist = (user.watchlistEntries as Array<{ reason?: string }>) ?? [];
  const last = sessions[0];

  return (
    <div>
      <p className="muted">
        <Link href="/users">Users</Link> / 360
      </p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{name}</h1>
          <p className="page-sub">
            {String(user.email)} · {String(user.phoneE164 ?? '')} ·{' '}
            <Chip tone={statusTone(String(user.role))}>{String(user.role)}</Chip>{' '}
            <Chip tone={statusTone(risk.band)}>Risk {risk.band} ({risk.score})</Chip>
          </p>
        </div>
        <div className="row">
          <ImpersonateButton userId={id} name={name} />
          {hasPermission(me?.permissions, 'users.suspend') && (
            <>
              <input
                className="field"
                style={{ width: 220, marginBottom: 0 }}
                placeholder="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button className="btn danger sm" onClick={() => suspend(!user.isSuspended)}>
                {user.isSuspended ? 'Unsuspend' : 'Suspend'}
              </button>
            </>
          )}
          {hasPermission(me?.permissions, 'users.vip') && pax && (
            <button className="btn ghost sm" onClick={() => vip(!pax.isVip, String(pax.id))}>
              {pax.isVip ? 'Remove VIP' : 'Make VIP'}
            </button>
          )}
          {hasPermission(me?.permissions, 'risk.act') && (
            <button className="btn ghost sm" onClick={watch}>
              Watchlist
            </button>
          )}
          <Link className="btn ghost sm" href={`/rides?q=${id}`}>
            View rides
          </Link>
          <Link className="btn ghost sm" href="/payments">
            View payments
          </Link>
          <Link className="btn ghost sm" href="/audit">
            Audit history
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Rides</div><div className="value">{mkt.rides}</div></div>
        <div className="kpi"><div className="label">Completed</div><div className="value">{mkt.completed}</div></div>
        <div className="kpi"><div className="label">Cancelled</div><div className="value">{mkt.cancelled}</div></div>
        <div className="kpi"><div className="label">Spend</div><div className="value">{money(mkt.spend)}</div></div>
        <div className="kpi"><div className="label">Earnings</div><div className="value">{money(mkt.earnings)}</div></div>
        <div className="kpi"><div className="label">Avg rating</div><div className="value">{mkt.avgRating ?? '—'}</div></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Identity</h3>
          <p>Registered {when(user.createdAt as string)}</p>
          <p>Phone verified {when(user.phoneVerifiedAt as string)}</p>
          <p>Account {user.isSuspended ? 'SUSPENDED' : 'ACTIVE'}</p>
          {pax && <p>VIP {String(pax.isVip)}</p>}
          {drv && (
            <p>
              KYC {String(drv.approvalStatus)} · activated {String(drv.isActivated)}
            </p>
          )}
        </div>
        <div className="panel">
          <h3>Activity</h3>
          <p>Last seen {when(last?.lastSeenAt)}</p>
          <p>IP {last?.ip ?? '—'}</p>
          <p className="muted" style={{ fontSize: 11 }}>{last?.userAgent ?? 'No device'}</p>
          <ul className="timeline">
            {sessions.slice(0, 8).map((s, i) => (
              <li key={i}>
                {when(s.lastSeenAt)} · {s.ip ?? '—'}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Financial</h3>
          {payments.slice(0, 8).map((p) => (
            <div key={p.id}>{money(Number(p.amount), p.currency)} · {p.status}</div>
          ))}
          {refunds.length > 0 && <h4>Refunds</h4>}
          {refunds.map((r) => (
            <div key={r.id}>{money(Number(r.amount))} · {r.status}</div>
          ))}
          {payments.length === 0 && <p className="muted">No payments</p>}
        </div>
        <div className="panel">
          <h3>Trust</h3>
          <p>Open cases {cases.length} · flagged chats {flagged.length} · ratings {ratings.length}</p>
          {watchlist.length > 0 && <Chip tone="warn">On watchlist</Chip>}
          {cases.slice(0, 5).map((c) => (
            <div key={c.id}>{c.title} <Chip>{c.status}</Chip></div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Timeline</h3>
        <ul className="timeline">
          {timeline.map((t, i) => (
            <li key={i}>
              <strong>{t.label}</strong>
              <div className="muted">{when(t.at)} · {t.kind}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
