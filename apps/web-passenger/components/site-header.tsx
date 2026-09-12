'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BrandLogo } from './brand-logo';
import { useAuth } from './auth-provider';

const PRIMARY = [
  { href: '/destinations', label: 'Destinations' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/business', label: 'Business' },
  { href: '/support', label: 'Support' },
  { href: '/faq', label: 'FAQ' },
];

const MORE = [
  { href: '/agents', label: 'For agents' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/blog', label: 'Blog' },
];

export function SiteHeader({ onLogin }: { onLogin: () => void }) {
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const onBook = pathname?.startsWith('/book');

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand-lockup" onClick={() => setOpen(false)} aria-label="CAN-RIDE home">
          <BrandLogo size={48} variant="lockup" />
        </Link>

        <nav className={`header-nav${open ? ' open' : ''}`} aria-label="Primary">
          {PRIMARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href ? 'on' : ''}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <div className={`nav-more${more ? ' open' : ''}`}>
            <button
              type="button"
              className="nav-more-btn"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
            >
              More
            </button>
            <div className="nav-more-menu">
              {MORE.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => {
                    setMore(false);
                    setOpen(false);
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          {open && (
            <div className="header-nav-mobile-actions">
              {me ? (
                <>
                  <Link href="/rides" onClick={() => setOpen(false)}>
                    My trips
                  </Link>
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  className="btn-login"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLogin();
                  }}
                >
                  Log in or sign up
                </button>
              )}
              {!onBook && (
                <Link href="/book" className="btn-book" onClick={() => setOpen(false)}>
                  Get offers
                </Link>
              )}
            </div>
          )}
        </nav>

        <div className="header-utils">
          <span className="header-chip">CAD$</span>
          <span className="header-chip">km</span>
          <span className="header-chip">EN</span>
          {me ? (
            <>
              <Link href="/rides" className="header-trips">
                My trips
              </Link>
              <button className="btn-login" type="button" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <button className="btn-login" type="button" onClick={onLogin}>
              Log in
            </button>
          )}
          {!onBook && (
            <Link href="/book" className="btn-book">
              Get offers
            </Link>
          )}
          <button
            className="menu-toggle"
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
    </header>
  );
}
