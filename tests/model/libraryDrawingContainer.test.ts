// CX4 (#2039, decision 19 of #1901): the drawing proof runs a component that reads `$container.<set>` once per
// class of each set it reads (the sum, not the product) plus the pass without a container; a warning that only a
// class gives cites it (`container window=expanded`).
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'k.spec.json';

const WINDOW = {
  id: 'window',
  name: 'Window',
  by: 'width',
  classes: [
    { id: 'compact', name: 'Compact', below: 600 },
    { id: 'medium', name: 'Medium', below: 840 },
    { id: 'expanded', name: 'Expanded' },
  ],
};
const PLATFORM = {
  id: 'platform',
  name: 'Platform',
  classes: [
    { id: 'android', name: 'Android' },
    { id: 'web', name: 'Web' },
  ],
};

/** A row with an 11-character text: 10 px fits in 100, 20 px does not (as in the modes test). */
const component = (fontSize: unknown): Raw => ({
  format: 'mapping-component',
  formatVersion: 4,
  id: 'k',
  name: 'K',
  size: { width: 100, height: 50 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'text',
        name: 'label',
        text: 'Hello world',
        font: { family: 'Roboto', size: fontSize, weight: 400, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
});

const spec = (sets: unknown[], extra: Raw = {}): Raw => ({
  format: 'mapping-spec',
  formatVersion: 21,
  id: 'k',
  name: 'K',
  version: 1,
  containerClasses: sets,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        { id: 't', name: 'T', component: 'components/k.json', fields: [], ...extra },
      ],
    },
  ],
});

function warnings(fontSize: unknown, sets: unknown[] = [WINDOW, PLATFORM]) {
  const report = validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(sets)) },
      { path: 'components/k.json', text: JSON.stringify(component(fontSize)) },
    ],
  });
  return report.warnings.map((w) => w.message);
}

const BY_WINDOW = {
  $switch: '$container.window',
  cases: { compact: 10, medium: 10, expanded: 20 },
  default: 10,
};

describe('drawing proof per container class (CX4)', () => {
  it('a case that only does not fit in the expanded class cites container window=expanded', () => {
    const found = warnings(BY_WINDOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('container window=expanded');
    expect(found[0]).toContain('content larger than the box');
  });

  it('a warning that every class gives (and the pass without a container) comes out once, plain', () => {
    const found = warnings({
      $switch: '$container.window',
      cases: { compact: 20, medium: 20, expanded: 20 },
      default: 20,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).not.toContain('container window');
  });

  it('a component that reads no container runs the same passes as before (no class in the message)', () => {
    expect(warnings(10)).toEqual([]);
    expect(warnings(20).every((m) => !m.includes('container'))).toBe(true);
  });

  it('proves each class of each set it reads: the sum, not the product', () => {
    const fontSize = {
      $switch: '$container.window',
      cases: { compact: 10, medium: 10, expanded: 10 },
      default: {
        $switch: '$container.platform',
        cases: { web: 20 },
        default: 10,
      },
    };
    // The window set is always present in its passes: only the pass "no container" falls to the nested default,
    // and the platform passes have no window class either, so they all fall to the nested switch.
    const found = warnings(fontSize);
    // `platform=web` is a pass of its own (window empty); `android` fits; window passes fit.
    expect(found.some((m) => m.includes('container platform=web'))).toBe(true);
    expect(found.some((m) => m.includes('container platform=android'))).toBe(false);
    expect(found.some((m) => m.includes('container window='))).toBe(false);
  });

  it('a chosen set declared by the specialization is proved per class too', () => {
    const found = warnings(
      { $switch: '$container.platform', cases: { web: 20 }, default: 10 },
      [PLATFORM],
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('container platform=web');
  });

  it('the pass without a container runs with width and height empty (the default branch)', () => {
    // No set is read: only `$container.width`. The only pass is the one without a container.
    const found = warnings({ $field: '$container.width', default: 20 });
    expect(found).toHaveLength(1);
    expect(found[0]).not.toContain('container');
  });
});
