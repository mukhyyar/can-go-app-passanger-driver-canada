'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { Chip, money } from '../../components/ui';
import { AreaChart, Donut, FunnelBars, Sparkline } from '../../components/charts';
import { FleetMap } from '../../components/fleet-map';

type Kpis = {
  users: Record<string, number>;
  marketplace: Record<string, number>;
  revenue: Record<string, number>;
  live: Record<string, number>;
};
type Series = {
  funnel: Record<string, number>;
  trend: Array<{ date: string; rides: number; gmv: number; pax: number; drv: number }>;
  serviceType: Record<string, number>;
};

const FUNNEL_ORDER = ['requested', 'withBids', 'accepted', 'paid', 'started', 'completed'];

export default function CommandCenter() {
  const [range, setRange] = useState('30d');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Kpis>(`/admin/dashboard/kpis?range=${range}`),
      api<Series>(`/admin/dashboard/series?range=${range}`),
    ])
      .then(([k, s]) => {
        setKpis(k);
        setSeries(s);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range]);

  const donutColors = ['#e50000', '#2ea44f', '#1d4ed8', '#f59e0b', '#111'];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Command Center</h1>
          <p className="page-sub">Live fleet, marketplace loop, and revenue — CAN-RIDE ops</p>
        </div>
        <select className="field" style={{ width: 140, margin: 0 }} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="today">Today</option>
          <option value="7d">7D</option>
          <option value="30d">30D</option>
          <option value="90d">90D</option>
          <option value="12m">12M</option>
        </select>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="panel live-wall" style={{ marginBottom: 18 }}>
        <FleetMap title="Live vehicles" compact />
      </div>

      {series && kpis && (
        <section className="band">
          <h2>Pulse</h2>
          <div className="kpis">
            <div className="kpi kpi-spark" style={{ animationDelay: '0ms' }}>
              <div className="label">GMV</div>
              <div className="value">{money(Number(kpis.revenue.gmv ?? 0))}</div>
              <Sparkline values={series.trend.map((t) => t.gmv)} color="#e50000" />
            </div>
            <div className="kpi kpi-spark" style={{ animationDelay: '40ms' }}>
              <div className="label">Rides</div>
              <div className="value">{series.trend.reduce((s, t) => s + t.rides, 0)}</div>
              <Sparkline values={series.trend.map((t) => t.rides)} color="#2ea44f" />
            </div>
            <div className="kpi kpi-spark" style={{ animationDelay: '80ms' }}>
              <div className="label">Passengers</div>
              <div className="value">{kpis.users.activePassengers}</div>
              <Sparkline values={series.trend.map((t) => t.pax)} color="#1d4ed8" />
            </div>
            <div className="kpi kpi-spark" style={{ animationDelay: '120ms' }}>
              <div className="label">Drivers</div>
              <div className="value">{kpis.users.activeDrivers}</div>
              <Sparkline values={series.trend.map((t) => t.drv)} color="#f59e0b" />
            </div>
          </div>
        </section>
      )}

      <section className="band">
        <h2>Users</h2>
        <div className="kpis">
          {kpis &&
            Object.entries(kpis.users).map(([k, v], i) => (
              <div className="kpi" key={k} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="label">{labelize(k)}</div>
                <div className="value">{v}</div>
              </div>
            ))}
        </div>
      </section>
      <section className="band">
        <h2>Marketplace</h2>
        <div className="kpis">
          {kpis &&
            Object.entries(kpis.marketplace).map(([k, v], i) => (
              <div className="kpi" key={k} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="label">{labelize(k)}</div>
                <div className="value">{typeof v === 'number' && k.includes('Rate') ? `${v}%` : v}</div>
              </div>
            ))}
        </div>
      </section>
      <section className="band">
        <h2>Revenue</h2>
        <div className="kpis">
          {kpis &&
            Object.entries(kpis.revenue).map(([k, v], i) => (
              <div className="kpi" key={k} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="label">{labelize(k)}</div>
                <div className="value">{k === 'failedPayments' ? v : money(Number(v))}</div>
              </div>
            ))}
        </div>
      </section>

      <div className="grid-2">
        <div className="panel">
          <h3>Revenue vs ride volume</h3>
          {series && (
            <AreaChart
              labels={series.trend.map((t) => t.date.slice(5))}
              a={series.trend.map((t) => t.gmv)}
              b={series.trend.map((t) => t.rides)}
            />
          )}
        </div>
        <div className="panel">
          <h3>Ride funnel</h3>
          <p className="muted">Requested → Bids → Accepted → Paid → Started → Completed</p>
          {series && (
            <FunnelBars
              steps={FUNNEL_ORDER.filter((k) => series.funnel[k] != null).map((k) => ({
                label: labelize(k),
                value: series.funnel[k],
              }))}
            />
          )}
        </div>
        <div className="panel">
          <h3>Service mix</h3>
          {series && (
            <Donut
              slices={Object.entries(series.serviceType).map(([label, value], i) => ({
                label,
                value,
                color: donutColors[i % donutColors.length],
              }))}
            />
          )}
        </div>
        <div className="panel">
          <h3>Needs attention</h3>
          {kpis && (
            <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
              <li className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Link href="/kyc">Pending KYC</Link> <Chip tone="warn">{kpis.live.pendingKyc}</Chip>
              </li>
              <li className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Link href="/rides?bucket=active">In progress</Link>
                <Chip tone="info">{kpis.live.inProgress}</Chip>
              </li>
              <li className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Link href="/cases?queue=sla">SLA breached</Link>
                <Chip tone="bad">{kpis.live.slaBreached}</Chip>
              </li>
              <li className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <Link href="/notifications">Driver notifications</Link>
                <Chip>{kpis.live.ratingsReview}</Chip>
              </li>
              <li className="row" style={{ justifyContent: 'space-between' }}>
                <Link href="/vip">VIP requests</Link> <Chip>{kpis.live.vipPending}</Chip>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function labelize(k: string) {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}
