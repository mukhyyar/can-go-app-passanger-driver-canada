'use client';

import { useEffect, useState } from 'react';
import { fetchCmsPage, type CmsPage } from '../lib/cms';
import { InfoPage } from './info-page';
import { Markdown } from './markdown';

export function CmsPageView({
  slug,
  fallbackTitle,
  fallbackBody,
  kicker,
}: {
  slug: string;
  fallbackTitle: string;
  fallbackBody: string;
  kicker?: string;
}) {
  const [page, setPage] = useState<CmsPage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'fallback'>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchCmsPage(slug)
      .then((p) => {
        if (!alive) return;
        setPage(p);
        setStatus('ok');
      })
      .catch(() => {
        if (!alive) return;
        setPage(null);
        setStatus('fallback');
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const title = page?.title ?? fallbackTitle;
  const body = page?.bodyMd ?? fallbackBody;

  return (
    <InfoPage title={title} kicker={kicker} updatedAt={page?.updatedAt}>
      {status === 'loading' ? (
        <p className="muted">Loading…</p>
      ) : (
        <Markdown source={body} />
      )}
    </InfoPage>
  );
}
