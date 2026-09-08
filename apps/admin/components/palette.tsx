'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chip } from './ui';

type SearchResult = {
  users: Array<{ id: string; label?: string; email?: string; role?: string }>;
  rides: Array<{ id: string; publicCode?: string; status?: string; fromLabel?: string }>;
  payments: Array<{ id: string; status?: string; amount?: number; rideId?: string }>;
  vehicles: Array<{ id: string; plate?: string; driver?: { userId?: string } }>;
  promos: Array<{ id: string; code?: string }>;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { me } = useAuth();
  const perms = me?.permissions ?? [];
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setData(null);
    setActive(0);
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setData(null);
      return;
    }
    const t = setTimeout(() => {
      api<SearchResult>(`/admin/search?q=${encodeURIComponent(q)}`)
        .then(setData)
        .catch(() => setData(null));
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const items = useMemo(() => {
    const out: Array<{ href: string; title: string; sub: string }> = [];
    const ql = q.toLowerCase();
    const cmds: Array<{ href: string; title: string; perm: string; keys: string[] }> = [
      { href: '/users', title: 'Login as user…', perm: 'users.impersonate', keys: ['login', 'impersonate'] },
      { href: '/refunds', title: 'Issue refund…', perm: 'payments.refund', keys: ['refund'] },
      { href: '/suspended', title: 'Suspend account…', perm: 'users.suspend', keys: ['suspend'] },
    ];
    for (const c of cmds) {
      if (!hasPermission(perms, c.perm)) continue;
      if (!ql || c.keys.some((k) => ql.includes(k)) || c.title.toLowerCase().includes(ql)) {
        out.push({ href: c.href, title: c.title, sub: 'Command' });
      }
    }
    for (const u of data?.users ?? []) {
      out.push({
        href: `/users/${u.id}`,
        title: u.label || u.email || u.id,
        sub: `User · ${u.role ?? ''}`,
      });
    }
    for (const r of data?.rides ?? []) {
      out.push({
        href: `/rides/${r.id}`,
        title: r.publicCode || r.id,
        sub: `Ride · ${r.status} · ${r.fromLabel ?? ''}`,
      });
    }
    for (const p of data?.payments ?? []) {
      out.push({
        href: `/payments?q=${p.id}`,
        title: p.id,
        sub: `Payment · ${p.status}`,
      });
    }
    for (const v of data?.vehicles ?? []) {
      out.push({
        href: v.driver?.userId ? `/users/${v.driver.userId}` : '/vehicles',
        title: v.plate || v.id,
        sub: 'Vehicle',
      });
    }
    for (const p of data?.promos ?? []) {
      out.push({ href: '/promos', title: p.code || p.id, sub: 'Promo' });
    }
    return out;
  }, [data, q, perms]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && items[active]) {
        router.push(items[active].href);
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose, router]);

  if (!open) return null;

  return (
    <div className="palette" onClick={onClose}>
      <div className="palette-box" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search users, rides, payments, plates, promos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="palette-res">
          {items.length === 0 && q.length >= 2 && (
            <p className="muted" style={{ padding: 12 }}>
              No matches
            </p>
          )}
          {items.length === 0 && q.length < 2 && (
            <p className="muted" style={{ padding: 12 }}>
              Type a name, email, ride id, plate… or a command
            </p>
          )}
          {items.map((it, i) => (
            <button
              key={it.href + it.title + i}
              className={i === active ? 'active' : ''}
              onClick={() => {
                router.push(it.href);
                onClose();
              }}
            >
              <strong>{it.title}</strong>
              <div className="muted">{it.sub}</div>
            </button>
          ))}
        </div>
        <div className="muted" style={{ padding: 8, fontSize: 11 }}>
          <Chip>Ctrl/Cmd+K</Chip> · Enter to open
        </div>
      </div>
    </div>
  );
}
