'use client';

import { useId } from 'react';

export function Sparkline({ values, color = '#2ea44f' }: { values: number[]; color?: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x = (i * w) / Math.max(values.length - 1, 1);
      const y = h - 4 - (v / max) * (h - 8);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({
  labels,
  a,
  b,
  aLabel = 'GMV',
  bLabel = 'Rides',
}: {
  labels: string[];
  a: number[];
  b: number[];
  aLabel?: string;
  bLabel?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const w = 640;
  const h = 240;
  const pad = 36;
  const max = Math.max(1, ...a, ...b);
  const n = Math.max(a.length, 2);
  const xAt = (i: number) => pad + (i * (w - pad * 2)) / Math.max(n - 1, 1);
  const yAt = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const pts = (vals: number[]) => vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const area = (vals: number[]) => {
    if (!vals.length) return '';
    return `${xAt(0)},${h - pad} ${pts(vals)} ${xAt(vals.length - 1)},${h - pad}`;
  };
  const grid = [0.25, 0.5, 0.75, 1];
  return (
    <div>
      <svg className="svg-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fillA-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#e50000" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#e50000" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`fillB-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2ea44f" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2ea44f" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={yAt(max * g)}
            y2={yAt(max * g)}
            stroke="#ececec"
            strokeWidth="1"
          />
        ))}
        <polygon points={area(a)} fill={`url(#fillA-${gid})`} />
        <polygon points={area(b)} fill={`url(#fillB-${gid})`} />
        <polyline points={pts(a)} fill="none" stroke="#e50000" strokeWidth="2.6" strokeLinejoin="round" />
        <polyline points={pts(b)} fill="none" stroke="#2ea44f" strokeWidth="2.6" strokeLinejoin="round" />
      </svg>
      <div className="chart-legend">
        <span style={{ color: '#e50000' }}>● {aLabel}</span>
        <span style={{ color: '#2ea44f' }}>● {bLabel}</span>
        <span>
          {labels[0]} → {labels[labels.length - 1]}
        </span>
      </div>
    </div>
  );
}

export function Donut({
  slices,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
}) {
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0));
  const shown = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="donut-wrap">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <g transform="translate(74,74)">
          <circle r={r} fill="none" stroke="#f3f3f3" strokeWidth="16" />
          <g transform="rotate(-90)">
            {slices.map((s) => {
              const frac = s.value / total;
              const el = (
                <circle
                  key={s.label}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${frac * c} ${c}`}
                  strokeDashoffset={-acc * c}
                />
              );
              acc += frac;
              return el;
            })}
          </g>
          <text textAnchor="middle" dy="6" fontSize="18" fontWeight="800" fill="#1a1a1a">
            {shown}
          </text>
        </g>
      </svg>
      <div>
        {slices.map((s) => (
          <div key={s.label} className="muted" style={{ marginBottom: 6 }}>
            <span style={{ color: s.color }}>●</span> {s.label} · {s.value}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FunnelBars({
  steps,
  onSelect,
}: {
  steps: Array<{ label: string; value: number }>;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div>
      <div className="funnel">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className="step"
            role={onSelect ? 'button' : undefined}
            onClick={() => onSelect?.(s.label)}
            style={{
              height: `${Math.max(28, (s.value / max) * 148)}px`,
              animationDelay: `${i * 70}ms`,
              opacity: 1 - i * 0.08,
              cursor: onSelect ? 'pointer' : undefined,
            }}
          >
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="funnel-conv">
        {steps.slice(1).map((s, i) => {
          const prev = steps[i].value || 1;
          return (
            <span key={s.label}>
              {Math.round((s.value / prev) * 100)}% {s.label}
              {prev ? ` · drop ${Math.round(((prev - s.value) / prev) * 100)}%` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function BarChart({
  items,
  color = '#e50000',
  onSelect,
}: {
  items: Array<{ label: string; value: number }>;
  color?: string;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="muted">No data for this chart.</p>;
  return (
    <div className="bar-chart">
      {items.map((i) => (
        <button
          type="button"
          key={i.label}
          className="bar-row"
          onClick={() => onSelect?.(i.label)}
          title={`${i.label}: ${i.value}`}
        >
          <span className="bar-lab">{i.label}</span>
          <span className="bar-track">
            <span style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </span>
          <span className="bar-val">{i.value}</span>
        </button>
      ))}
    </div>
  );
}

export function StackedBar({
  items,
  keys,
}: {
  items: Array<Record<string, string | number>>;
  keys: Array<{ key: string; label: string; color: string }>;
}) {
  if (!items.length) return <p className="muted">No data for this chart.</p>;
  const w = 640;
  const h = 220;
  const pad = 32;
  const max = Math.max(
    1,
    ...items.map((it) => keys.reduce((s, k) => s + Number(it[k.key] ?? 0), 0)),
  );
  const bw = (w - pad * 2) / Math.max(items.length, 1);
  return (
    <div>
      <svg className="svg-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {items.map((it, i) => {
          let y = h - pad;
          return (
            <g key={String(it.date ?? i)}>
              {keys.map((k) => {
                const v = Number(it[k.key] ?? 0);
                const bh = (v / max) * (h - pad * 2);
                y -= bh;
                return (
                  <rect
                    key={k.key}
                    x={pad + i * bw + 2}
                    y={y}
                    width={Math.max(2, bw - 4)}
                    height={bh}
                    fill={k.color}
                  >
                    <title>{`${k.label}: ${v}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {keys.map((k) => (
          <span key={k.key} style={{ color: k.color }}>
            ● {k.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HeatmapGrid({
  cells,
  valueKey,
}: {
  cells: Array<{ hour: number; dow: number; [k: string]: number }>;
  valueKey: string;
}) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(1, ...cells.map((c) => Number(c[valueKey] ?? 0)));
  const lookup = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, Number(c[valueKey] ?? 0)]));
  return (
    <div className="heat-wrap">
      <div className="heat-head-row">
        <div />
        {days.map((d) => (
          <div key={d} className="heat-head">
            {d}
          </div>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="heat-row">
          <div className="heat-hour">{String(hour).padStart(2, '0')}</div>
          {days.map((_, dow) => {
            const v = lookup.get(`${dow}-${hour}`) ?? 0;
            const t = v / max;
            return (
              <div
                key={dow}
                className="heat-cell"
                title={`${days[dow]} ${String(hour).padStart(2, '0')}:00 · ${v}`}
                style={{
                  background: `rgba(180, 27, 29, ${0.08 + t * 0.72})`,
                  color: t > 0.55 ? '#fff' : 'inherit',
                }}
              >
                {v || ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function LineBand({
  labels,
  history,
  forecast,
  lower,
  upper,
}: {
  labels: string[];
  history: number[];
  forecast: number[];
  lower: number[];
  upper: number[];
}) {
  const w = 720;
  const h = 240;
  const pad = 36;
  const n = Math.max(history.length + forecast.length, 2);
  const max = Math.max(1, ...history, ...forecast, ...upper);
  const xAt = (i: number) => pad + (i * (w - pad * 2)) / Math.max(n - 1, 1);
  const yAt = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const histPts = history.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const fcStart = Math.max(0, history.length - 1);
  const fcPts = [history[history.length - 1] ?? 0, ...forecast]
    .map((v, i) => `${xAt(fcStart + i)},${yAt(v)}`)
    .join(' ');
  const band = [
    ...forecast.map((v, i) => `${xAt(fcStart + 1 + i)},${yAt(upper[i] ?? v)}`),
    ...[...forecast].reverse().map((v, i) => {
      const idx = forecast.length - 1 - i;
      return `${xAt(fcStart + 1 + idx)},${yAt(lower[idx] ?? v)}`;
    }),
  ].join(' ');
  return (
    <div>
      <svg className="svg-chart" viewBox={`0 0 ${w} ${h}`}>
        <polygon points={band} fill="#1d4ed8" opacity="0.12" />
        <polyline points={histPts} fill="none" stroke="#e50000" strokeWidth="2.4" />
        <polyline points={fcPts} fill="none" stroke="#1d4ed8" strokeWidth="2.4" strokeDasharray="6 4" />
      </svg>
      <div className="chart-legend">
        <span style={{ color: '#e50000' }}>● History</span>
        <span style={{ color: '#1d4ed8' }}>● Estimate</span>
        <span>80% range</span>
        <span className="muted">
          {labels[0]} → {labels[labels.length - 1]}
        </span>
      </div>
    </div>
  );
}

export function Waterfall({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="bar-chart">
      {items.map((i) => (
        <div key={i.label} className="bar-row">
          <span className="bar-lab">{i.label}</span>
          <span className="bar-track">
            <span
              style={{
                width: `${(Math.abs(i.value) / max) * 100}%`,
                background: i.value < 0 ? '#e50000' : i.label.toLowerCase().includes('net') ? '#2ea44f' : '#1d4ed8',
              }}
            />
          </span>
          <span className="bar-val">{i.value}</span>
        </div>
      ))}
    </div>
  );
}
