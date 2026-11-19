import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  fitComponentSize,
  measureComponentSize,
  setContainerDensity,
  unitsToPixels,
  type ComponentFile,
  type JsonValue,
  type Project,
} from '../../src/model';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';

// `measureComponentSize` (decision 9 of #2089): the size of a component for given values, with no
// marking, in units and in pixels.

const catalog = fitCatalog();
const component = (typeId: string): ComponentFile =>
  catalog.get(FIT_SPEC_ID)!.byType.get(typeId)!;

const measure = (
  p: Project,
  typeId: string,
  extra: {
    values?: Record<string, JsonValue>;
    containerId?: string | null;
    size?: { width?: number; height?: number };
  } = {},
) =>
  measureComponentSize(
    p,
    catalog,
    { specId: FIT_SPEC_ID, typeId, containerId: null, ...extra },
    approximateMeasurer,
  );

describe('measureComponentSize', () => {
  const p = fitProject();

  it('gives the units that fitComponentSize gives with the defaults plus the label', () => {
    const result = measure(p, 'fit-hug', { values: { label: LONG_LABEL } });
    const expected = fitComponentSize(
      component('fit-hug'),
      { label: LONG_LABEL, tall: null },
      { measure: approximateMeasurer },
    )!;
    expect(result.units).toEqual({ width: expected.width, height: expected.height });
    expect(result.follows).toEqual({ width: true, height: true });
    expect(result.density).toBe(1);
    expect(result.pixels).toEqual(result.units);
  });

  it('uses the field defaults when there are no values', () => {
    const a = measure(p, 'fit-hug');
    const b = measure(p, 'fit-hug', { values: { label: 'Ok' } });
    expect(a.units).toEqual(b.units);
  });

  it('size changes the base of a kept axis', () => {
    const wide = measure(p, 'fit-button', {
      values: { label: LONG_LABEL },
      size: { width: 300 },
    });
    const narrow = measure(p, 'fit-button', { values: { label: LONG_LABEL } });
    expect(wide.follows).toEqual({ width: false, height: true });
    expect(wide.units.width).toBe(300);
    expect(narrow.units.width).toBe(120);
    expect(wide.units.height).toBeLessThan(narrow.units.height);
  });

  it('converts to pixels with the container density', () => {
    const dense = setContainerDensity(p, 'I1', 3);
    const result = measure(dense, 'fit-hug', {
      values: { label: LONG_LABEL },
      containerId: 'I1',
    });
    expect(result.density).toBe(3);
    expect(result.pixels).toEqual({
      width: unitsToPixels(result.units.width, 3),
      height: unitsToPixels(result.units.height, 3),
    });
  });

  it('a component that follows nothing gives follows false and the size', () => {
    const result = measure(p, 'fit-plain', { size: { width: 77, height: 33 } });
    expect(result.follows).toEqual({ width: false, height: false });
    expect(result.units).toEqual({ width: 77, height: 33 });
    const nominal = measure(p, 'fit-plain');
    expect(nominal.units).toEqual({ width: 120, height: 40 });
  });

  it('fails unknown-field for a key the type does not have', () => {
    expect(() => measure(p, 'fit-hug', { values: { nope: 'x' } })).toThrow(
      expect.objectContaining({ code: 'unknown-field' }),
    );
  });

  it('fails invalid-value for a refused value', () => {
    expect(() =>
      measure(p, 'fit-hug', { values: { label: 5 as unknown as string } }),
    ).toThrow(expect.objectContaining({ code: 'invalid-value' }));
  });

  it('fails unknown-type and not-found', () => {
    expect(() => measure(p, 'missing')).toThrow(
      expect.objectContaining({ code: 'unknown-type' }),
    );
    expect(() => measure(p, 'fit-hug', { containerId: 'nope' })).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
  });

  it('does not change the project', () => {
    const before = JSON.stringify(p);
    measure(p, 'fit-hug', { values: { label: LONG_LABEL } });
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('measureComponentSize: a table field', () => {
  const p = fitProject();
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Row ${i}` }));

  it('takes the rows from `values` and the height grows with them', () => {
    const none = measure(p, 'fit-list');
    const three = measure(p, 'fit-list', { values: { items: rows(3) } });
    const six = measure(p, 'fit-list', { values: { items: rows(6) } });
    expect(three.units.height).toBeGreaterThan(none.units.height);
    expect(six.units.height).toBeGreaterThan(three.units.height);
  });

  it('a row that is not an object, and a column that is not there, fail', () => {
    expect(() => measure(p, 'fit-list', { values: { items: ['x'] } })).toThrow(
      /invalid-value|not an object/,
    );
    expect(() => measure(p, 'fit-list', { values: { items: [{ nope: 'x' }] } })).toThrow(
      /nope/,
    );
  });
});
