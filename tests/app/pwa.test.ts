import { describe, expect, it } from 'vitest';
import { canRegisterServiceWorker } from '../../src/app/pwa';

describe('canRegisterServiceWorker', () => {
  it('only registers on https and with browser support', () => {
    expect(canRegisterServiceWorker('https:', { serviceWorker: {} })).toBe(true);
    expect(canRegisterServiceWorker('file:', { serviceWorker: {} })).toBe(false);
    expect(canRegisterServiceWorker('http:', { serviceWorker: {} })).toBe(false);
    expect(canRegisterServiceWorker('https:', {})).toBe(false);
  });
});
