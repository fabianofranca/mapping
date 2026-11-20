// The shared anchor helpers (stage #1893, AM1): the root `anchor` read once (`fileAnchorDefaults`
// → `componentAnchorDefaults` over `resolveMarkingAnchor`), the one `$anchor.*` builder
// (`instanceAnchorOf`) and the one "does not fit" warning (`outsideWarning`).
import { describe, expect, it } from 'vitest';
import { outsideWarning, resolveMarkingAnchor } from '../../src/model/anchorPlacement';
import { anchorValues } from '../../src/model/componentValues';
import {
  componentAnchorDefaults,
  fileAnchorDefaults,
} from '../../src/model/components/anchor';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { instanceAnchorOf } from '../../src/model/drawingMode';

/** Only `anchor` is read by the helpers under test. */
const fileWith = (anchor?: unknown): ComponentFile =>
  ({
    format: 'mapping-component',
    id: 'c',
    ...(anchor === undefined ? {} : { anchor }),
  }) as never;

const ROOT_ANCHORS: readonly [string, unknown][] = [
  ['no root anchor', undefined],
  ['an empty root anchor', {}],
  ['a full root anchor', { side: 'end', align: 'start', offset: { main: 6, cross: -2 } }],
  ['an offset with only `cross`', { offset: { cross: 3 } }],
  ['only a side', { side: 'bottom' }],
];

describe('componentAnchorDefaults', () => {
  for (const density of [1, 2, 3.5]) {
    for (const [name, anchor] of ROOT_ANCHORS) {
      it(`equals resolveMarkingAnchor over fileAnchorDefaults: ${name}, density ${density}`, () => {
        const file = fileWith(anchor);
        expect(componentAnchorDefaults(file, density)).toEqual(
          resolveMarkingAnchor({}, fileAnchorDefaults(file), density),
        );
      });
    }
  }

  it('applies the `top`/`center`/0 defaults only through resolveMarkingAnchor', () => {
    expect(componentAnchorDefaults(fileWith(), 2)).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 0, cross: 0 },
    });
  });
});

describe('fileAnchorDefaults', () => {
  it('is undefined without a root anchor and carries only what the file declares', () => {
    expect(fileAnchorDefaults(fileWith())).toBeUndefined();
    expect(fileAnchorDefaults(fileWith({}))).toEqual({});
    expect(fileAnchorDefaults(fileWith({ side: 'end', offset: { cross: 3 } }))).toEqual({
      side: 'end',
      offset: { main: 0, cross: 3 },
    });
  });
});

describe('outsideWarning', () => {
  it('gives the code, the params and the text of the arrange.outside message', () => {
    expect(outsideWarning('Tip', 'Card')).toEqual({
      code: 'arrange.outside',
      params: { label: 'Tip', where: 'Card' },
      text: 'Tip: does not fit in Card',
    });
  });
});

describe('instanceAnchorOf', () => {
  const rect = { x: 40, y: 80, width: 100, height: 30 };
  const anchorRect = { x: 10, y: 20, width: 60, height: 40 };

  for (const density of [1, 2]) {
    for (const [name, anchor] of ROOT_ANCHORS) {
      for (const side of [undefined, 'start'] as const) {
        it(`equals the old anchorValues call: ${name}, side ${side ?? 'default'}, density ${density}`, () => {
          const component = fileWith(anchor);
          expect(
            instanceAnchorOf({ rect, anchorRect, side, component, density }),
          ).toEqual(
            anchorValues({
              rect,
              anchorRect,
              side,
              defaults: componentAnchorDefaults(component, density),
              density,
            }),
          );
        });
      }
    }
  }

  it('takes the stored side, else the component default', () => {
    const component = fileWith({ side: 'end' });
    const input = { rect, anchorRect, component, density: 1 };
    expect(instanceAnchorOf({ ...input, side: undefined }).side).toBe('end');
    expect(instanceAnchorOf({ ...input, side: 'bottom' }).side).toBe('bottom');
  });
});
