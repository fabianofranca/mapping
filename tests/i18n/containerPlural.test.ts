import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setLocale } from '../../src/store/settings';
import {
  containersCountText,
  markingsCountText,
} from '../../src/ui/perspectiveContentText';

// DS6 (#1468): "1 containers" showed up in the selector, in Manage and in Delete.
describe('containers plural', () => {
  afterEach(() => setLocale('pt-BR'));

  it('one container is singular; the others, plural (pt-BR and en-US)', () => {
    setLocale('pt-BR');
    expect(containersCountText(1)).toBe('1 container');
    expect(containersCountText(3)).toBe('3 containers');
    setLocale('en-US');
    expect(containersCountText(1)).toBe('1 container');
    expect(containersCountText(2)).toBe('2 containers');
    expect(t('perspective.count.containers', { count: 2 })).toBe('2 containers');
  });
});

// DS7 (#1472, finding 1): "1 marcações" showed up in the selector, in Manage and in Delete.
describe('markings plural', () => {
  afterEach(() => setLocale('pt-BR'));

  it('one marking is singular; the others, plural (pt-BR and en-US)', () => {
    setLocale('pt-BR');
    expect(markingsCountText(1)).toBe('1 marcação');
    expect(markingsCountText(4)).toBe('4 marcações');
    setLocale('en-US');
    expect(markingsCountText(1)).toBe('1 marking');
    expect(markingsCountText(2)).toBe('2 markings');
  });
});
