// AM2 (#2150, review): `measureComponentSize` reports `follows` on the branch the drawing direction picks,
// like the units it gives (`fitComponentSize` reads the direction).
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  measureComponentSize,
  parseSpec,
  setContainerDirection,
  type ComponentCatalog,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'dir',
  name: 'dir',
  size: { width: 120, height: 40 },
  minSize: { width: 10, height: 10 },
  sizing: { width: { $if: { $direction: 'rtl' }, then: 'hug', else: 'fill' } },
  template: {
    type: 'frame',
    layout: { type: 'row', padding: 0 },
    children: [{ type: 'rect', width: 30, height: 20, fill: '#ffffff' }],
  },
};

const parsed = parseSpec({
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'dirspec',
  name: 'Dir',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: [
        { id: 'dir', name: 'dir', component: 'components/dir.json', fields: [] },
      ],
    },
  ],
});
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const spec = parsed.spec;
const loaded = loadSpecComponents(spec, 'specs/dirspec/dirspec.spec.json', 1, () =>
  JSON.stringify(DIR_COMPONENT),
);
if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
const catalog: ComponentCatalog = new Map([['dirspec', loaded]]);

function project(direction: 'ltr' | 'rtl') {
  let p = applySpecialization(emptyProject(), spec, {
    newId: (() => {
      let n = 0;
      return () => `D${++n}`;
    })(),
    packageSpecName: 'dirspec.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 });
  return direction === 'rtl' ? setContainerDirection(p, 'I1', 'rtl') : p;
}

const measure = (direction: 'ltr' | 'rtl') =>
  measureComponentSize(
    project(direction),
    catalog,
    { specId: 'dirspec', typeId: 'dir', containerId: 'I1' },
    approximateMeasurer,
  );

describe('measureComponentSize reads the direction in sizing', () => {
  it('units and follows agree on the branch of the container direction', () => {
    expect(measure('ltr').follows.width).toBe(false);
    expect(measure('ltr').units.width).toBe(120);
    expect(measure('rtl').follows.width).toBe(true);
    expect(measure('rtl').units.width).toBeLessThan(120);
  });
});
