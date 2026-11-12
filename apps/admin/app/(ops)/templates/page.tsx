'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { Chip, Drawer, statusTone, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';

export type Template = {
  id?: string;
  key: string;
  channel: string;
  title: string;
  body: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const COMMON_VARS = [
  { tag: '{{userName}}', label: 'User Name', sample: 'Alex Mercer' },
  { tag: '{{driverName}}', label: 'Driver Name', sample: 'Michael Chen' },
  { tag: '{{rideCode}}', label: 'Ride Code', sample: 'CG-RIDE-18XF' },
  { tag: '{{pickupAddress}}', label: 'Pickup', sample: '100 King St W, Toronto' },
  { tag: '{{dropoffAddress}}', label: 'Dropoff', sample: 'Pearson Terminal 1' },
  { tag: '{{fare}}', label: 'Fare', sample: 'CA$34.50' },
  { tag: '{{otp}}', label: 'OTP Code', sample: '492815' },
  { tag: '{{vehiclePlate}}', label: 'Plate', sample: 'ONT-8392' },
];

function channelTone(ch: string): 'info' | 'warn' | 'action' | 'default' {
  const c = ch.toLowerCase();
  if (c === 'push' || c === 'fcm') return 'info';
  if (c === 'sms' || c === 'twilio') return 'warn';
  if (c === 'email' || c === 'smtp') return 'action';
  return 'default';
}

function renderSampleText(text: string): string {
  let res = text;
  for (const v of COMMON_VARS) {
    res = res.replaceAll(v.tag, v.sample);
  }
  return res;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'push' | 'sms' | 'email'>('all');
  const [search, setSearch] = useState('');
  
  // Drawer states
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [channelInput, setChannelInput] = useState('push');
  const [titleInput, setTitleInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [activeInput, setActiveInput] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Template[]>('/admin/notifications/templates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load templates', err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openDrawer = (tpl?: Template) => {
    setFeedback(null);
    if (tpl) {
      setEditingTemplate(tpl);
      setIsNew(false);
      setKeyInput(tpl.key);
      setChannelInput(tpl.channel);
      setTitleInput(tpl.title);
      setBodyInput(tpl.body);
      setActiveInput(tpl.active ?? true);
    } else {
      setEditingTemplate({
        key: '',
        channel: channelFilter === 'all' ? 'push' : channelFilter,
        title: '',
        body: '',
        active: true,
      });
      setIsNew(true);
      setKeyInput('');
      setChannelInput(channelFilter === 'all' ? 'push' : channelFilter);
      setTitleInput('');
      setBodyInput('');
      setActiveInput(true);
    }
  };

  const closeDrawer = () => {
    setEditingTemplate(null);
    setFeedback(null);
  };

  const insertVariable = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBodyInput((prev) => prev + tag);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = bodyInput.substring(0, start) + tag + bodyInput.substring(end);
    setBodyInput(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setFeedback({ text: 'Template key is required.', tone: 'bad' });
      return;
    }
    if (!titleInput.trim()) {
      setFeedback({ text: 'Template title/subject is required.', tone: 'bad' });
      return;
    }
    if (!bodyInput.trim()) {
      setFeedback({ text: 'Template message body is required.', tone: 'bad' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await api('/admin/notifications/templates', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingTemplate?.id,
          key: keyInput.trim().toLowerCase(),
          channel: channelInput,
          title: titleInput.trim(),
          body: bodyInput.trim(),
          active: activeInput,
        }),
      });
      setFeedback({ text: 'Template saved successfully!', tone: 'ok' });
      loadTemplates();
      setTimeout(() => {
        closeDrawer();
      }, 900);
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Failed to save template',
        tone: 'bad',
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (channelFilter !== 'all' && t.channel.toLowerCase() !== channelFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchKey = t.key.toLowerCase().includes(q);
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchBody = t.body.toLowerCase().includes(q);
        return matchKey || matchTitle || matchBody;
      }
      return true;
    });
  }, [templates, channelFilter, search]);

  const smsCharCount = bodyInput.length;
  const smsSegments = Math.max(1, Math.ceil(smsCharCount / 160));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Notification Templates
          </h1>
          <p className="page-sub" style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Manage automated transactional messages, OTP formats, trip alerts, and email notifications.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => openDrawer()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>＋</span> New Template
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {(
          [
            { id: 'all', label: `All Channels (${templates.length})` },
            { id: 'push', label: `Push (${templates.filter((t) => t.channel.toLowerCase() === 'push').length})` },
            { id: 'sms', label: `SMS (${templates.filter((t) => t.channel.toLowerCase() === 'sms').length})` },
            { id: 'email', label: `Email (${templates.filter((t) => t.channel.toLowerCase() === 'email').length})` },
          ] as const
        ).map((tab) => {
          const isActive = channelFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`btn sm ${isActive ? 'active' : 'ghost'}`}
              style={
                isActive
                  ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)', fontWeight: 700 }
                  : { fontWeight: 500 }
              }
              onClick={() => setChannelFilter(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Templates DataGrid */}
      <DataGrid
        persistKey="admin_templates"
        rows={filteredTemplates as unknown as Record<string, unknown>[]}
        loading={loading}
        onRefresh={loadTemplates}
        emptyText="No notification templates found"
        onRowClick={(row) => openDrawer(row as unknown as Template)}
        columns={[
          {
            key: 'key',
            label: 'Key',
            render: (r) => (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--brand)',
                  letterSpacing: '0.02em',
                }}
              >
                {String(r.key ?? '—')}
              </span>
            ),
          },
          {
            key: 'channel',
            label: 'Channel',
            render: (r) => {
              const ch = String(r.channel ?? '').toUpperCase();
              return <Chip tone={channelTone(ch)}>{ch}</Chip>;
            },
          },
          {
            key: 'title',
            label: 'Title / Subject',
            render: (r) => (
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {String(r.title ?? '—')}
              </span>
            ),
          },
          {
            key: 'body',
            label: 'Body Preview',
            render: (r) => {
              const text = String(r.body ?? '');
              return (
                <span
                  title={text}
                  style={{
                    display: 'block',
                    maxWidth: 360,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}
                >
                  {text || '—'}
                </span>
              );
            },
          },
          {
            key: 'active',
            label: 'Status',
            render: (r) => (
              <Chip tone={r.active ? 'ok' : 'default'}>{r.active ? 'ACTIVE' : 'INACTIVE'}</Chip>
            ),
          },
          {
            key: 'updatedAt',
            label: 'Updated',
            render: (r) => (
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {when(typeof r.updatedAt === 'string' ? r.updatedAt : undefined)}
              </span>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (r) => {
              const tpl = r as unknown as Template;
              return (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDrawer(tpl);
                  }}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Edit
                </button>
              );
            },
          },
        ]}
      />

      {/* Template Edit / Create Drawer */}
      {editingTemplate && (
        <Drawer
          title={isNew ? 'Create New Template' : `Edit Template: ${editingTemplate.key}`}
          onClose={closeDrawer}
        >
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {feedback && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: feedback.tone === 'ok' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: feedback.tone === 'ok' ? '#059669' : '#dc2626',
                  border: `1px solid ${feedback.tone === 'ok' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                {feedback.text}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Template Key (Slug) <span style={{ color: 'var(--brand)' }}>*</span>
              </label>
              <input
                type="text"
                className="input"
                disabled={!isNew}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_'))}
                placeholder="e.g. ride_delayed_notice, otp_verification"
                required
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  backgroundColor: !isNew ? 'var(--bg-subtle, #f8f9fa)' : undefined,
                }}
              />
              {!isNew ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Template keys are permanent system identifiers used in backend notification triggers.
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Use lowercase alphanumeric characters and underscores (e.g., <code>driver_arrival_alert</code>).
                </div>
              )}
            </div>

            <div className="template-form-row">
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Delivery Channel
                </label>
                <select
                  className="input"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="push">Push (Mobile FCM)</option>
                  <option value="sms">SMS (Twilio)</option>
                  <option value="email">Email (SMTP)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Trigger Status
                </label>
                <div style={{ display: 'flex', alignItems: 'center', height: 38 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={activeInput}
                      onChange={(e) => setActiveInput(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--brand)' }}
                    />
                    <span>Active & Enabled</span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {channelInput === 'email' ? 'Email Subject' : 'Message Title'} <span style={{ color: 'var(--brand)' }}>*</span>
              </label>
              <input
                type="text"
                className="input"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder={channelInput === 'email' ? 'e.g. Your CAN-RIDE Trip Receipt' : 'e.g. Driver is Arriving'}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>
                  Message Body <span style={{ color: 'var(--brand)' }}>*</span>
                </label>
                {channelInput === 'sms' && (
                  <span style={{ fontSize: 11, color: smsCharCount > 160 ? '#b45309' : 'var(--muted)', fontWeight: 600 }}>
                    {smsCharCount} chars • {smsSegments} SMS segment{smsSegments > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Dynamic Tag Injector Pills */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>
                  Insert dynamic placeholders:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {COMMON_VARS.map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => insertVariable(v.tag)}
                      title={`Insert ${v.label} placeholder (${v.tag})`}
                      className="btn sm ghost"
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        height: 24,
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: '#f8f9fa',
                        cursor: 'pointer',
                      }}
                    >
                      + {v.tag}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                className="input"
                rows={5}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                placeholder="Write your template copy here... Use dynamic placeholders like {{userName}} or {{fare}}."
                required
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            {/* Live Template Preview */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--muted)' }}>
                Live Rendered Preview (Sample Values)
              </div>

              {channelInput === 'push' && (
                <div
                  style={{
                    background: '#111827',
                    color: '#fff',
                    borderRadius: 12,
                    padding: 14,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        background: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 900,
                        color: '#fff',
                      }}
                    >
                      🍁
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      CAN-RIDE • Now
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                    {renderSampleText(titleInput || 'Notification Title')}
                  </div>
                  <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {renderSampleText(bodyInput || 'Notification message text...')}
                  </div>
                </div>
              )}

              {channelInput === 'sms' && (
                <div
                  style={{
                    background: '#f3f4f6',
                    borderRadius: 12,
                    padding: 14,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 10 }}>
                    SMS with CAN-RIDE
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '85%',
                        background: '#e5e7eb',
                        color: '#1f2937',
                        padding: '10px 14px',
                        borderRadius: '16px 16px 16px 2px',
                        fontSize: 13,
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {titleInput && (
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {renderSampleText(titleInput)}
                        </div>
                      )}
                      <div>{renderSampleText(bodyInput || 'SMS message copy...')}</div>
                    </div>
                  </div>
                </div>
              )}

              {channelInput === 'email' && (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 11,
                      color: '#64748b',
                    }}
                  >
                    <div>
                      <strong>From:</strong> CAN-RIDE Ops &lt;no-reply@can-rides.ca&gt;
                    </div>
                    <div>
                      <strong>Subject:</strong> {renderSampleText(titleInput || 'Subject Line')}
                    </div>
                  </div>
                  <div style={{ padding: 14, fontSize: 13, color: '#1e293b', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>🍁</span>
                      <strong style={{ color: '#dc2626' }}>CAN-RIDE</strong>
                    </div>
                    {renderSampleText(bodyInput || 'Email message body text...')}
                    <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
                      CAN-RIDE Inc. • 100 King St W, Toronto ON • canada@can-rides.ca
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={closeDrawer} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </div>
  );
}
