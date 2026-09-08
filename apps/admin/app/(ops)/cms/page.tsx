'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { Chip } from '../../../components/ui';

type CmsRow = {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  kind: string;
  category?: string | null;
  published: boolean;
  sortOrder: number;
  updatedAt?: string;
};

const KINDS = [
  { id: '', label: 'All pages' },
  { id: 'page', label: 'Site pages' },
  { id: 'faq', label: 'FAQs' },
  { id: 'legal', label: 'Legal' },
  { id: 'app', label: 'Blog / app' },
];

function empty(kind: string): CmsRow {
  return {
    id: '',
    slug: '',
    title: '',
    bodyMd: '',
    kind: kind || 'page',
    category: kind === 'faq' ? 'Booking' : kind === 'app' ? 'blog' : '',
    published: true,
    sortOrder: 0,
  };
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function Inner() {
  const sp = useSearchParams();
  const kind = sp.get('kind') ?? '';
  const [pages, setPages] = useState<CmsRow[]>([]);
  const [form, setForm] = useState<CmsRow>(empty(kind));
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const title = useMemo(() => {
    if (kind === 'faq') return 'FAQs';
    if (kind === 'legal') return 'Legal pages';
    if (kind === 'app') return 'Blog / app content';
    return 'CMS pages';
  }, [kind]);

  const load = useCallback(() => {
    setLoading(true);
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    api<CmsRow[]>(`/admin/cms/pages${q}`)
      .then((rows) => {
        setPages(rows);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [kind]);

  useEffect(() => {
    load();
    setForm(empty(kind));
  }, [kind, load]);

  function select(p: CmsRow) {
    setForm({ ...p, category: p.category ?? '' });
    setOk(null);
    setPreview(false);
  }

  async function save() {
    setErr(null);
    setOk(null);
    let slug = form.slug.trim() || slugify(form.title);
    if (form.kind === 'faq' && slug && !slug.startsWith('faq-')) slug = `faq-${slug}`;
    if (!slug || !form.title.trim() || !form.bodyMd.trim()) {
      setErr('Slug, title, and body are required.');
      return;
    }
    try {
      await api('/admin/cms/pages', {
        method: 'PUT',
        body: JSON.stringify({
          slug,
          title: form.title.trim(),
          bodyMd: form.bodyMd,
          published: form.published,
          kind: form.kind,
          category: form.category || null,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      setOk(`Saved /${slug}. Live on passenger web within a refresh.`);
      load();
      setForm((f) => ({ ...f, slug }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!form.slug) return;
    if (!window.confirm(`Delete /${form.slug}? This removes it from the public site.`)) return;
    try {
      await api(`/admin/cms/pages/${form.slug}`, { method: 'DELETE' });
      setOk(`Deleted /${form.slug}`);
      setForm(empty(kind));
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">
        Passenger Support, FAQ, More, legal, and blog copy. Saved pages go live on
        http://127.0.0.1:3002 immediately.
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        {KINDS.map((k) => (
          <a
            key={k.id || 'all'}
            className={`btn sm ${kind === k.id ? '' : 'ghost'}`}
            href={k.id ? `/cms?kind=${k.id}` : '/cms'}
          >
            {k.label}
          </a>
        ))}
      </div>
      {err ? <p className="err">{err}</p> : null}
      {ok ? <p className="muted">{ok}</p> : null}
      <div className="grid-2">
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{loading ? 'Loading…' : `${pages.length} entries`}</strong>
            <button className="btn ghost sm" onClick={() => setForm(empty(kind))}>
              New
            </button>
          </div>
          {pages.map((p) => (
            <button
              key={p.id}
              className="btn ghost"
              style={{
                width: '100%',
                marginBottom: 6,
                textAlign: 'left',
                borderColor: form.slug === p.slug ? 'var(--brand)' : undefined,
              }}
              onClick={() => select(p)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {p.slug} — {p.title}
                </span>
                <Chip tone={p.published ? 'ok' : 'warn'}>{p.published ? 'live' : 'draft'}</Chip>
              </div>
            </button>
          ))}
        </div>
        <div className="panel">
          <label className="muted">Kind</label>
          <select
            className="field"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            <option value="page">Site page (Support, More, destinations…)</option>
            <option value="faq">FAQ question</option>
            <option value="legal">Legal</option>
            <option value="app">Blog / app</option>
          </select>
          <label className="muted">Slug (URL)</label>
          <input
            className="field"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="support"
          />
          <label className="muted">{form.kind === 'faq' ? 'Question' : 'Title'}</label>
          <input
            className="field"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={form.kind === 'faq' ? 'When do I pay?' : 'Page title'}
          />
          <div className="row">
            <div style={{ flex: 1 }}>
              <label className="muted">Category</label>
              <input
                className="field"
                value={form.category ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={form.kind === 'faq' ? 'Booking / Payments' : 'blog'}
              />
            </div>
            <div style={{ width: 100 }}>
              <label className="muted">Order</label>
              <input
                className="field"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
          </div>
          <label className="row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
            />
            Published (visible on passenger web and app)
          </label>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" type="button" onClick={() => setPreview((v) => !v)}>
              {preview ? 'Edit markdown' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <pre className="cms-preview">{form.bodyMd}</pre>
          ) : (
            <textarea
              className="field"
              rows={16}
              value={form.bodyMd}
              onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
              placeholder="Markdown: ## Heading, **bold**, [link](https://…)"
            />
          )}
          <div className="row">
            <button className="btn" onClick={save}>
              Save page
            </button>
            {form.slug ? (
              <button className="btn ghost" onClick={remove}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CmsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
