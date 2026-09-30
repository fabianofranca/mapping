import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../../src/utils/platform';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0';

describe('detectPlatform', () => {
  it('reconhece iPhone e Android', () => {
    expect(detectPlatform(IPHONE, 5)).toBe('ios');
    expect(detectPlatform(ANDROID, 5)).toBe('android');
  });

  it('reconhece iPad que se apresenta como Mac (tem toque)', () => {
    expect(detectPlatform(MAC, 5)).toBe('ios');
  });

  it('Mac e Windows de verdade são "other"', () => {
    expect(detectPlatform(MAC, 0)).toBe('other');
    expect(detectPlatform(WINDOWS, 0)).toBe('other');
  });
});
