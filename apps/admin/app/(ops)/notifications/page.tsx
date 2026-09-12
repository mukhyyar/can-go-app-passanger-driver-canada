'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { Chip, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';

type Delivery = {
  id: string;
  channel: string;
  title?: string | null;
  body?: string | null;
  status: string;
  createdAt: string;
  templateKey?: string | null;
};

type UserHit = {
  id: string;
  email?: string | null;
  phoneE164?: string | null;
  passengerProfile?: { fullName?: string } | null;
  driverProfile?: { fullName?: string } | null;
};

function Inner() {
  const sp = useSearchParams();
  const channel = sp.get('channel') ?? 'push';
  const [title, setTitle] = useState('CAN-RIDE update');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('PASSENGERS');
  const [userId, setUserId] = useState('');
  const [userQ, setUserQ] = useState('');
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [deepLink, setDeepLink] = useState('');
  const [guestBanner, setGuestBanner] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Delivery[]>('/admin/notifications/deliveries')
      .then((d) => setDeliveries(Array.isArray(d) ? d : []))
      .catch(() => undefined);
  }, [msg]);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ count: number }>(
        `/admin/notifications/estimate?segment=${encodeURIComponent(
          segment === 'SINGLE' ? 'SINGLE' : segment,
        )}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`,
      )
        .then((r) => setEstimate(r.count))
        .catch(() => setEstimate(null));
    }, 250);
    return () => clearTimeout(t);
  }, [segment, userId]);

  useEffect(() => {
    if (userQ.trim().length < 2) {
      setUserHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items?: UserHit[] } | UserHit[]>(
        `/admin/users?q=${encodeURIComponent(userQ)}&role=PASSENGER&pageSize=8`,
      )
        .then((d) => {
          const list = Array.isArray(d) ? d : (d.items ?? []);
          setUserHits(list.slice(0, 8));
        })
        .catch(() => setUserHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [userQ]);

  const previewImage = imageUrl.trim();

  async function send() {
    if (!title.trim() || !body.trim()) {
      setMsg('Title and body are required');
      return;
    }
    if (segment === 'SINGLE' && !userId) {
      setMsg('Pick a passenger for single send');
      return;
    }
    const countLabel = estimate != null ? estimate : '?';
    if (
      !window.confirm(
        `Send ${channel} to ~${countLabel} recipient(s)?${
          guestBanner || segment === 'GUESTS' ? ' Also publish guest banner.' : ''
        }`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ sent: number; recipients?: number }>(
        '/admin/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            channel,
            segment,
            title,
            body,
            userId: segment === 'SINGLE' ? userId : undefined,
            imageUrl: imageUrl.trim() || undefined,
            deepLink: deepLink.trim() || undefined,
            guestBanner: guestBanner || segment === 'GUESTS',
          }),
        },
      );
      setMsg(
        `Sent ${res.sent} ${channel} (audience ~${res.recipients ?? estimate ?? '—'})`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const channels = [
    { id: 'push', label: 'Push' },
    { id: 'sms', label: 'SMS' },
  ];

  const selectedUserLabel = useMemo(() => {
    const hit = userHits.find((u) => u.id === userId);
    if (!hit && userId) return userId;
    if (!hit) return '';
    return (
      hit.passengerProfile?.fullName ||
      hit.email ||
      hit.phoneE164 ||
      hit.id
    );
  }, [userHits, userId]);

  return (
    <div>
      <h1 className="page-title">Notifications</h1>
      <p className="page-sub">
        Rich push with image, single passenger targeting, guest in-app banners.
      </p>
      <div className="tabs">
        {channels.map((c) => (
          <Link
            key={c.id}
            href={`/notifications?channel=${c.id}`}
            className={channel === c.id ? 'active' : ''}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <label className="muted">Audience</label>
          <select
            className="field"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="SINGLE">Single passenger</option>
            <option value="PASSENGERS">All passengers</option>
            <option value="PASSENGERS_WITH_TOKEN">Passengers with app</option>
            <option value="DRIVERS">All drivers</option>
            <option value="VIP">VIP passengers</option>
            <option value="GUESTS">Guests (in-app banner only)</option>
          </select>

          {segment === 'SINGLE' && (
            <>
              <label className="muted">Search passenger</label>
              <input
                className="field"
                value={userQ}
                onChange={(e) => setUserQ(e.target.value)}
                placeholder="Name, email, or phone"
              />
              {userHits.length > 0 && (
                <div className="panel" style={{ padding: 8, marginBottom: 8 }}>
                  {userHits.map((u) => {
                    const label =
                      u.passengerProfile?.fullName ||
                      u.email ||
                      u.phoneE164 ||
                      u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className="btn ghost sm"
                        style={{ display: 'block', width: '100%', textAlign: 'left' }}
                        onClick={() => {
                          setUserId(u.id);
                          setUserQ(label);
                          setUserHits([]);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {userId && (
                <p className="muted" style={{ marginTop: 0 }}>
                  Selected: {selectedUserLabel}
                </p>
              )}
            </>
          )}

          <label className="muted">Title</label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="muted">Body</label>
          <textarea
            className="field"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Promo, reminder, or trip update…"
          />
          <label className="muted">Image URL (HTTPS)</label>
          <input
            className="field"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/promo.jpg"
          />
          <label className="muted">Deep link (optional)</label>
          <input
            className="field"
            value={deepLink}
            onChange={(e) => setDeepLink(e.target.value)}
            placeholder="/offers/…"
          />
          <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={guestBanner || segment === 'GUESTS'}
              disabled={segment === 'GUESTS'}
              onChange={(e) => setGuestBanner(e.target.checked)}
            />
            Also show as guest in-app banner
          </label>
          <p className="muted">
            Estimated recipients: <strong>{estimate ?? '—'}</strong>
          </p>
          <button className="btn" disabled={busy} onClick={send}>
            {busy ? 'Sending…' : `Send ${channel}`}
          </button>
          {msg && (
            <p className="muted" style={{ marginTop: 10 }}>
              {msg}
            </p>
          )}
        </div>

        <div className="panel">
          <h3>Preview</h3>
          <div
            style={{
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 16,
              overflow: 'hidden',
              maxWidth: 320,
              background: '#111',
              color: '#fff',
            }}
          >
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewImage}
                alt=""
                style={{ width: '100%', height: 140, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  height: 80,
                  background: '#2a2a2a',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#888',
                  fontSize: 12,
                }}
              >
                No image
              </div>
            )}
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{title || 'Title'}</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>{body || 'Body text…'}</div>
            </div>
          </div>
          <h3 style={{ marginTop: 20 }}>Recent deliveries</h3>
          <DataGrid
            rows={deliveries as unknown as Record<string, unknown>[]}
            persistKey="notif-deliveries"
            maxHeight={320}
            selectable={false}
            columns={[
              {
                key: 'createdAt',
                label: 'When',
                type: 'date',
                render: (r) => when(String(r.createdAt)),
              },
              { key: 'channel', label: 'Channel', type: 'enum' },
              {
                key: 'title',
                label: 'Title',
                getValue: (r) => r.title ?? r.body ?? '—',
              },
              {
                key: 'status',
                label: 'Status',
                type: 'enum',
                render: (r) => (
                  <Chip>{String(r.status)}</Chip>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Inner />
    </Suspense>
  );
}
