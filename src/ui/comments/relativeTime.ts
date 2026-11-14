import { t } from '../../i18n';

// Relative time of messages (stage Comments): "now", "2 min ago", "3 h ago", "yesterday", "12/10"
// (day/month in pt-BR, month/day in en-US) and, from another year, with the year. The day follows
// the device's local time. `now` comes in as a parameter for the tests.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(now: Date, then: Date): number {
  return Math.round((dayStart(now) - dayStart(then)) / (24 * HOUR));
}

/** Short text of when `iso` was relative to `now`; empty if `iso` is not a date. */
export function relativeTime(iso: string, now: Date | number = Date.now()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const nowDate = new Date(now);
  const diff = nowDate.getTime() - then.getTime();
  if (diff < MINUTE) return t('thread.time.now');
  const days = dayDiff(nowDate, then);
  if (days <= 0) {
    return diff < HOUR
      ? t('thread.time.minutes', { count: Math.floor(diff / MINUTE) })
      : t('thread.time.hours', { count: Math.floor(diff / HOUR) });
  }
  if (days === 1) return t('thread.time.yesterday');
  const parts = { day: then.getDate(), month: then.getMonth() + 1 };
  if (then.getFullYear() === nowDate.getFullYear()) return t('thread.time.date', parts);
  return t('thread.time.dateYear', { ...parts, year: then.getFullYear() });
}
