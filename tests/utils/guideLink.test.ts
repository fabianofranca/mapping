import { describe, expect, it } from 'vitest';
import { GUIDE_PATH, guideUrl } from '../../src/utils/guideLink';

describe('guideUrl', () => {
  it('is relative to the page: works at the site root, in /preview/ and in vite dev', () => {
    expect(GUIDE_PATH).toBe('guide/index.html');
    expect(guideUrl('https:')).toBe(GUIDE_PATH);
    expect(guideUrl('http:')).toBe(GUIDE_PATH);
  });

  it('opened as a standalone file there is no link (the guide/ folder is not next to it)', () => {
    expect(guideUrl('file:')).toBeNull();
  });
});
