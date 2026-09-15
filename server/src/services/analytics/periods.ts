export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface AnalyticsFilter {
  period: AnalyticsPeriod;
  date?: string; // YYYY-MM-DD (day/week/month) or YYYY (year)
  startDate?: string; // YYYY-MM-DD (custom)
  endDate?: string; // YYYY-MM-DD (custom, inclusive)
}

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface ResolvedPeriod {
  current: PeriodRange;
  previous: PeriodRange;
  timezone: string;
  period: AnalyticsPeriod;
}

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return map;
}

function zonedToUtc(year: number, month1: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month1 - 1, day, 0, 0, 0));
  const parts = zonedParts(guess, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

export function parseYmd(value?: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || '').trim());
  if (!m) {
    const err: any = new Error('A valid date in YYYY-MM-DD format is required.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_ANALYTICS_DATE';
    throw err;
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function parseYm(value?: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec((value || '').trim());
  if (!m) {
    const err: any = new Error('A valid value in YYYY-MM format is required.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_ANALYTICS_DATE';
    throw err;
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function parseY(value?: string): number {
  const m = /^(\d{4})$/.exec((value || '').trim());
  if (!m) {
    const err: any = new Error('A valid year in YYYY format is required.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_ANALYTICS_DATE';
    throw err;
  }
  return Number(m[1]);
}

/** Returns 0=Sunday ... 6=Saturday for an instant in the given timezone. */
export function weekdayInTz(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(asUtc).getUTCDay();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Returns the local YYYY-MM-DD date key for an instant in the given timezone. */
export function dateKeyInTz(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

export function hourInTz(date: Date, timeZone: string): number {
  return zonedParts(date, timeZone).hour;
}

/**
 * Resolves the current and previous equivalent periods for a filter using the
 * restaurant timezone. Week = ISO week (Monday 00:00 to next Monday 00:00).
 */
export function resolveAnalyticsPeriod(filter: AnalyticsFilter, timezone = 'UTC'): ResolvedPeriod {
  const tz = timezone || 'UTC';
  const period = filter.period;

  if (period === 'day') {
    const { year, month, day } = parseYmd(filter.date);
    const start = zonedToUtc(year, month, day, tz);
    const end = zonedToUtc(year, month, day + 1, tz);
    const prevStart = zonedToUtc(year, month, day - 1, tz);
    return { current: { start, end }, previous: { start: prevStart, end: start }, timezone: tz, period };
  }

  if (period === 'week') {
    const { year, month, day } = parseYmd(filter.date);
    const mid = zonedToUtc(year, month, day, tz);
    const dow = weekdayInTz(mid, tz); // 0=Sun..6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    const start = addDays(mid, -daysSinceMonday);
    const end = addDays(start, 7);
    const prevStart = addDays(start, -7);
    return { current: { start, end }, previous: { start: prevStart, end: start }, timezone: tz, period };
  }

  if (period === 'month') {
    const { year, month } = parseYm(filter.date);
    const start = zonedToUtc(year, month, 1, tz);
    const end = zonedToUtc(year, month + 1, 1, tz);
    const prevStart = zonedToUtc(year, month - 1, 1, tz);
    return { current: { start, end }, previous: { start: prevStart, end: start }, timezone: tz, period };
  }

  if (period === 'year') {
    const year = parseY(filter.date);
    const start = zonedToUtc(year, 1, 1, tz);
    const end = zonedToUtc(year + 1, 1, 1, tz);
    const prevStart = zonedToUtc(year - 1, 1, 1, tz);
    return { current: { start, end }, previous: { start: prevStart, end: start }, timezone: tz, period };
  }

  // custom
  const { year: sy, month: sm, day: sd } = parseYmd(filter.startDate);
  const { year: ey, month: em, day: ed } = parseYmd(filter.endDate);
  const start = zonedToUtc(sy, sm, sd, tz);
  const end = zonedToUtc(ey, em, ed + 1, tz);
  if (end <= start) {
    const err: any = new Error('Custom date range end must be after start.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_ANALYTICS_DATE';
    throw err;
  }
  const duration = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - duration);
  return { current: { start, end }, previous: { start: prevStart, end: start }, timezone: tz, period };
}
