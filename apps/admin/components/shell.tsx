'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isNavActive, NAV } from '../lib/nav';
import { CommandPalette } from './palette';
import { DriverNotices } from './notices';
import { BrandLogo } from './brand-logo';

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, logout, ready, token } = useAuth();
  const path = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [hash, setHash] = useState('');

  useEffect(() => {
    if (!ready) return;
    if (!token) router.replace('/login');
  }, [ready, token, router]);

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [path, searchParams]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready || !token) {
    return <p className="muted" style={{ padding: 24 }}>Loading ops…</p>;
  }

  const perms = me?.permissions ?? [];

  return (
    <div className="app-shell">
      {navOpen && <button className="nav-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <BrandLogo size={36} />
          {!collapsed && (
            <div>
              <h1>CAN-RIDE</h1>
              <span>Admin Ops</span>
            </div>
          )}
        </div>
        {NAV.map((g) => {
          const items = g.items.filter(
            (i) => !i.permission || hasPermission(perms, i.permission),
          );
          if (!items.length) return null;
          return (
            <div className="nav-group" key={g.id}>
              {!collapsed && <h3>{g.label}</h3>}
              {items.map((i) => {
                const active = isNavActive(i.href, path, searchParams, hash);
                return (
                  <Link
                    key={g.id + i.href + i.label}
                    href={i.href}
                    className={`nav-item ${active ? 'active' : ''}`}
                    onClick={() => setNavOpen(false)}
                  >
                    {collapsed ? i.label.slice(0, 1) : i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="btn ghost sm"
            onClick={() => {
              if (window.matchMedia('(max-width: 980px)').matches) setNavOpen((o) => !o);
              else setCollapsed((c) => !c);
            }}
          >
            ☰
          </button>
          <button className="search-btn" onClick={() => setPalette(true)}>
            Search users, rides, plates, promos… ⌘K
          </button>
          <DriverNotices />
          <div className="user-chip">
            <b>{me?.adminRole?.name || me?.role}</b>
            <span>{me?.email}</span>
          </div>
          <button className="btn ghost sm" onClick={logout}>
            Sign out
          </button>
        </header>
        <div className="content">{children}</div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
