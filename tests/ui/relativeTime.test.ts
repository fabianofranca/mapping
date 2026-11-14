import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { relativeTime } from '../../src/ui/comments/relativeTime';

// Dates built in local time: the "yesterday" text and the date follow the device's day.
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

// pt-BR kept: the object of most tests is the pt-BR relative-time text (and the en-US one in one test)
describe('relativeTime (pt-BR)', () => {
  it('less than a minute: now', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('agora');
    expect(relativeTime(NOW.toISOString(), NOW)).toBe('agora');
  });

  it('minutes and hours on the same day', () => {
    // pt-BR kept: pt-BR relative-time text is the object
    expect(relativeTime(ago(2 * MIN), NOW)).toBe('há 2 min');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('há 59 min');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('há 3 h');
  });

  it('the previous day becomes yesterday, even with less than 24 hours', () => {
    expect(relativeTime(new Date(2026, 10, 6, 23, 0).toISOString(), NOW)).toBe('ontem');
    expect(relativeTime(new Date(2026, 10, 6, 8, 0).toISOString(), NOW)).toBe('ontem');
  });

  it('before that: day/month, and with the year when it is from another year', () => {
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), NOW)).toBe('12/10');
    expect(relativeTime(new Date(2025, 11, 31, 10, 0).toISOString(), NOW)).toBe(
      '31/12/2025',
    );
  });

  it('in en-US: month/day and English texts', () => {
    locale.value = 'en-US';
    expect(relativeTime(ago(2 * MIN), NOW)).toBe('2 min ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 h ago');
    expect(relativeTime(new Date(2026, 10, 6, 8, 0).toISOString(), NOW)).toBe(
      'yesterday',
    );
    expect(relativeTime(new Date(2026, 9, 12, 10, 0).toISOString(), NOW)).toBe('10/12');
  });

  it('a time in the future (clock ahead) becomes now; an invalid date returns empty', () => {
    expect(relativeTime(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe('agora');
    expect(relativeTime('nada', NOW)).toBe('');
  });
});
