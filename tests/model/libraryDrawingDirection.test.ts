// R1 (#1096): the drawing proof runs each case in ltr and in rtl; a warning that only appears in rtl is
// reported like today's (with the prefix "in rtl"); those that apply in both come out once.
import { describe, expect, it } from 'vitest';
import { isDirectionSensitive } from '../../src/model/components/direction';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, unknown>;

const SPEC_PATH = 'dir.spec.json';

function validate(template: Raw, formatVersion = 4) {
  const comp = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'dir',
    name: 'Dir',
    size: { width: 100, height: 40 },
    template,
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion,
    id: 'dir',
    name: 'Dir',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 'dir', name: 'Dir', component: 'components/dir.json', fields: [] },
        ],
      },
    ],
  };
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec) },
      { path: 'components/dir.json', text: JSON.stringify(comp) },
    ],
  });
}

const rect = (name: string, width: number, extra: Raw = {}): Raw => ({
  type: 'rect',
  name,
  width,
  height: 10,
  fill: '#000000',
  ...extra,
});

const frame = (children: Raw[]): Raw => ({
  type: 'frame',
  name: 'root',
  layout: { type: 'row' },
  children,
});

describe('drawing proof in both directions', () => {
  it('a healthy component produces nothing extra', () => {
    const report = validate(frame([rect('a', 30), rect('b', 30)]));
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('a warning that applies in both directions comes out only once', () => {
    const report = validate(frame([rect('a', 80), rect('b', 80)]));
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.filter((m) => m.includes('content larger than the box'))).toHaveLength(
      texts.length,
    );
    expect(texts.some((m) => m.includes('rtl'))).toBe(false);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('a component that overflows only in rtl is reported, with "in rtl"', () => {
    const report = validate(
      frame([rect('a', 30), rect('wide', 300, { visible: { $direction: 'rtl' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
    // the same component without the condition overflows in both: a plain warning, without "in rtl"
    const both = validate(frame([rect('a', 30), rect('wide', 300)]));
    const bothTexts = [...both.errors, ...both.warnings].map((i) => i.message);
    expect(bothTexts.length).toBeGreaterThan(0);
    expect(bothTexts.some((m) => m.includes('in rtl'))).toBe(false);
  });

  it('a warning that only appears in ltr is not new in rtl (nothing "in rtl")', () => {
    const report = validate(
      frame([rect('a', 30), rect('wide', 300, { visible: { $direction: 'ltr' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((m) => m.includes('in rtl'))).toBe(false);
  });
});

// The `rtl` pass doubles the cost of the proof, so it only runs on a component that can yield a new
// warning: one that talks about direction (`direction`, `$direction`) or mirrors (`mirror`). In the others `rtl`
// is the exact mirror of `ltr` (same sizes; the `approximateMeasurer` ignores direction), and a
// new warning is impossible.
describe('the rtl proof only runs on a direction-sensitive component', () => {
  it('a component with neither direction nor mirror is not proven in rtl', () => {
    expect(isDirectionSensitive(frame([rect('a', 30), rect('b', 30)]))).toBe(false);
  });

  it('`$direction` in a condition requires the rtl proof', () => {
    expect(
      isDirectionSensitive(frame([rect('a', 30, { visible: { $direction: 'rtl' } })])),
    ).toBe(true);
  });

  it('`direction` on a node requires the rtl proof', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { direction: 'ltr' })]))).toBe(true);
  });

  it('`mirror` requires the rtl proof', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { mirror: true })]))).toBe(true);
  });

  it('`mirror: false` and the `direction` of `repeat` (row/column) do not require it', () => {
    expect(isDirectionSensitive(frame([rect('a', 30, { mirror: false })]))).toBe(false);
    expect(
      isDirectionSensitive({
        type: 'repeat',
        name: 'r',
        direction: 'row',
        children: [rect('a', 30)],
      }),
    ).toBe(false);
  });

  it('a logical anchor (`start`/`end`) requires the rtl proof', () => {
    expect(
      isDirectionSensitive(frame([rect('a', 30, { anchors: { right: 20, start: 5 } })])),
    ).toBe(true);
    expect(
      isDirectionSensitive(frame([rect('a', 30, { anchors: { left: 5, right: 20 } })])),
    ).toBe(false);
  });

  it('what overflows only in rtl due to a logical anchor with a physical one is reported', () => {
    // In `ltr` the `start` (left) with the `right` stretch the bar to 75 px, which fits; in `rtl` the
    // `start` becomes the right, loses to the physical `right` and the declared width (300) applies again.
    const report = validate({
      type: 'frame',
      name: 'root',
      layout: { type: 'none' },
      children: [rect('bar', 300, { anchors: { right: 20, start: 5 } })],
    });
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
  });

  it('the sensitive component is still proven in both directions', () => {
    const report = validate(
      frame([rect('a', 30), rect('wide', 300, { visible: { $direction: 'rtl' } })]),
    );
    const texts = [...report.errors, ...report.warnings].map((i) => i.message);
    expect(texts.every((m) => m.includes('in rtl'))).toBe(true);
  });
});
