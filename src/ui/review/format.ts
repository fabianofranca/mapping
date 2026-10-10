import { t } from '../../i18n';
import type { Locale } from '../../store/settings';

// Formatação dos textos da revisão que dependem do idioma (datas e plurais). Funções sem
// estado: os componentes passam o idioma e "agora".

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Data relativa e curta da lista de propostas: "hoje 09:40", "ontem 18:12" ou a data
 * ("06/10"; "06/10/2025" em outro ano), no idioma da interface e no fuso do dispositivo.
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

/** Data e hora completas (dica). */
export function formatFullDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Junta as partes não vazias com " · ". */
export function joinParts(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}
