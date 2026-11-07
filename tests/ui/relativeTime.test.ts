import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { relativeTime } from '../../src/ui/comments/relativeTime';

// Datas montadas em horário local: o texto "ontem" e a data seguem o dia do dispositivo.
const NOW = new Date(2026, 10, 7, 15, 0, 0); // 7/11/2026 15:00
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  locale.value = 'pt-BR';
});

describe('relativeTime', () => {
  it('menos de um minuto: agora', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('agora');
    expect(relativeTime(NOW.toISOString(), NOW)).toBe('agora');
  });

  it('minutos e horas no mesmo dia', () => {
    expect(relativeTime(ago(2 * MIN), NOW)).toBe('há 2 min');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('há 59 min');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('há 3 h');
  });

  it('o dia anterior vira ontem, mesmo com menos de 24 horas', () => {
    expect(relativeTime(new Date(2026, 10, 6, 23, 0).toISOString(), NOW)).toBe('ontem');
    expect(relativeTime(new Date(2026, 10, 6, 8, 0).toISOString(), NOW)).toBe('ontem');
  });

  it('antes disso: dia/mês, e com o ano quando é de outro ano', () => {
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), NOW)).toBe('12/10');
    expect(relativeTime(new Date(2025, 11, 31, 10, 0).toISOString(), NOW)).toBe(
      '31/12/2025',
    );
  });

  it('em en-US: mês/dia e textos em inglês', () => {
    locale.value = 'en-US';
    expect(relativeTime(ago(2 * MIN), NOW)).toBe('2 min ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 h ago');
    expect(relativeTime(new Date(2026, 10, 6, 8, 0).toISOString(), NOW)).toBe(
      'yesterday',
    );
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), NOW)).toBe('10/12');
  });

  it('hora no futuro (relógio adiantado) vira agora; data inválida devolve vazio', () => {
    expect(relativeTime(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe('agora');
    expect(relativeTime('nada', NOW)).toBe('');
  });
});
