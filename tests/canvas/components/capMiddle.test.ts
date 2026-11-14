// Format 4, FX1: the center by the capital letter height (`verticalAlign: "cap-middle"`) in Konva.
// The font metrics are injected (ascent 10, descent 3, capHeight 8), so the arithmetic is exact.
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { capMiddleShift } from '../../../src/model/components/baseline';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { walk, type Scene } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());
let measureSpy: { mockRestore: () => void } | undefined;
afterEach(() => measureSpy?.mockRestore());

/** ascent 10, descent 3 (the Konva baseline sits at (10−3)/2 + lh/2) and `H` with height 8. */
function injectMetrics(): void {
  measureSpy = vi.spyOn(Konva.Text.prototype, 'measureSize').mockImplementation(function (
    this: Konva.Text,
    text: string,
  ) {
    // The metrics hold for node size 10 and scale with the measured size.
    const k = this.fontSize() / 10;
    return {
      width: text.length * 6,
      fontBoundingBoxAscent: 10 * k,
      fontBoundingBoxDescent: 3 * k,
      actualBoundingBoxAscent: (text === 'H' ? 8 : 9) * k,
      actualBoundingBoxDescent: 0,
    } as unknown as ReturnType<Konva.Text['measureSize']>;
  });
}

function scene(node: Record<string, unknown>, height = 40): Scene {
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height,
          font: {
            size: 10,
            lineHeight: 12,
            family: 'Roboto',
            verticalAlign: 'cap-middle',
          },
          color: '#111111',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, width: 100, height },
    { measure: approximateMeasurer },
  );
  expect([...walk(root)].some((n) => n.type === 'text')).toBe(true);
  return { root, warnings: [] };
}

function texts(s: Scene): Konva.Text[] {
  return renderScene(s).root.find('Text') as Konva.Text[];
}

describe('capMiddleShift (pure arithmetic)', () => {
  it('one line: the center of the capital falls on the center of the box', () => {
    // Natural baseline (top) at 9.5; capital 8: the block occupies [1.5 ; 9.5] and must go to [16 ; 24].
    const shift = capMiddleShift({
      boxHeight: 40,
      capHeight: 8,
      firstBaseline: 9.5,
      lastBaseline: 9.5,
    });
    expect(shift).toBeCloseTo(16 - 1.5, 9);
    // After the shift: capital top = 9.5 + 14.5 − 8 = 16; the baseline, 24.
    expect(9.5 + shift - 8 + 4).toBeCloseTo(20, 9);
  });

  it('the block is from the capital of the first line to the base of the last', () => {
    const shift = capMiddleShift({
      boxHeight: 100,
      capHeight: 8,
      firstBaseline: 9.5,
      lastBaseline: 9.5 + 12 * 2,
    });
    // block = 8 + 24 = 32 → first base at (100 − 32)/2 + 8 = 42.
    expect(9.5 + shift).toBeCloseTo(42, 9);
  });
});

describe('cap-middle on the plain Konva text', () => {
  it('one line: the base falls at (height − capHeight)/2 + capHeight', () => {
    injectMetrics();
    const [text] = texts(scene({ text: 'Ok' }));
    // Konva (top) puts the base at (10 − 3)/2 + 12/2 = 9.5; the desired one is (40 − 8)/2 + 8 = 24.
    expect(text?.verticalAlign()).toBe('top');
    expect(text?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('two lines: the block from the capital to the base of the second is centered', () => {
    injectMetrics();
    // Width 70 / 5.5 per letter: two 10-letter words break into two lines.
    const [text] = texts(scene({ text: 'abcdefghij abcdefghij', width: 70 }, 60));
    expect(text?.textArr).toHaveLength(2);
    // block = 8 + 12; first base at (60 − 20)/2 + 8 = 28.
    expect(text?.y()).toBeCloseTo(28 - 9.5, 9);
  });

  it('maxLines cutting: the center is that of the lines that remain', () => {
    injectMetrics();
    const long = 'abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij';
    const [text] = texts(
      scene(
        {
          text: long,
          font: {
            size: 10,
            lineHeight: 12,
            family: 'Roboto',
            verticalAlign: 'cap-middle',
            maxLines: 1,
          },
        },
        40,
      ),
    );
    expect(text?.height()).toBe(12);
    expect(text?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('middle does not change: it stays the Konva one, without its own shift', () => {
    injectMetrics();
    const [text] = texts(
      scene({
        text: 'Ok',
        font: { size: 10, lineHeight: 12, family: 'Roboto', verticalAlign: 'middle' },
      }),
    );
    expect(text?.verticalAlign()).toBe('middle');
    expect(text?.y()).toBe(0);
  });
});

describe('cap-middle on the runs', () => {
  it('the base of the first line goes to (height − capHeight)/2 + capHeight', () => {
    injectMetrics();
    const [first] = texts(
      scene({ runs: [{ text: 'Valid on ' }, { text: '3 days', weight: 700 }] }),
    );
    // Single line of height 12 at y 0: natural base at 6 + (10 − 3)/2 = 9.5 → goes to 24.
    expect(first?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('two lines of runs: the block goes from the capital of the 1st to the base of the 2nd', () => {
    injectMetrics();
    const runs = [{ text: 'abcdefghij abcdefghij' }];
    const shapes = texts(scene({ runs, width: 70 }, 60));
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    // block = 8 + 12: first base at 28, the second at 40.
    expect(shapes[0]?.y()).toBeCloseTo(28 - 9.5, 9);
    expect(shapes[1]?.y()).toBeCloseTo(40 - 9.5, 9);
  });
});
