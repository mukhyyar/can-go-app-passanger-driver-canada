'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { Chip, Drawer, statusTone, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';

type Delivery = {
  id: string;
  userId?: string | null;
  user?: {
    id: string;
    email?: string | null;
    phoneE164?: string | null;
    role?: string | null;
    passengerProfile?: { fullName?: string } | null;
    driverProfile?: { fullName?: string } | null;
  } | null;
  channel: string;
  title?: string | null;
  body?: string | null;
  provider?: string | null;
  providerMsgId?: string | null;
  status: string;
  errorCode?: string | null;
  dataJson?: Record<string, unknown> | null;
  createdAt: string;
  templateKey?: string | null;
  [key: string]: unknown;
};

type UserHit = {
  id: string;
  email?: string | null;
  phoneE164?: string | null;
  passengerProfile?: { fullName?: string } | null;
  driverProfile?: { fullName?: string } | null;
};

const CHANNEL_TABS = [
  { id: 'push', label: 'Push Notifications' },
  { id: 'sms', label: 'SMS Messaging' },
  { id: 'email', label: 'Email Broadcasts' },
  { id: 'deliveries', label: 'Delivery Logs' },
] as const;

function getUserName(u?: Delivery['user']) {
  if (!u) return null;
  if (u.passengerProfile?.fullName) return u.passengerProfile.fullName;
  if (u.driverProfile?.fullName) return u.driverProfile.fullName;
  return u.email || u.phoneE164 || u.id.slice(0, 8);
}

function NotificationsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const channelParam = sp.get('channel') ?? 'push';

  // Form states
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

  // Deliveries state
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<string>('all');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);

  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [busy, setBusy] = useState(false);

  // Load deliveries
  const loadDeliveries = useCallback(() => {
    setDeliveriesLoading(true);
    const filterQuery = deliveryFilter !== 'all' ? `?channel=${deliveryFilter}` : '';
    api<Delivery[]>(`/admin/notifications/deliveries${filterQuery}`)
      .then((d) => setDeliveries(Array.isArray(d) ? d : []))
      .catch(() => setDeliveries([]))
      .finally(() => setDeliveriesLoading(false));
  }, [deliveryFilter]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  // Recipient estimation
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

  // User search for single recipient
  useEffect(() => {
    if (userQ.trim().length < 2) {
      setUserHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items?: UserHit[] } | UserHit[]>(
        `/admin/users?q=${encodeURIComponent(userQ)}&pageSize=8`,
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

  // SMS character counter calculation
  const smsCharCount = body.length;
  const smsSegments = smsCharCount <= 160 ? 1 : Math.ceil(smsCharCount / 153);

  async function send() {
    if (channelParam !== 'sms' && !title.trim()) {
      setMsg({ text: 'Subject / Title is required', tone: 'bad' });
      return;
    }
    if (!body.trim()) {
      setMsg({ text: 'Message body text is required', tone: 'bad' });
      return;
    }
    if (segment === 'SINGLE' && !userId) {
      setMsg({ text: 'Please select a recipient user from search', tone: 'bad' });
      return;
    }
    const countLabel = estimate != null ? estimate : '?';
    if (
      !window.confirm(
        `Send ${channelParam.toUpperCase()} broadcast to ~${countLabel} recipient(s)?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ sent: number; recipients?: number }>(
        '/admin/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            channel: channelParam,
            segment,
            title: title.trim(),
            body: body.trim(),
            userId: segment === 'SINGLE' ? userId : undefined,
            imageUrl: channelParam === 'push' && imageUrl.trim() ? imageUrl.trim() : undefined,
            deepLink: channelParam === 'push' && deepLink.trim() ? deepLink.trim() : undefined,
            guestBanner: channelParam === 'push' ? (guestBanner || segment === 'GUESTS') : undefined,
          }),
        },
      );
      setMsg({
        text: `Successfully dispatched to ${res.sent} recipient(s) (target audience: ~${res.recipients ?? estimate ?? '—'})`,
        tone: 'ok',
      });
      loadDeliveries();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  const selectedUserLabel = useMemo(() => {
    const hit = userHits.find((u) => u.id === userId);
    if (!hit && userId) return userId;
    if (!hit) return '';
    return (
      hit.passengerProfile?.fullName ||
      hit.driverProfile?.fullName ||
      hit.email ||
      hit.phoneE164 ||
      hit.id
    );
  }, [userHits, userId]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Communication & Broadcasts
          </h1>
          <p className="page-sub" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Broadcast push alerts, SMS notifications, and system emails across user segments with live device previews.
          </p>
        </div>
      </div>

      {/* Main Channel Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {CHANNEL_TABS.map((c) => {
          const isActive = channelParam === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={`btn sm ${isActive ? 'active' : 'ghost'}`}
              style={
                isActive
                  ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)', fontWeight: 700 }
                  : { fontWeight: 500 }
              }
              onClick={() => router.push(`/notifications?channel=${c.id}`)}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Composer + Live Preview Section (Hidden if on deliveries log tab) */}
      {channelParam !== 'deliveries' && (
        <div className="notif-composer-grid">
          {/* Left Column: Form Panel */}
          <div className="panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {channelParam === 'push' && 'Compose Push Notification'}
                {channelParam === 'sms' && 'Compose SMS Message'}
                {channelParam === 'email' && 'Compose Email Broadcast'}
              </h2>
              <Chip tone={channelParam === 'sms' ? 'warn' : channelParam === 'email' ? 'info' : 'action'}>
                {channelParam.toUpperCase()}
              </Chip>
            </div>

            {/* Audience Segment */}
            <div style={{ marginBottom: 14 }}>
              <label className="label-xs">Target Audience</label>
              <select
                className="field"
                style={{ width: '100%' }}
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                <option value="PASSENGERS">All Passengers</option>
                {channelParam === 'push' && (
                  <option value="PASSENGERS_WITH_TOKEN">Passengers with App Installed</option>
                )}
                <option value="DRIVERS">All Drivers</option>
                <option value="VIP">VIP Passengers</option>
                {channelParam === 'push' && (
                  <option value="GUESTS">Guests (In-App Banner Only)</option>
                )}
                <option value="SINGLE">Single Specific User</option>
              </select>
            </div>

            {/* Single User Search */}
            {segment === 'SINGLE' && (
              <div style={{ marginBottom: 14, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                <label className="label-xs">Search Recipient</label>
                <input
                  className="field"
                  style={{ width: '100%', marginBottom: 6 }}
                  value={userQ}
                  onChange={(e) => setUserQ(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                />
                {userHits.length > 0 && (
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      background: '#fff',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    {userHits.map((u) => {
                      const label =
                        u.passengerProfile?.fullName ||
                        u.driverProfile?.fullName ||
                        u.email ||
                        u.phoneE164 ||
                        u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className="btn ghost sm"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: 0,
                            padding: '8px 12px',
                            borderBottom: '1px solid #f1f5f9',
                          }}
                          onClick={() => {
                            setUserId(u.id);
                            setUserQ(label);
                            setUserHits([]);
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{label}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {u.phoneE164 || u.email || ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {userId && (
                  <div style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                    Selected: {selectedUserLabel} ({userId})
                  </div>
                )}
              </div>
            )}

            {/* Title / Subject Input */}
            {channelParam !== 'sms' && (
              <div style={{ marginBottom: 14 }}>
                <label className="label-xs">
                  {channelParam === 'email' ? 'Email Subject Line' : 'Notification Title'}
                </label>
                <input
                  className="field"
                  style={{ width: '100%' }}
                  value={title}
                  placeholder={channelParam === 'email' ? 'e.g. Important update regarding your account...' : 'Title...'}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            )}

            {/* Message Body Input */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="label-xs" style={{ margin: 0 }}>
                  {channelParam === 'sms' ? 'SMS Message Content' : channelParam === 'email' ? 'Email Body' : 'Notification Body'}
                </label>
                {channelParam === 'sms' && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: smsCharCount > 160 ? '#d97706' : 'var(--muted)',
                    }}
                  >
                    {smsCharCount} / 160 chars ({smsSegments} SMS {smsSegments > 1 ? 'segments' : 'segment'})
                  </span>
                )}
              </div>
              <textarea
                className="field"
                style={{ width: '100%', minHeight: channelParam === 'email' ? 140 : 90, marginBottom: 0 }}
                rows={channelParam === 'email' ? 6 : 4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  channelParam === 'sms'
                    ? 'CAN-RIDE: Write your SMS text message here...'
                    : channelParam === 'email'
                      ? 'Write email body message...'
                      : 'Promo, alert, reminder, or ride update...'
                }
              />
            </div>

            {/* Push-Only Fields */}
            {channelParam === 'push' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label className="label-xs">Image URL (Optional HTTPS)</label>
                  <input
                    className="field"
                    style={{ width: '100%' }}
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://.../banner.jpg"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="label-xs">Deep Link Target (Optional)</label>
                  <input
                    className="field"
                    style={{ width: '100%' }}
                    value={deepLink}
                    onChange={(e) => setDeepLink(e.target.value)}
                    placeholder="/rides, /promos, /profile"
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={guestBanner || segment === 'GUESTS'}
                      disabled={segment === 'GUESTS'}
                      onChange={(e) => setGuestBanner(e.target.checked)}
                    />
                    <span>Also publish as public in-app banner for guests</span>
                  </label>
                </div>
              </>
            )}

            {/* SMS-Only Sender Notice */}
            {channelParam === 'sms' && (
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>
                <span>Sender ID: <strong>CAN-RIDE (Twilio Verified Delivery)</strong></span>
                <span style={{ marginLeft: 12 }}>Standard carrier rates apply. Plain text only.</span>
              </div>
            )}

            {/* Email-Only Sender Notice */}
            {channelParam === 'email' && (
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>
                <span>From: <strong>Can Ride &lt;no-reply@can-rides.ca&gt;</strong></span>
                <span style={{ marginLeft: 12 }}>Sent via CAN-RIDE Secure Mail Relay.</span>
              </div>
            )}

            {/* Footer & Submit Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Estimated audience: <strong style={{ color: '#111' }}>{estimate ?? '—'}</strong> recipient(s)
              </div>
              <button
                className="btn sm"
                style={{
                  background: 'var(--brand)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '8px 18px',
                }}
                disabled={busy}
                onClick={send}
              >
                {busy ? 'Sending Broadcast...' : `Send ${channelParam.toUpperCase()} Broadcast`}
              </button>
            </div>

            {msg && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: msg.tone === 'ok' ? '#f0fdf4' : '#fef2f2',
                  color: msg.tone === 'ok' ? '#166534' : '#991b1b',
                  border: `1px solid ${msg.tone === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                }}
              >
                {msg.text}
              </div>
            )}
          </div>

          {/* Right Column: Live Device Preview */}
          <div className="panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>
                Live Device Preview
              </h3>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Customer View</span>
            </div>

            {/* PUSH PREVIEW */}
            {channelParam === 'push' && (
              <div
                style={{
                  border: '1px solid #374151',
                  borderRadius: 18,
                  overflow: 'hidden',
                  background: '#111827',
                  color: '#fff',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                }}
              >
                {/* Header bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 8px' }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: 'var(--brand)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 10,
                    }}
                  >
                    CR
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>CAN-RIDE</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>now</span>
                </div>

                {/* Notification Content */}
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                    {title || 'Notification Title'}
                  </div>
                  <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.4 }}>
                    {body || 'Your notification message body text will appear here...'}
                  </div>
                </div>

                {/* Image Banner if present */}
                {previewImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImage}
                    alt=""
                    style={{ width: '100%', height: 160, objectFit: 'cover' }}
                  />
                ) : null}
              </div>
            )}

            {/* SMS PREVIEW */}
            {channelParam === 'sms' && (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 22,
                  overflow: 'hidden',
                  background: '#f8fafc',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                }}
              >
                {/* Phone Message Header */}
                <div
                  style={{
                    background: '#f1f5f9',
                    padding: '12px 16px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 12,
                      color: '#334155',
                    }}
                  >
                    CR
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>CAN-RIDE</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Verified Sender ID</div>
                  </div>
                </div>

                {/* SMS Message Bubble */}
                <div style={{ padding: 18, minHeight: 180, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                    Today {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div
                    style={{
                      alignSelf: 'flex-start',
                      maxWidth: '85%',
                      background: '#e2e8f0',
                      color: '#0f172a',
                      padding: '10px 14px',
                      borderRadius: '16px 16px 16px 4px',
                      fontSize: 13,
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {body || 'Your CAN-RIDE message text will appear here as received on the customer’s smartphone...'}
                  </div>
                  <div style={{ alignSelf: 'flex-start', fontSize: 10, color: '#94a3b8', marginTop: 4, marginLeft: 6 }}>
                    Text Message • SMS
                  </div>
                </div>
              </div>
            )}

            {/* EMAIL PREVIEW */}
            {channelParam === 'email' && (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#fff',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                }}
              >
                {/* Email Client Header */}
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    From: <strong style={{ color: '#0f172a' }}>Can Ride &lt;no-reply@can-rides.ca&gt;</strong>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                    To: <span style={{ color: '#0f172a' }}>{selectedUserLabel || 'recipient@customer.ca'}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    {title || 'Email Subject Line'}
                  </div>
                </div>

                {/* Email Body Frame */}
                <div style={{ padding: 18, minHeight: 180 }}>
                  <div
                    style={{
                      background: 'var(--brand)',
                      color: '#fff',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 14,
                      marginBottom: 14,
                    }}
                  >
                    CAN-RIDE
                  </div>
                  <div style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {body || 'Email body content will be rendered here for customer preview...'}
                  </div>
                  <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 12, fontSize: 11, color: '#9ca3af' }}>
                    © 2026 CAN-RIDE Inc. • Canada’s Modern Rideshare Platform
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-Width Recent Deliveries Log Section */}
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              Recent Notification Deliveries Log
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Inspect delivery timestamps, recipient profiles, and gateway status across push, SMS, and email.
            </p>
          </div>

          {/* Deliveries Channel Filter Pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'All Channels' },
              { id: 'push', label: 'Push (FCM)' },
              { id: 'sms', label: 'SMS (Twilio)' },
              { id: 'email', label: 'Email' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn sm ${deliveryFilter === f.id ? 'active' : 'ghost'}`}
                style={{
                  fontSize: 11,
                  fontWeight: deliveryFilter === f.id ? 700 : 500,
                  ...(deliveryFilter === f.id ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}),
                }}
                onClick={() => setDeliveryFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
            <button
              type="button"
              className="btn ghost sm"
              style={{ fontSize: 11 }}
              onClick={loadDeliveries}
            >
              Refresh
            </button>
          </div>
        </div>

        <DataGrid
          rows={deliveries as unknown as Record<string, unknown>[]}
          loading={deliveriesLoading}
          persistKey={`notif-deliveries-grid-${deliveryFilter}`}
          onRefresh={loadDeliveries}
          onRowClick={(row) => setSelectedDelivery(row as unknown as Delivery)}
          columns={[
            {
              key: 'createdAt',
              label: 'When',
              type: 'date',
              render: (r) => when(String(r.createdAt)),
            },
            {
              key: 'channel',
              label: 'Channel',
              type: 'enum',
              render: (r) => {
                const ch = String(r.channel ?? '').toLowerCase();
                const tone = ch.includes('sms') ? 'warn' : ch.includes('email') ? 'info' : 'action';
                return <Chip tone={tone}>{ch.toUpperCase()}</Chip>;
              },
            },
            {
              key: 'recipient',
              label: 'Recipient User',
              type: 'text',
              render: (r) => {
                const item = r as unknown as Delivery;
                const name = getUserName(item.user);
                if (item.userId && name) {
                  return (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/users/${item.userId}`}
                        style={{ fontWeight: 600, fontSize: 12, color: 'var(--brand)', textDecoration: 'none' }}
                      >
                        {name}
                      </Link>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                        {item.user?.phoneE164 || item.user?.email || item.userId.slice(0, 8)}
                      </div>
                    </div>
                  );
                }
                return <span style={{ fontSize: 12, color: 'var(--muted)' }}>Broadcast / Multiple</span>;
              },
            },
            {
              key: 'title',
              label: 'Title / Message',
              type: 'text',
              render: (r) => {
                const item = r as unknown as Delivery;
                return (
                  <div style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{item.title || item.templateKey || '—'}</span>
                    {item.body && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                        {item.body}
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: 'provider',
              label: 'Provider',
              type: 'text',
              render: (r) => (
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4b5563' }}>
                  {String(r.provider || (String(r.channel).includes('sms') ? 'twilio' : 'fcm'))}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              type: 'enum',
              render: (r) => {
                const s = String(r.status ?? '').toLowerCase();
                const tone = s === 'sent' || s === 'delivered' ? 'ok' : s === 'failed' ? 'bad' : 'warn';
                return <Chip tone={tone}>{String(r.status)}</Chip>;
              },
            },
            {
              key: 'actions',
              label: 'Actions',
              type: 'text',
              render: (r) => {
                const item = r as unknown as Delivery;
                return (
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDelivery(item);
                    }}
                  >
                    Inspect
                  </button>
                );
              },
            },
          ]}
        />
      </div>

      {/* Delivery Detail Drawer */}
      {selectedDelivery && (
        <Drawer
          title={`Delivery Log · #${selectedDelivery.id.slice(-6).toUpperCase()}`}
          onClose={() => setSelectedDelivery(null)}
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status Strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
              <div>
                <Chip tone={statusTone(selectedDelivery.status)} style={{ fontWeight: 700, fontSize: 12 }}>
                  {selectedDelivery.status.toUpperCase()}
                </Chip>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                  {when(selectedDelivery.createdAt)}
                </span>
              </div>
              <Chip tone="default">Channel: {selectedDelivery.channel.toUpperCase()}</Chip>
            </div>

            {/* Recipient Card */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                Recipient Information
              </div>
              {selectedDelivery.user ? (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {getUserName(selectedDelivery.user)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Role: {selectedDelivery.user.role || 'User'}
                  </div>
                  {selectedDelivery.user.email && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                      Email: {selectedDelivery.user.email}
                    </div>
                  )}
                  {selectedDelivery.user.phoneE164 && (
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                      Phone: {selectedDelivery.user.phoneE164}
                    </div>
                  )}
                  {selectedDelivery.userId && (
                    <div style={{ marginTop: 8 }}>
                      <Link
                        href={`/users/${selectedDelivery.userId}`}
                        style={{ fontSize: 11, color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Open User 360 Profile →
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Broadcast message to segment or device token.
                </div>
              )}
            </div>

            {/* Message Details */}
            <div style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Message Content
              </div>
              {selectedDelivery.title && (
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  Title: {selectedDelivery.title}
                </div>
              )}
              <div style={{ fontSize: 13, color: '#1f2937', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {selectedDelivery.body || '(No message body text recorded)'}
              </div>
            </div>

            {/* Technical Provider Diagnostics */}
            <div style={{ background: '#fafafa', padding: 14, borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Gateway Diagnostics
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Provider:</span>{' '}
                  <strong>{selectedDelivery.provider || 'FCM'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Template Key:</span>{' '}
                  <strong>{selectedDelivery.templateKey || '—'}</strong>
                </div>
                {selectedDelivery.providerMsgId && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--muted)' }}>Provider Message ID:</span>{' '}
                    <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{selectedDelivery.providerMsgId}</code>
                  </div>
                )}
                {selectedDelivery.errorCode && (
                  <div style={{ gridColumn: 'span 2', color: '#dc2626' }}>
                    <span style={{ fontWeight: 700 }}>Error Code:</span>{' '}
                    <code style={{ wordBreak: 'break-all' }}>{selectedDelivery.errorCode}</code>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading communication workspace...</p>}>
      <NotificationsInner />
    </Suspense>
  );
}
