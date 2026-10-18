import { describe, expect, it } from 'vitest';
import { GUIDE_PATH, guideUrl } from '../../src/utils/guideLink';

describe('guideUrl', () => {
  it('é relativo à página: vale na raiz do site, em /preview/ e no vite dev', () => {
    expect(GUIDE_PATH).toBe('guia/index.html');
    expect(guideUrl('https:')).toBe(GUIDE_PATH);
    expect(guideUrl('http:')).toBe(GUIDE_PATH);
  });

  it('aberto como arquivo avulso não há link (a pasta guia/ não está ao lado)', () => {
    expect(guideUrl('file:')).toBeNull();
  });
});
