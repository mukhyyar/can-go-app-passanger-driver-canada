'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { InfoPage } from '../../components/info-page';
import { Markdown } from '../../components/markdown';
import { fetchCmsPage, fetchCmsPages, type CmsPage } from '../../lib/cms';

function excerpt(md: string, n = 180) {
  const text = md
    .replace(/[#*_]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

export default function Page() {
  const [intro, setIntro] = useState<CmsPage | null>(null);
  const [posts, setPosts] = useState<CmsPage[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchCmsPage('blog').catch(() => null),
      fetchCmsPages('app').catch(() => [] as CmsPage[]),
    ]).then(([page, apps]) => {
      if (!alive) return;
      setIntro(page);
      setPosts(
        apps.filter(
          (p) => p.category === 'blog' || p.slug.startsWith('blog-'),
        ),
      );
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <InfoPage
      title={intro?.title ?? 'From the road'}
      kicker="Blog"
      updatedAt={intro?.updatedAt}
    >
      {intro?.bodyMd ? <Markdown source={intro.bodyMd} /> : (
        <p>Guides on tender-based transfers, airports, and hospitality on CAN-GO.</p>
      )}
      {!ready ? (
        <p className="muted">Loading articles…</p>
      ) : posts.length === 0 ? (
        <p className="muted">Articles will appear here as they publish from Admin → Content.</p>
      ) : (
        <div className="blog-list">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="blog-card">
              <h2>{p.title}</h2>
              <p>{excerpt(p.bodyMd)}</p>
              <span>Read article</span>
            </Link>
          ))}
        </div>
      )}
    </InfoPage>
  );
}
