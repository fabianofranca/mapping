import { t } from '../../i18n';
import type { Locale } from '../../store/settings';

// Formatting of the review texts that depend on the language (dates and plurals). Stateless
// functions: the components pass the language and "now".

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Short relative date for the proposal list: "today 09:40", "yesterday 18:12" or the date
 * ("06/10"; "06/10/2025" in another year), in the interface language and the device time zone.
 */
export function formatWhen(iso: string, now: Date, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (days === 0) return t('proposals.today', { time });
  if (days === 1) return t('proposals.yesterday', { time });
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Full date and time (hint). */
export function formatFullDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Joins the non-empty parts with " · ". */
export function joinParts(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}
