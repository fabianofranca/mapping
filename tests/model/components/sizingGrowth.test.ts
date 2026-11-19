// CL2 (review of #2089): the check of the drawing grows only the axis that is short and keeps the growth that
// worked. The shortfalls the instance reports are given by the test as a function of the size, so the growth
// loop is exercised exactly (the text measurer of a real component cannot give an axis its own shortfall).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';

type Size = { width: number; height: number };
let shortfallsFor: (size: Size) => Record<string, number> = () => ({});
const none: Record<string, number> = {};

vi.mock('../../../src/model/components/instantiate', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../src/model/components/instantiate')>();
  return {
    ...original,
    instantiate: (...args: Parameters<typeof original.instantiate>) => {
      const result = original.instantiate(...args);
      const { width, height } = args[2];
      return { ...result, shortfalls: shortfallsFor({ width, height }) };
    },
  };
});

const { approximateMeasurer } = await import('../../../src/model/components/instantiate');
const { fitComponentSize } = await import('../../../src/model/components/sizing');

const button = (extra: Record<string, unknown> = {}): ComponentFile =>
  ({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'b',
    name: 'B',
    size: { width: 100, height: 40 },
    sizing: { width: 'hug', height: 'hug' },
    template: {
      type: 'frame',
      layout: { type: 'row', padding: [8, 16] },
      ...extra,
      children: [
        {
          type: 'text',
          text: { $field: 'label' },
          width: 'hug',
          height: 'hug',
          font: { size: 14, lineHeight: 20 },
        },
      ],
    },
  }) as unknown as ComponentFile;

const fit = (c: ComponentFile) =>
  fitComponentSize(c, { label: 'Confirm' }, { measure: approximateMeasurer }, {});

describe('the check of the drawing grows the short axis only', () => {
  beforeEach(() => {
    shortfallsFor = () => ({});
  });

  it('a hug x hug button short 0.3 px in width grows 1 px in width and none in height', () => {
    const free = fit(button()) as Size;
    shortfallsFor = ({ width }) =>
      width < free.width + 1 ? { 'content larger than the box: frame': 0.3 } : none;
    const fitted = fit(button());
    expect(fitted).toMatchObject({ width: free.width + 1, height: free.height });
  });

  it('the height alone when only the height is short', () => {
    const free = fit(button()) as Size;
    shortfallsFor = ({ height }) =>
      height < free.height + 2 ? { 'content larger than the box: frame': 1.5 } : none;
    expect(fit(button())).toMatchObject({ width: free.width, height: free.height + 2 });
  });

  it('both axes when neither alone ends the shortfall', () => {
    const free = fit(button()) as Size;
    shortfallsFor = ({ width, height }) =>
      width < free.width + 1 || height < free.height + 1
        ? { 'content larger than the box: frame': 1 }
        : none;
    expect(fit(button())).toMatchObject({
      width: free.width + 1,
      height: free.height + 1,
    });
  });
});

describe('the check of the drawing keeps the growth that worked', () => {
  it('another shortfall that no growth removes does not undo it', () => {
    const free = fit(button()) as Size;
    shortfallsFor = ({ width }) => ({
      'content larger than the box: frame': Math.max(0, free.width + 3 - width),
      'text larger than the box: other': 2,
    });
    const fitted = fit(button()) as Size;
    expect(fitted.width).toBeGreaterThan(free.width);
  });
});
