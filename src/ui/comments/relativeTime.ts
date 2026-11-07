import { t } from '../../i18n';

// Hora relativa das mensagens (etapa Comentários): "agora", "há 2 min", "há 3 h", "ontem",
// "12/10" (dia/mês em pt-BR, mês/dia em en-US) e, de outro ano, com o ano. O dia segue o
// horário local do dispositivo. `now` entra por parâmetro para os testes.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(now: Date, then: Date): number {
  return Math.round((dayStart(now) - dayStart(then)) / (24 * HOUR));
}

/** Texto curto de quando foi `iso` em relação a `now`; vazio se `iso` não é uma data. */
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
