'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { InfoPage } from '../../components/info-page';
import { Markdown } from '../../components/markdown';
import { fetchCmsPage, fetchCmsPages, type CmsPage } from '../../lib/cms';

const FALLBACK: CmsPage[] = [
  {
    slug: 'faq-how-it-works',
    title: 'How does CAN-RIDE work?',
    category: 'Booking',
    bodyMd:
      'Create a ride request, receive offers from drivers, compare, and pay only the offer you select.',
  },
  {
    slug: 'faq-when-pay',
    title: 'When do I pay?',
    category: 'Payments',
    bodyMd: 'You pay only after selecting an offer. No charge while waiting for bids.',
  },
  {
    slug: 'faq-price-match',
    title: 'What is price match?',
    category: 'Payments',
    bodyMd:
      'If you find a similar offer cheaper elsewhere, claim the difference after the trip, subject to the Service Agreement.',
  },
];

export default function Page() {
  const [intro, setIntro] = useState<CmsPage | null>(null);
  const [items, setItems] = useState<CmsPage[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchCmsPage('faq').catch(() => null),
      fetchCmsPages('faq').catch(() => [] as CmsPage[]),
    ]).then(([page, faqs]) => {
      if (!alive) return;
      setIntro(page);
      setItems(faqs.length ? faqs : FALLBACK);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, CmsPage[]>();
    for (const item of items) {
      const key = item.category?.trim() || 'General';
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <InfoPage
      title={intro?.title ?? 'Frequently asked questions'}
      kicker="FAQ"
      updatedAt={intro?.updatedAt}
    >
      {intro?.bodyMd ? <Markdown source={intro.bodyMd} /> : (
        <p>
          Answers about bookings, payments, and trips. Need a person?{' '}
          <Link href="/support">Contact support</Link>.
        </p>
      )}
      {!ready ? (
        <p className="muted">Loading questions…</p>
      ) : (
        groups.map(([cat, rows]) => (
          <section key={cat} className="faq-group">
            <h2 className="faq-cat">{cat}</h2>
            {rows.map((row) => {
              const expanded = open === row.slug;
              return (
                <div key={row.slug} className={`faq-item${expanded ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : row.slug)}
                  >
                    {row.title}
                    <span aria-hidden>{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded ? (
                    <div className="faq-a">
                      <Markdown source={row.bodyMd} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))
      )}
      <p className="info-cta">
        Still stuck? <Link href="/support">Write to support</Link> with your ride code.
      </p>
    </InfoPage>
  );
}
