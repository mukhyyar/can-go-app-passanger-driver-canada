'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  ANALYTICS_TABS,
  RANGE_OPTIONS,
  formatMetric,
  formatMoney,
  qsFromParams,
  sectionPath,
  type AnalyticsTab,
  type KpiCard,
} from '../../lib/analytics';
import {
  AreaChart,
  BarChart,
  Donut,
  FunnelBars,
  HeatmapGrid,
  LineBand,
  Sparkline,
  StackedBar,
  Waterfall,
} from '../charts';
import { Chip, Empty, Modal, statusTone, when } from '../ui';
import { AnalyticsMap } from '../analytics-map';

type Meta = {
  serviceTypes: string[];
  vehicleClasses: string[];
  paymentMethods: string[];
  promos: string[];
  cities: string[];
  zones: string[];
  rideStatuses: string[];
  driverStatuses: string[];
  passengerSegments: string[];
};

type Overview = {
  demo?: boolean;
  empty?: boolean;
  emptyMessage?: string | null;
  currency?: string;
  lastUpdated?: string;
  range?: { label: string; compareLabel: string };
  kpis?: { business: KpiCard[]; growth: KpiCard[]; operations: KpiCard[] };
  trend?: Array<{ date: string; rides: number; gmv: number; net: number; completed: number }>;
  funnel?: { steps: Array<{ key: string; label: string; value: number }>; edges: Array<{ from: string; to: string; conversionPct: number; dropoffPct: number }> };
  insights?: Array<{ severity: string; text: string }>;
  live?: Record<string, number | boolean>;
};

type SavedView = { id: string; name: string; kind: string; query: Record<string, string> };

const COLORS = ['#e50000', '#2ea44f', '#1d4ed8', '#f59e0b', '#7c3aed', '#111'];

export function AnalyticsWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { me } = useAuth();
  const perms = me?.permissions ?? [];
  const tab = (params.get('tab') || 'overview') as AnalyticsTab;
  const qs = qsFromParams(params);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [live, setLive] = useState<Record<string, number | boolean> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<SavedView[]>([]);
  const [drill, setDrill] = useState<{ metric: string; title: string } | null>(null);
  const [more, setMore] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${path}?${next.toString()}`);
    },
    [params, path, router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const endpoint = tab === 'reports' ? '/admin/analytics/overview' : sectionPath(tab);
      const d = await api<Record<string, unknown>>(`${endpoint}?${qs}`);
      setData(d);
      if (tab === 'overview' && d.live) setLive(d.live as Record<string, number | boolean>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [qs, tab]);

  useEffect(() => {
    api<Meta>('/admin/analytics/meta').then(setMeta).catch(() => undefined);
    api<SavedView[]>('/admin/analytics/views').then(setViews).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      api<{ live: Record<string, number | boolean> }>(`/admin/analytics/live?${qs}`)
        .then((d) => setLive(d.live))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [qs]);

  const tabs = ANALYTICS_TABS.filter(
    (t) =>
      !t.permission ||
      hasPermission(perms, t.permission) ||
      (t.permission === 'analytics.financial' && hasPermission(perms, 'finance.view')) ||
      (t.permission === 'analytics.safety' && hasPermission(perms, 'risk.view')),
  );

  const currency = String((data as Overview | null)?.currency ?? 'USD');
  const demo = Boolean((data as Overview | null)?.demo);
  const empty = Boolean((data as Overview | null)?.empty);
  const rangeLabel = String((data as Overview | null)?.range?.compareLabel ?? (data as Overview | null)?.range?.label ?? '');

  return (
    <div className="analytics-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Analytics &amp; BI Center</h1>
          <p className="page-sub">CAN-RIDE marketplace intelligence · timezone-safe · aggregated on the server</p>
        </div>
        <div className="row">
          {demo && <Chip tone="warn">Demo Data</Chip>}
          <span className="muted">Last updated {data?.lastUpdated ? when(String(data.lastUpdated)) : '—'}</span>
          <button className="btn ghost sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="analytics-filters">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{rangeLabel || 'Select a period'}</strong>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setMore((v) => !v)}>
              {more ? 'Hide filters' : 'All filters'}
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                router.replace('/analytics?tab=overview&range=7d&compare=period');
              }}
            >
              Reset
            </button>
            <button className="btn ghost sm" onClick={() => setSaveOpen(true)}>
              Save view
            </button>
            {hasPermission(perms, 'analytics.export') || hasPermission(perms, 'reports.export') ? (
              <>
                <button className="btn ghost sm" onClick={() => void download(qs, tab, 'csv')}>
                  CSV
                </button>
                <button className="btn ghost sm" onClick={() => void download(qs, tab, 'xlsx')}>
                  Excel
                </button>
                <button className="btn ghost sm" onClick={() => window.print()}>
                  Print / PDF
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              className={`chip ${params.get('range') === r.id || (!params.get('range') && r.id === '7d') ? 'ok' : ''}`}
              onClick={() => setParam({ range: r.id, from: r.id === 'custom' ? params.get('from') : null, to: r.id === 'custom' ? params.get('to') : null })}
            >
              {r.label}
            </button>
          ))}
          {(params.get('range') === 'custom' || more) && (
            <>
              <input className="field" type="date" style={{ width: 150, margin: 0 }} value={params.get('from') ?? ''} onChange={(e) => setParam({ range: 'custom', from: e.target.value })} />
              <input className="field" type="date" style={{ width: 150, margin: 0 }} value={params.get('to') ?? ''} onChange={(e) => setParam({ range: 'custom', to: e.target.value })} />
            </>
          )}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <select className="field" style={{ width: 180, margin: 0 }} value={params.get('compare') ?? 'period'} onChange={(e) => setParam({ compare: e.target.value })}>
            <option value="period">Compare previous period</option>
            <option value="year">Compare previous year</option>
            <option value="none">No comparison</option>
          </select>
          <select className="field" style={{ width: 160, margin: 0 }} value={params.get('timezone') ?? 'America/Toronto'} onChange={(e) => setParam({ timezone: e.target.value })}>
            <option value="America/Toronto">America/Toronto</option>
            <option value="UTC">UTC</option>
            <option value="America/Vancouver">America/Vancouver</option>
            <option value="Europe/London">Europe/London</option>
          </select>
          <select className="field" style={{ width: 140, margin: 0 }} value={params.get('groupBy') ?? 'day'} onChange={(e) => setParam({ groupBy: e.target.value })}>
            <option value="hour">By hour</option>
            <option value="day">By day</option>
            <option value="week">By week</option>
            <option value="month">By month</option>
          </select>
          {views.length > 0 && (
            <select
              className="field"
              style={{ width: 180, margin: 0 }}
              defaultValue=""
              onChange={(e) => {
                const v = views.find((x) => x.id === e.target.value);
                if (!v) return;
                const next = new URLSearchParams(params.toString());
                Object.entries(v.query ?? {}).forEach(([k, val]) => next.set(k, String(val)));
                router.replace(`${path}?${next}`);
              }}
            >
              <option value="">Saved views</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={params.get('demo') === '1'} onChange={(e) => setParam({ demo: e.target.checked ? '1' : null })} />
            Demo data
          </label>
        </div>
        {more && (
          <div className="row" style={{ marginTop: 8 }}>
            <Select label="City" value={params.get('city')} options={meta?.cities} onChange={(v) => setParam({ city: v, zone: params.get('zone') })} />
            <Select label="Zone" value={params.get('zone')} options={meta?.zones} onChange={(v) => setParam({ zone: v })} />
            <Select label="Service" value={params.get('serviceType')} options={meta?.serviceTypes} onChange={(v) => setParam({ serviceType: v })} />
            <Select label="Vehicle" value={params.get('vehicleType')} options={meta?.vehicleClasses} onChange={(v) => setParam({ vehicleType: v })} />
            <Select label="Driver status" value={params.get('driverStatus')} options={meta?.driverStatuses} onChange={(v) => setParam({ driverStatus: v })} />
            <Select label="Passenger" value={params.get('passengerSegment')} options={meta?.passengerSegments} onChange={(v) => setParam({ passengerSegment: v })} />
            <Select label="Payment" value={params.get('paymentMethod')} options={meta?.paymentMethods} onChange={(v) => setParam({ paymentMethod: v })} />
            <Select label="Ride status" value={params.get('rideStatus')} options={meta?.rideStatuses} onChange={(v) => setParam({ rideStatus: v })} />
            <Select label="Promo" value={params.get('promo')} options={meta?.promos} onChange={(v) => setParam({ promo: v })} />
          </div>
        )}
      </div>

      <div className="tabs analytics-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setParam({ tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="err" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>{err}</span>
          <button className="btn sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {loading && <Skeleton />}
      {!loading && empty && !demo && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>No analytics data available for this period.</h3>
          <p className="muted">Try a wider date range, clear filters, or enable Demo data to preview the workspace layout. Empty states are expected before marketplace volume exists.</p>
        </div>
      )}

      {!loading && data && tab === 'overview' && (
        <OverviewSection
          data={data as Overview}
          live={live}
          currency={currency}
          onDrill={(k, title) => setDrill({ metric: k, title })}
          onZone={(zone) => setParam({ zone, tab: 'geography' })}
        />
      )}
      {!loading && data && tab !== 'overview' && tab !== 'reports' && (
        <SectionBody
          tab={tab}
          data={data}
          currency={currency}
          onDrill={(k, title) => setDrill({ metric: k, title })}
          onZone={(zone) => setParam({ zone, tab: 'overview' })}
          qs={qs}
        />
      )}
      {!loading && tab === 'reports' && <CustomReports qs={qs} />}

      {drill && (
        <Drilldown
          title={drill.title}
          metric={drill.metric}
          qs={qs}
          onClose={() => setDrill(null)}
        />
      )}
      {saveOpen && (
        <SaveViewModal
          onClose={() => setSaveOpen(false)}
          onSave={async (name) => {
            const query: Record<string, string> = {};
            params.forEach((v, k) => {
              query[k] = v;
            });
            await api('/admin/analytics/views', { method: 'POST', body: JSON.stringify({ name, kind: 'filter', query }) });
            const list = await api<SavedView[]>('/admin/analytics/views');
            setViews(list);
            setSaveOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options?: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <select className="field" style={{ width: 160, margin: 0 }} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{label}</option>
      {(options ?? []).map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Kpi({
  card,
  currency,
  onClick,
}: {
  card: KpiCard;
  currency: string;
  onClick: () => void;
}) {
  const up = (card.changePct ?? 0) >= 0;
  const sparkColor = up ? '#2ea44f' : '#e50000';
  return (
    <button type="button" className="kpi kpi-spark analytics-kpi" onClick={onClick} title={card.definition || card.label}>
      <div className="label">{card.label}</div>
      <div className="value">{formatMetric(card.value, card.unit, currency)}</div>
      <div className={`kpi-delta ${up ? 'ok' : 'bad'}`}>
        {card.changePct == null ? 'n/a vs prior' : `${up ? '↑' : '↓'} ${Math.abs(card.changePct)}% vs previous period`}
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Prev {formatMetric(card.previous, card.unit, currency)}
      </div>
      <Sparkline values={card.sparkline?.length ? card.sparkline : [0]} color={sparkColor} />
    </button>
  );
}

function OverviewSection({
  data,
  live,
  currency,
  onDrill,
}: {
  data: Overview;
  live: Record<string, number | boolean> | null;
  currency: string;
  onDrill: (k: string, title: string) => void;
  onZone: (zone: string) => void;
}) {
  const k = data.kpis;
  const liveMap = live ?? data.live ?? {};
  return (
    <>
      <section className="band">
        <h2>Right now</h2>
        <div className="kpis">
          {Object.entries(liveMap).map(([key, v]) => (
            <div className="kpi" key={key}>
              <div className="label">{labelize(key)}</div>
              <div className="value">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' && key.toLowerCase().includes('revenue') ? formatMoney(v, currency) : String(v)}</div>
            </div>
          ))}
        </div>
      </section>
      {data.insights && data.insights.length > 0 && (
        <section className="band">
          <h2>Insights</h2>
          <div className="insight-list">
            {data.insights.map((i, idx) => (
              <div key={idx} className={`insight ${i.severity}`}>
                {i.text}
              </div>
            ))}
          </div>
        </section>
      )}
      {k && (
        <>
          <section className="band">
            <h2>Business</h2>
            <div className="kpis">{k.business.map((c) => <Kpi key={c.key} card={c} currency={currency} onClick={() => onDrill(c.drill, c.label)} />)}</div>
          </section>
          <section className="band">
            <h2>Growth</h2>
            <div className="kpis">{k.growth.map((c) => <Kpi key={c.key} card={c} currency={currency} onClick={() => onDrill(c.drill, c.label)} />)}</div>
          </section>
          <section className="band">
            <h2>Operations</h2>
            <div className="kpis">{k.operations.map((c) => <Kpi key={c.key} card={c} currency={currency} onClick={() => onDrill(c.drill, c.label)} />)}</div>
          </section>
        </>
      )}
      <div className="grid-2">
        <div className="panel">
          <h3>Gross bookings &amp; rides</h3>
          {data.trend && (
            <AreaChart
              labels={data.trend.map((t) => t.date.slice(5))}
              a={data.trend.map((t) => t.gmv)}
              b={data.trend.map((t) => t.rides)}
              aLabel="Gross bookings"
              bLabel="Rides"
            />
          )}
        </div>
        <div className="panel">
          <h3>Ride funnel</h3>
          {data.funnel && (
            <FunnelBars
              steps={data.funnel.steps.map((s) => ({ label: s.label, value: s.value }))}
              onSelect={(label) => onDrill(label.toLowerCase().includes('cancel') ? 'cancelled' : 'rides', label)}
            />
          )}
        </div>
      </div>
    </>
  );
}

function SectionBody({
  tab,
  data,
  currency,
  onDrill,
  onZone,
  qs,
}: {
  tab: string;
  data: Record<string, unknown>;
  currency: string;
  onDrill: (k: string, title: string) => void;
  onZone: (zone: string) => void;
  qs: string;
}) {
  if (data.denied) {
    return <div className="panel"><p className="err">{String(data.message ?? 'Not authorized for this section.')}</p></div>;
  }
  if (tab === 'rides') return <RidesBody data={data} currency={currency} onDrill={onDrill} />;
  if (tab === 'revenue') return <RevenueBody data={data} currency={currency} onDrill={onDrill} />;
  if (tab === 'drivers') return <DriversBody data={data} currency={currency} />;
  if (tab === 'passengers') return <PassengersBody data={data} currency={currency} />;
  if (tab === 'geography') return <GeoBody data={data} currency={currency} onZone={onZone} />;
  if (tab === 'cancellations') return <CancelBody data={data} onDrill={onDrill} />;
  if (tab === 'payments') return <PayBody data={data} currency={currency} />;
  if (tab === 'retention') return <RetentionBody data={data} />;
  if (tab === 'funnel') return <FunnelBody data={data} onDrill={onDrill} />;
  if (tab === 'operations') return <OpsBody data={data} currency={currency} />;
  if (tab === 'forecast') return <ForecastBody data={data} />;
  if (tab === 'promotions') return <PromoBody data={data} currency={currency} />;
  if (tab === 'ratings') return <RatingsBody data={data} />;
  if (tab === 'safety') return <SafetyBody data={data} />;
  return <pre className="panel">{JSON.stringify(data, null, 2)}</pre>;
}

function KpiList({
  cards,
  currency,
  onDrill,
}: {
  cards: KpiCard[];
  currency: string;
  onDrill: (k: string, title: string) => void;
}) {
  return (
    <div className="kpis">
      {cards.map((c) => (
        <Kpi key={c.key} card={c} currency={currency} onClick={() => onDrill(c.drill || c.key, c.label)} />
      ))}
    </div>
  );
}

function RidesBody({ data, currency, onDrill }: { data: Record<string, unknown>; currency: string; onDrill: (k: string, t: string) => void }) {
  const kpis = (data.kpis as KpiCard[]) ?? [];
  const funnel = data.funnel as Overview['funnel'];
  const byHour = (data.byHour as Array<{ hour: number; value: number }>) ?? [];
  const byStatus = (data.byStatus as Array<{ label: string; value: number }>) ?? [];
  const byVehicle = (data.byVehicle as Array<{ label: string; value: number }>) ?? [];
  const byZone = (data.byZone as Array<{ zone: string; requests: number }>) ?? [];
  const peak = data.peak as { note?: string } | undefined;
  const byDay = (data.byDay as Array<{ date: string; rides: number; completed: number }>) ?? [];
  return (
    <>
      <KpiList cards={kpis} currency={currency} onDrill={onDrill} />
      {peak?.note && <p className="insight info">{peak.note}</p>}
      <div className="grid-2">
        <div className="panel">
          <h3>Lifecycle funnel</h3>
          {funnel && <FunnelBars steps={funnel.steps.map((s) => ({ label: s.label, value: s.value }))} onSelect={(l) => onDrill('rides', l)} />}
        </div>
        <div className="panel">
          <h3>Rides by hour</h3>
          <BarChart items={byHour.map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.value }))} />
        </div>
        <div className="panel">
          <h3>By day</h3>
          <AreaChart labels={byDay.map((d) => d.date.slice(5))} a={byDay.map((d) => d.rides)} b={byDay.map((d) => d.completed)} aLabel="Requests" bLabel="Completed" />
        </div>
        <div className="panel">
          <h3>By status</h3>
          <Donut slices={byStatus.map((s, i) => ({ label: s.label, value: s.value, color: COLORS[i % COLORS.length] }))} />
        </div>
        <div className="panel">
          <h3>Vehicle type</h3>
          <BarChart items={byVehicle.map((v) => ({ label: v.label, value: Number(v.value) }))} color="#2ea44f" />
        </div>
        <div className="panel">
          <h3>By zone</h3>
          <BarChart items={byZone.map((z) => ({ label: z.zone, value: Number(z.requests) }))} onSelect={(z) => onDrill('rides', z)} />
        </div>
      </div>
    </>
  );
}

function RevenueBody({ data, currency, onDrill }: { data: Record<string, unknown>; currency: string; onDrill: (k: string, t: string) => void }) {
  const kpis = (data.kpis as KpiCard[]) ?? [];
  const series = (data.series as Array<{ date: string; gmv: number; net: number; rides: number }>) ?? [];
  const stacked = (data.stacked as Array<Record<string, string | number>>) ?? [];
  const breakdown = (data.breakdown as Array<{ label: string; value: number }>) ?? [];
  return (
    <>
      <KpiList cards={kpis} currency={currency} onDrill={onDrill} />
      <div className="grid-2">
        <div className="panel">
          <h3>Gross bookings over time</h3>
          <AreaChart labels={series.map((s) => s.date.slice(5))} a={series.map((s) => s.gmv)} b={series.map((s) => s.net)} aLabel="Gross" bLabel="Net" />
        </div>
        <div className="panel">
          <h3>Stacked commission vs driver share</h3>
          <StackedBar items={stacked} keys={[{ key: 'commission', label: 'Commission', color: '#2ea44f' }, { key: 'driver', label: 'Driver', color: '#1d4ed8' }]} />
        </div>
        <div className="panel">
          <h3>Revenue waterfall</h3>
          <Waterfall items={breakdown.map((b) => ({ label: b.label, value: Number(b.value) }))} />
        </div>
      </div>
    </>
  );
}

function DriversBody({ data, currency }: { data: Record<string, unknown>; currency: string }) {
  const k = (data.kpis as Record<string, number>) ?? {};
  const top = (data.topDrivers as Array<Record<string, unknown>>) ?? [];
  const hours = (data.activityByHour as Array<{ hour: number; value: number }>) ?? [];
  const earn = (data.earningsDistribution as Array<{ bucket: string; value: number }>) ?? [];
  const ratings = (data.ratingDistribution as Array<{ stars: number; value: number }>) ?? [];
  return (
    <>
      {data.notes && typeof data.notes === 'object' && (
        <p className="insight info">{String((data.notes as { onlineHours?: string }).onlineHours ?? '')}</p>
      )}
      <div className="kpis">
        {Object.entries(k).map(([key, v]) => (
          <div className="kpi" key={key}>
            <div className="label">{labelize(key)}</div>
            <div className="value">{key.toLowerCase().includes('earn') ? formatMoney(v, currency) : v}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Activity by hour</h3>
          <BarChart items={hours.map((h) => ({ label: String(h.hour), value: h.value }))} color="#f59e0b" />
        </div>
        <div className="panel">
          <h3>Earnings distribution</h3>
          <BarChart items={earn.map((e) => ({ label: e.bucket, value: e.value }))} color="#2ea44f" />
        </div>
        <div className="panel">
          <h3>Rating distribution</h3>
          <BarChart items={ratings.map((r) => ({ label: `${r.stars}★`, value: r.value }))} />
        </div>
      </div>
      <div className="panel table-wrap" style={{ marginTop: 14 }}>
        <h3>Top drivers</h3>
        <table className="data">
          <thead>
            <tr>
              {['Driver', 'Trips', 'Earnings', 'Online hrs', 'Accept %', 'Cancel %', 'Rating', 'Revenue'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={String(r.driverId)}>
                <td>
                  <Link href={`/users/${r.userId}`}>{String(r.name)}</Link>
                </td>
                <td>{String(r.trips)}</td>
                <td>{formatMoney(Number(r.earnings), currency)}</td>
                <td>{String(r.onlineHours)}</td>
                <td>{String(r.acceptancePct)}</td>
                <td>{String(r.cancellationPct)}</td>
                <td>{String(r.rating)}</td>
                <td>{formatMoney(Number(r.revenueGenerated), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {top.length === 0 && <Empty text="No driver trips in this period." />}
      </div>
    </>
  );
}

function PassengersBody({ data, currency }: { data: Record<string, unknown>; currency: string }) {
  const k = (data.kpis as Record<string, number>) ?? {};
  const segs = (data.segments as Array<{ label: string; value: number }>) ?? [];
  const growth = (data.growth as Array<{ date: string; new: number; drivers: number }>) ?? [];
  const freq = (data.frequency as Array<{ label: string; value: number }>) ?? [];
  const spend = (data.spendDistribution as Array<{ label: string; value: number }>) ?? [];
  const conv = data.registrationToFirstRide as { registered?: number; firstRide?: number; conversionPct?: number } | undefined;
  return (
    <>
      <div className="kpis">
        {Object.entries(k).map(([key, v]) => (
          <div className="kpi" key={key}>
            <div className="label">{labelize(key)}</div>
            <div className="value">{key.toLowerCase().includes('spend') || key.toLowerCase().includes('value') ? formatMoney(v, currency) : v}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Passenger growth</h3>
          <AreaChart labels={growth.map((g) => g.date.slice(5))} a={growth.map((g) => g.new)} b={growth.map((g) => g.drivers)} aLabel="New passengers" bLabel="New drivers" />
        </div>
        <div className="panel">
          <h3>Segments</h3>
          <Donut slices={segs.map((s, i) => ({ label: s.label, value: s.value, color: COLORS[i % COLORS.length] }))} />
        </div>
        <div className="panel">
          <h3>Ride frequency</h3>
          <BarChart items={freq} color="#1d4ed8" />
        </div>
        <div className="panel">
          <h3>Spend distribution</h3>
          <BarChart items={spend} color="#2ea44f" />
        </div>
      </div>
      {conv && (
        <p className="insight info">
          Registration → first ride conversion: {conv.conversionPct}% ({conv.firstRide} of {conv.registered}).
        </p>
      )}
    </>
  );
}

function GeoBody({
  data,
  currency,
  onZone,
}: {
  data: Record<string, unknown>;
  currency: string;
  onZone: (z: string) => void;
}) {
  const layers = (data.layers as Record<string, Array<{ lat: number; lng: number }>>) ?? {};
  const [layer, setLayer] = useState('requests');
  const zones = (data.zones as Array<Record<string, unknown>>) ?? [];
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        {Object.keys(layers).map((k) => (
          <button key={k} className={`chip ${layer === k ? 'ok' : ''}`} onClick={() => setLayer(k)}>
            {labelize(k)}
          </button>
        ))}
      </div>
      <AnalyticsMap layers={layers} active={layer} />
      <div className="panel table-wrap" style={{ marginTop: 14 }}>
        <h3>Zone comparison</h3>
        <table className="data">
          <thead>
            <tr>
              {['Zone', 'Requests', 'Completed', 'Drivers', 'Avg ETA', 'Revenue', 'Cancel %'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={String(z.zone)} onClick={() => onZone(String(z.zone))}>
                <td>{String(z.zone)}</td>
                <td>{String(z.requests)}</td>
                <td>{String(z.completed)}</td>
                <td>{String(z.drivers)}</td>
                <td>{String(z.avgEta)}</td>
                <td>{formatMoney(Number(z.revenue), currency)}</td>
                <td>{String(z.cancellationPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CancelBody({ data, onDrill }: { data: Record<string, unknown>; onDrill: (k: string, t: string) => void }) {
  const pax = (data.passengerReasons as Array<{ reason: string; n: number }>) ?? [];
  const drv = (data.driverReasons as Array<{ reason: string; n: number }>) ?? [];
  const hours = (data.byHour as Array<{ hour: number; value: number }>) ?? [];
  const highD = (data.highCancelDrivers as Array<Record<string, unknown>>) ?? [];
  const highP = (data.highPassengers as Array<Record<string, unknown>>) ?? [];
  return (
    <>
      <div className="kpis">
        {Object.entries((data.kpis as Record<string, number>) ?? {}).map(([k, v]) => (
          <button key={k} className="kpi" onClick={() => onDrill('cancelled', k)}>
            <div className="label">{labelize(k)}</div>
            <div className="value">{v}%</div>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Passenger reasons</h3>
          <BarChart items={pax.map((r) => ({ label: r.reason, value: Number(r.n) }))} onSelect={() => onDrill('cancelled', 'Passenger cancellations')} />
        </div>
        <div className="panel">
          <h3>Driver reasons</h3>
          <BarChart items={drv.map((r) => ({ label: r.reason, value: Number(r.n) }))} color="#f59e0b" onSelect={() => onDrill('cancelled', 'Driver cancellations')} />
        </div>
        <div className="panel">
          <h3>By hour</h3>
          <BarChart items={hours.map((h) => ({ label: String(h.hour), value: h.value }))} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <ActorTable title="High-cancel drivers" rows={highD} href={(r) => `/users/${r.user_id}`} />
        <ActorTable title="High-cancel passengers" rows={highP} href={(r) => `/users/${r.user_id}`} />
      </div>
    </>
  );
}

function ActorTable({ title, rows, href }: { title: string; rows: Array<Record<string, unknown>>; href: (r: Record<string, unknown>) => string }) {
  return (
    <div className="panel table-wrap">
      <h3>{title}</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Cancelled</th>
            <th>Total</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>
                <Link href={href(r)}>{String(r.name)}</Link>
              </td>
              <td>{String(r.cancelled)}</td>
              <td>{String(r.total)}</td>
              <td>{String(r.rate)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayBody({ data, currency }: { data: Record<string, unknown>; currency: string }) {
  const k = (data.kpis as Record<string, number>) ?? {};
  const volume = (data.volume as Array<{ date: string; gmv: number }>) ?? [];
  const methods = (data.methodDistribution as Array<{ provider: string; _count: { _all: number }; _sum: { amount: number | null } }>) ?? [];
  return (
    <>
      <div className="kpis">
        {Object.entries(k).map(([key, v]) => (
          <div className="kpi" key={key}>
            <div className="label">{labelize(key)}</div>
            <div className="value">{key.toLowerCase().includes('volume') || key.toLowerCase().includes('amount') ? formatMoney(v, currency) : v}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Payment volume</h3>
          <AreaChart labels={volume.map((v) => v.date.slice(5))} a={volume.map((v) => v.gmv)} b={volume.map(() => 0)} aLabel="Volume" bLabel="" />
        </div>
        <div className="panel">
          <h3>Method mix</h3>
          <Donut slices={methods.map((m, i) => ({ label: m.provider, value: m._count._all, color: COLORS[i % COLORS.length] }))} />
        </div>
      </div>
    </>
  );
}

function RetentionBody({ data }: { data: Record<string, unknown> }) {
  const weekly = (data.weekly as Array<{ cohort: string; users: number; weeks: number[] }>) ?? [];
  const [grain, setGrain] = useState<'weekly' | 'monthly'>('weekly');
  const rows = grain === 'weekly' ? weekly : ((data.monthly as typeof weekly) ?? weekly);
  return (
    <>
      <div className="kpis">
        {['d1', 'd7', 'd30', 'churn', 'reactivation'].map((k) => (
          <div className="kpi" key={k}>
            <div className="label">{k.toUpperCase()}</div>
            <div className="value">{String(data[k] ?? '—')}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`chip ${grain === 'weekly' ? 'ok' : ''}`} onClick={() => setGrain('weekly')}>
          Weekly cohorts
        </button>
        <button className={`chip ${grain === 'monthly' ? 'ok' : ''}`} onClick={() => setGrain('monthly')}>
          Monthly cohorts
        </button>
      </div>
      <div className="panel table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Users</th>
              <th>W0</th>
              <th>W1</th>
              <th>W2</th>
              <th>W3</th>
              <th>W4</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort}>
                <td>{r.cohort}</td>
                <td>{r.users}</td>
                {(r.weeks ?? []).map((w, i) => (
                  <td key={i} style={{ background: `rgba(46,164,79,${(w || 0) / 140})` }}>
                    {w ? `${w}%` : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="Not enough history for cohort retention yet." />}
      </div>
    </>
  );
}

function FunnelBody({ data, onDrill }: { data: Record<string, unknown>; onDrill: (k: string, t: string) => void }) {
  const funnel = data.funnel as Overview['funnel'];
  return (
    <div className="panel">
      <h3>Marketplace conversion</h3>
      <p className="muted">{String(data.marketplaceNote ?? '')}</p>
      {funnel && (
        <>
          <FunnelBars steps={funnel.steps.map((s) => ({ label: s.label, value: s.value }))} onSelect={(l) => onDrill('rides', l)} />
          <div className="funnel-conv">
            {funnel.edges.map((e) => (
              <span key={e.to}>
                {e.from} → {e.to}: {e.conversionPct}% conversion · {e.dropoffPct}% drop-off
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OpsBody({ data, currency }: { data: Record<string, unknown>; currency: string }) {
  const heat = data.heatmap as { cells: Array<{ hour: number; dow: number; requests: number; revenue: number; supply: number; cancelPct: number; eta: number }>; metrics: string[] };
  const [metric, setMetric] = useState('requests');
  const hours = (data.demandVsSupplyByHour as Array<{ hour: number; demand: number; supply: number; ratio: number }>) ?? [];
  const critical = (data.critical as Array<{ label: string; message: string; shortage?: boolean }>) ?? [];
  const live = (data.live as Record<string, number | boolean>) ?? {};
  return (
    <>
      <div className="kpis">
        {Object.entries(live).map(([k, v]) => (
          <div className="kpi" key={k}>
            <div className="label">{labelize(k)}</div>
            <div className="value">{typeof v === 'number' && k.toLowerCase().includes('revenue') ? formatMoney(v, currency) : String(v)}</div>
          </div>
        ))}
      </div>
      {critical.map((c) => (
        <div key={c.label} className={`insight ${c.shortage ? 'warning' : 'info'}`}>
          {c.label}: {c.message}
        </div>
      ))}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Hour × day</h3>
          <select className="field" style={{ width: 180, margin: 0 }} value={metric} onChange={(e) => setMetric(e.target.value)}>
            {(heat?.metrics ?? ['requests']).map((m) => (
              <option key={m} value={m}>
                {labelize(m)}
              </option>
            ))}
          </select>
        </div>
        {heat?.cells && <HeatmapGrid cells={heat.cells} valueKey={metric} />}
      </div>
      <div className="panel">
        <h3>Demand vs supply by hour</h3>
        <AreaChart labels={hours.map((h) => String(h.hour))} a={hours.map((h) => h.demand)} b={hours.map((h) => h.supply)} aLabel="Demand" bLabel="Supply" />
      </div>
    </>
  );
}

function ForecastBody({ data }: { data: Record<string, unknown> }) {
  const demand = data.demand as { history: number[]; forecast: number[]; lower: number[]; upper: number[]; method: string };
  const dates = (data.dates as string[]) ?? [];
  return (
    <>
      <Chip tone="info">Estimated · {String(data.method)}</Chip>
      <p className="muted">{String(data.disclaimer ?? '')}</p>
      <div className="panel">
        <h3>Ride demand forecast</h3>
        {demand && (
          <LineBand labels={dates} history={demand.history} forecast={demand.forecast} lower={demand.lower} upper={demand.upper} />
        )}
      </div>
    </>
  );
}

function PromoBody({ data, currency }: { data: Record<string, unknown>; currency: string }) {
  const campaigns = (data.campaigns as Array<Record<string, unknown>>) ?? [];
  return (
    <div className="panel table-wrap">
      <h3>Campaign comparison</h3>
      <table className="data">
        <thead>
          <tr>
            {['Code', 'Issued', 'Redeemed', 'Rate', 'Discount', 'Rides', 'New users', 'Revenue', 'CPA'].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={String(c.code)}>
              <td>{String(c.code)}</td>
              <td>{String(c.issued)}</td>
              <td>{String(c.redeemed)}</td>
              <td>{String(c.redemptionRate)}%</td>
              <td>{formatMoney(Number(c.discountCost), currency)}</td>
              <td>{String(c.ridesGenerated)}</td>
              <td>{String(c.newUsers)}</td>
              <td>{formatMoney(Number(c.revenue), currency)}</td>
              <td>{formatMoney(Number(c.cpa), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingsBody({ data }: { data: Record<string, unknown> }) {
  const k = (data.kpis as Record<string, number>) ?? {};
  const dist = (data.distribution as Array<{ stars: number; value: number }>) ?? [];
  const lowest = (data.lowestRated as Array<Record<string, unknown>>) ?? [];
  const trend = (data.trend as Array<{ date: string; avg: number }>) ?? [];
  return (
    <>
      <div className="kpis">
        {Object.entries(k).map(([key, v]) => (
          <div className="kpi" key={key}>
            <div className="label">{labelize(key)}</div>
            <div className="value">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Star mix</h3>
          <BarChart items={dist.map((d) => ({ label: `${d.stars} ★`, value: d.value }))} />
        </div>
        <div className="panel">
          <h3>Rating trend</h3>
          <AreaChart labels={trend.map((t) => t.date.slice(5))} a={trend.map((t) => t.avg)} b={trend.map(() => 0)} aLabel="Avg" bLabel="" />
        </div>
      </div>
      <div className="panel table-wrap" style={{ marginTop: 14 }}>
        <h3>Lowest-rated drivers</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Avg</th>
              <th>Ratings</th>
            </tr>
          </thead>
          <tbody>
            {lowest.map((r) => (
              <tr key={String(r.user_id)}>
                <td>
                  <Link href={`/users/${r.user_id}`}>{String(r.name)}</Link>
                </td>
                <td>{Number(r.avg).toFixed(2)}</td>
                <td>{String(r.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SafetyBody({ data }: { data: Record<string, unknown> }) {
  const k = (data.kpis as Record<string, number>) ?? {};
  const trend = (data.trend as Array<{ date: string; cases: number }>) ?? [];
  return (
    <>
      <p className="muted">{String(data.note ?? '')}</p>
      <div className="kpis">
        {Object.entries(k).map(([key, v]) => (
          <div className="kpi" key={key}>
            <div className="label">{labelize(key)}</div>
            <div className="value">{v}</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Case volume</h3>
        <AreaChart labels={trend.map((t) => t.date.slice(5))} a={trend.map((t) => t.cases)} b={trend.map(() => 0)} aLabel="Cases" bLabel="" />
      </div>
    </>
  );
}

function CustomReports({ qs }: { qs: string }) {
  const [metrics, setMetrics] = useState<string[]>(['rides', 'revenue']);
  const [dimension, setDimension] = useState('date');
  const [chart, setChart] = useState('bar');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [name, setName] = useState('');
  async function run() {
    const d = await api<{ rows: Array<Record<string, unknown>> }>(`/admin/analytics/reports/run?${qs}`, {
      method: 'POST',
      body: JSON.stringify({ metrics, dimension, chartType: chart }),
    });
    setRows(d.rows);
  }
  return (
    <div className="panel">
      <h3>Custom report builder</h3>
      <div className="row">
        {['rides', 'revenue', 'cancellations'].map((m) => (
          <label key={m}>
            <input type="checkbox" checked={metrics.includes(m)} onChange={(e) => setMetrics((cur) => (e.target.checked ? [...cur, m] : cur.filter((x) => x !== m)))} /> {m}
          </label>
        ))}
        <select className="field" style={{ width: 160, margin: 0 }} value={dimension} onChange={(e) => setDimension(e.target.value)}>
          {['date', 'hour', 'zone', 'vehicleType', 'paymentMethod', 'rideStatus', 'driver', 'passenger'].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="field" style={{ width: 120, margin: 0 }} value={chart} onChange={(e) => setChart(e.target.value)}>
          <option value="bar">Bar</option>
          <option value="table">Table</option>
        </select>
        <button className="btn sm" onClick={() => void run()}>
          Run
        </button>
      </div>
      {chart === 'bar' && rows.length > 0 && (
        <BarChart items={rows.map((r) => ({ label: String(r.dimension), value: Number(r.rides) }))} />
      )}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Rides</th>
              <th>Revenue</th>
              <th>Cancellations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.dimension)}>
                <td>{String(r.dimension)}</td>
                <td>{String(r.rides)}</td>
                <td>{String(r.revenue)}</td>
                <td>{String(r.cancellations)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input className="field" style={{ width: 220, margin: 0 }} placeholder="Save report as…" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn sm"
          disabled={!name}
          onClick={() =>
            api('/admin/analytics/views', {
              method: 'POST',
              body: JSON.stringify({ name, kind: 'report', query: { metrics, dimension, chartType: chart } }),
            })
          }
        >
          Save report
        </button>
      </div>
    </div>
  );
}

function Drilldown({
  title,
  metric,
  qs,
  onClose,
}: {
  title: string;
  metric: string;
  qs: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ rows: Array<Record<string, unknown>>; total: number }>(`/admin/analytics/drilldown?${qs}&metric=${encodeURIComponent(metric)}&page=${page}`)
      .then((d) => {
        setRows(d.rows);
        setTotal(d.total);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [qs, metric, page]);
  return (
    <Modal title={`${title} · ${total} records`} onClose={onClose} wide>
      {err && <p className="err">{err}</p>}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {['Ride', 'Passenger', 'Driver', 'Pickup', 'Destination', 'Zone', 'Fare', 'Status', 'Reason', 'Requested'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  <Link href={`/rides/${r.id}`}>{String(r.publicCode)}</Link>
                </td>
                <td>
                  <Link href={`/users/${r.passengerUserId}`}>{String(r.passenger)}</Link>
                </td>
                <td>
                  {r.driverUserId ? <Link href={`/users/${r.driverUserId}`}>{String(r.driver)}</Link> : '—'}
                </td>
                <td>{String(r.pickup)}</td>
                <td>{String(r.destination ?? '—')}</td>
                <td>{String(r.zone)}</td>
                <td>{String(r.fare)}</td>
                <td>
                  <Chip tone={statusTone(String(r.status))}>{String(r.status)}</Chip>
                </td>
                <td>{String(r.cancellationReason || '—')}</td>
                <td>{when(String(r.requestedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Prev
        </button>
        <span className="muted">Page {page}</span>
        <button className="btn ghost sm" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </Modal>
  );
}

function SaveViewModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Save filter view" onClose={onClose}>
      <input className="field" placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" disabled={!name.trim()} onClick={() => void onSave(name.trim())}>
        Save
      </button>
    </Modal>
  );
}

function Skeleton() {
  return (
    <div className="kpis">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="kpi" key={i} style={{ minHeight: 96, opacity: 0.5 }}>
          <div className="label">Loading</div>
          <div className="value">—</div>
        </div>
      ))}
    </div>
  );
}

function labelize(k: string) {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (s) => s.toUpperCase());
}

async function download(qs: string, tab: string, format: string) {
  const token = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cango_admin_tokens') || 'null') : null;
  const base = process.env.NEXT_PUBLIC_CANGO_API_BASE ?? 'http://127.0.0.1:4000/api';
  const res = await fetch(`${base}/admin/analytics/export?${qs}&section=${tab}&format=${format}`, {
    headers: { Authorization: `Bearer ${token?.accessToken ?? ''}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cango-analytics-${tab}.${format === 'xlsx' ? 'xls' : 'csv'}`;
  a.click();
}
