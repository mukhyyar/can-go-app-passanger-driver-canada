const MONTHS_OK = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DateRange = { start: Date; end: Date };

export type ResolvedRange = {
  timezone: string;
  range: string;
  current: DateRange;
  previous: DateRange;
  previousYear: DateRange;
  currentLabel: string;
  previousLabel: string;
  compareLabel: string;
};

export type CompareMode = 'none' | 'period' | 'year';

export function zonedParts(
  date: Date,
  timeZone: string,
): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
  };
}

/** Instant for y-m-d h:min in `timeZone`. */
export function fromZoned(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0);
  const parts = zonedParts(new Date(utcGuess), timeZone);
  const asIf = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.min, parts.s);
  return new Date(utcGuess - (asIf - utcGuess));
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return fromZoned(p.y, p.m, p.d, 0, 0, timeZone);
}

export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const utc = Date.UTC(p.y, p.m - 1, p.d + days, 0, 0, 0);
  const shifted = new Date(utc);
  const q = zonedParts(shifted, 'UTC');
  return fromZoned(q.y, q.m, q.d, 0, 0, timeZone);
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function formatDay(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const mon = MONTHS_OK[p.m - 1];
  return `${mon} ${p.d}`;
}

export function formatRangeLabel(start: Date, endExclusive: Date, timeZone: string): string {
  const endIncl = new Date(endExclusive.getTime() - 1);
  const a = zonedParts(start, timeZone);
  const b = zonedParts(endIncl, timeZone);
  const sameYear = a.y === b.y;
  const left = `${MONTHS_OK[a.m - 1]} ${a.d}${sameYear ? '' : `, ${a.y}`}`;
  const right = `${MONTHS_OK[b.m - 1]} ${b.d}, ${b.y}`;
  return `${left} – ${right}`;
}

export function isoDay(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function weekdayIndex(date: Date, timeZone: string): number {
  // 0 = Monday … 6 = Sunday for heatmaps
  const p = zonedParts(date, timeZone);
  const utc = Date.UTC(p.y, p.m - 1, p.d);
  const sun0 = new Date(utc).getUTCDay(); // 0 Sun
  return (sun0 + 6) % 7;
}

const RANGE_KEYS = new Set([
  'today',
  'yesterday',
  '7d',
  '30d',
  '90d',
  'this_week',
  'this_month',
  'prev_month',
  'this_quarter',
  'this_year',
  'custom',
]);

export function resolveAnalyticsRange(opts: {
  range?: string;
  from?: string;
  to?: string;
  timezone?: string;
  now?: Date;
}): ResolvedRange {
  const timezone = opts.timezone && opts.timezone.length > 0 ? opts.timezone : 'America/Toronto';
  const now = opts.now ?? new Date();
  const range = RANGE_KEYS.has(opts.range ?? '') ? (opts.range as string) : '7d';
  const todayStart = startOfZonedDay(now, timezone);
  const tomorrow = addZonedDays(todayStart, 1, timezone);
  const p = zonedParts(now, timezone);

  let start: Date;
  let end: Date;

  if (range === 'custom' && opts.from) {
    const from = parseIsoDate(opts.from, timezone);
    const to = opts.to ? parseIsoDate(opts.to, timezone) : todayStart;
    start = from;
    end = addZonedDays(to, 1, timezone);
  } else {
    switch (range) {
      case 'today':
        start = todayStart;
        end = now;
        break;
      case 'yesterday':
        start = addZonedDays(todayStart, -1, timezone);
        end = todayStart;
        break;
      case 'this_week': {
        const monOffset = weekdayIndex(todayStart, timezone);
        start = addZonedDays(todayStart, -monOffset, timezone);
        end = now;
        break;
      }
      case 'this_month':
        start = fromZoned(p.y, p.m, 1, 0, 0, timezone);
        end = now;
        break;
      case 'prev_month': {
        const pm = p.m === 1 ? 12 : p.m - 1;
        const py = p.m === 1 ? p.y - 1 : p.y;
        start = fromZoned(py, pm, 1, 0, 0, timezone);
        end = fromZoned(p.y, p.m, 1, 0, 0, timezone);
        break;
      }
      case 'this_quarter': {
        const qStartMonth = Math.floor((p.m - 1) / 3) * 3 + 1;
        start = fromZoned(p.y, qStartMonth, 1, 0, 0, timezone);
        end = now;
        break;
      }
      case 'this_year':
        start = fromZoned(p.y, 1, 1, 0, 0, timezone);
        end = now;
        break;
      case '90d':
        start = addZonedDays(todayStart, -89, timezone);
        end = now;
        break;
      case '30d':
        start = addZonedDays(todayStart, -29, timezone);
        end = now;
        break;
      case '7d':
      default:
        start = addZonedDays(todayStart, -6, timezone);
        end = now;
        break;
    }
  }

  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 24 * 3600_000);
  }

  const duration = end.getTime() - start.getTime();
  const previous: DateRange = {
    start: new Date(start.getTime() - duration),
    end: start,
  };
  const previousYear: DateRange = {
    start: fromZoned(p.y - 1, zonedParts(start, timezone).m, zonedParts(start, timezone).d, 0, 0, timezone),
    end: fromZoned(
      zonedParts(end, timezone).y - 1,
      zonedParts(new Date(end.getTime() - 1), timezone).m,
      Math.min(
        zonedParts(new Date(end.getTime() - 1), timezone).d + 1,
        lastDayOfMonth(
          zonedParts(end, timezone).y - 1,
          zonedParts(new Date(end.getTime() - 1), timezone).m,
        ),
      ),
      0,
      0,
      timezone,
    ),
  };

  const currentLabel = formatRangeLabel(start, end, timezone);
  const previousLabel = formatRangeLabel(previous.start, previous.end, timezone);
  return {
    timezone,
    range,
    current: { start, end },
    previous,
    previousYear,
    currentLabel,
    previousLabel,
    compareLabel: `${currentLabel} vs ${previousLabel}`,
  };
}

export function parseIsoDate(iso: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return startOfZonedDay(new Date(iso), timeZone);
  return fromZoned(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, timeZone);
}

export function iterateDays(start: Date, end: Date, timeZone: string): string[] {
  const days: string[] = [];
  let cursor = startOfZonedDay(start, timeZone);
  const endDay = startOfZonedDay(new Date(end.getTime() - 1), timeZone);
  while (cursor.getTime() <= endDay.getTime() && days.length < 400) {
    days.push(isoDay(cursor, timeZone));
    cursor = addZonedDays(cursor, 1, timeZone);
  }
  return days;
}

export function pgTz(tz: string): string {
  return tz.replace(/'/g, '');
}
