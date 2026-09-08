'use client';

import { useState, type ReactNode } from 'react';
import { AuthModal } from './auth-modal';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function InfoPage({
  title,
  kicker,
  updatedAt,
  children,
}: {
  title: string;
  kicker?: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  const [authOpen, setAuthOpen] = useState(false);
  const updated =
    updatedAt && !Number.isNaN(new Date(updatedAt).getTime())
      ? new Date(updatedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;
  return (
    <div className="page-wrap">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <article className="info-page">
        {kicker ? <p className="info-kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {updated ? <p className="info-updated">Updated {updated}</p> : null}
        {children}
      </article>
      <SiteFooter />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
