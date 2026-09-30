import { describe, expect, it } from 'vitest';
import { canRegisterServiceWorker } from '../../src/app/pwa';

describe('canRegisterServiceWorker', () => {
  it('só registra em https e com suporte do navegador', () => {
    expect(canRegisterServiceWorker('https:', { serviceWorker: {} })).toBe(true);
    expect(canRegisterServiceWorker('file:', { serviceWorker: {} })).toBe(false);
    expect(canRegisterServiceWorker('http:', { serviceWorker: {} })).toBe(false);
    expect(canRegisterServiceWorker('https:', {})).toBe(false);
  });
});
