// Component font stack: the family that goes to the canvas and the validity of the value (CSS).
import { describe, expect, it } from 'vitest';
import {
  canvasFontFamily,
  isValidFontFamily,
} from '../../../src/model/components/fontFamily';

const STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

describe('canvasFontFamily', () => {
  it('a stack passes as it came', () => {
    expect(canvasFontFamily(STACK)).toBe(STACK);
    expect(canvasFontFamily('Roboto, serif')).toBe('Roboto, serif');
  });

  it('a quoted name passes as it came, with sans-serif at the end', () => {
    expect(canvasFontFamily('"Segoe UI"')).toBe('"Segoe UI", sans-serif');
    expect(canvasFontFamily("'Segoe UI'")).toBe("'Segoe UI', sans-serif");
  });

  it('a lone generic name stays unquoted, in any case', () => {
    expect(canvasFontFamily('system-ui')).toBe('system-ui');
    expect(canvasFontFamily('MONOSPACE')).toBe('MONOSPACE');
    expect(canvasFontFamily('ui-rounded')).toBe('ui-rounded');
  });

  it('a simple name becomes a quoted name, as before', () => {
    expect(canvasFontFamily('Roboto')).toBe('"Roboto", sans-serif');
    expect(canvasFontFamily('Segoe UI')).toBe('"Segoe UI", sans-serif');
  });

  it('an invalid value falls to sans-serif', () => {
    expect(canvasFontFamily('"Segoe UI, Roboto')).toBe('sans-serif');
    expect(canvasFontFamily('')).toBe('sans-serif');
  });
});

describe('isValidFontFamily', () => {
  it('accepts name, quoted name, generic and stack', () => {
    expect(isValidFontFamily('Roboto')).toBe(true);
    expect(isValidFontFamily('"Segoe UI"')).toBe(true);
    expect(isValidFontFamily("'Segoe UI'")).toBe(true);
    expect(isValidFontFamily('system-ui')).toBe(true);
    expect(isValidFontFamily(STACK)).toBe(true);
  });

  it('rejects an unclosed quote, an empty item, a quote in the middle of the name and empty', () => {
    expect(isValidFontFamily('"Segoe UI, Roboto')).toBe(false);
    expect(isValidFontFamily('Roboto, , serif')).toBe(false);
    expect(isValidFontFamily('Seg"oe')).toBe(false);
    expect(isValidFontFamily('')).toBe(false);
    expect(isValidFontFamily('   ')).toBe(false);
    expect(isValidFontFamily('Roboto,')).toBe(false);
  });
});
