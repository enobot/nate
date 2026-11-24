const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** 1450 -> "$14.50" */
export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

/** 0.0775 -> "7.75%" */
export function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(3))}%`;
}

/**
 * Theater-local times come from the API without an offset ("2026-03-03T19:00:00").
 * They are formatted as wall-clock values, so the browser's own time zone never shifts them.
 */
function wallClock(local: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local);
  if (!match) {
    return new Date(Number.NaN);
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const dayNumberFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "2026-03-03T19:00:00" -> "7:00 PM" */
export const formatTime = (local: string) => timeFormat.format(wallClock(local));

/** "2026-03-03" or a local date-time -> "Tue, Mar 3" */
export const formatDay = (local: string) => dayFormat.format(wallClock(local));

/** -> "Tuesday, March 3" */
export const formatLongDay = (local: string) => longDayFormat.format(wallClock(local));

/** -> "Tue, Mar 3 · 7:00 PM" */
export const formatDayTime = (local: string) => `${formatDay(local)} · ${formatTime(local)}`;

export const formatWeekday = (local: string) => weekdayFormat.format(wallClock(local));
export const formatMonthDay = (local: string) => dayNumberFormat.format(wallClock(local));

/** The date part of a theater-local date-time: "2026-03-03T19:00:00" -> "2026-03-03" */
export const localDateKey = (local: string) => local.slice(0, 10);

/** UTC timestamps (with "Z") are shown in the viewer's own time zone. */
export function formatTimestamp(utc: string): string {
  return new Date(utc).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

/** 312000 -> "5:12" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Adds days to a "yyyy-MM-dd" string. */
export function addDays(date: string, days: number): string {
  const d = wallClock(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in the viewer's time zone as "yyyy-MM-dd". */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
