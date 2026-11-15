// Named slots (#1080, SL4, decision 5): `componentPlacement` hands the `accepts` and the `max` of the type
// to `slotForPlacement`, so a new child with no slot asked for goes to the first slot that accepts it and is
// not full. The app passes its drawings; the MCP batch does not: both choose the same slot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  componentPlacement,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

const spec = (() => {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
})();

const catalog: ComponentCatalog = (() => {
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

function baseProject(): Project {
  let n = 0;
  const p = applySpecialization(emptyProject(), spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'slots.spec.json',
  });
  return addContainer(p, {
    id: 'I1',
    file: 'images/screen.png',
    width: 1000,
    height: 800,
  });
}

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

const bar = (): Project =>
  add(baseProject(), 'B', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });

const place = (
  p: Project,
  typeId: string,
  slot: string | undefined,
  withDrawings: boolean,
): Rect =>
  componentPlacement(
    p,
    catalog,
    {
      containerId: 'I1',
      parentId: 'B',
      slot,
      specId: SPEC_ID,
      typeId,
      ...(withDrawings
        ? { drawings: createDrawingCache()(p, catalog, approximateMeasurer, 0) }
        : {}),
    },
    approximateMeasurer,
  );

const centerX = (r: Rect): number => r.x + r.width / 2;
/** The slot the geometry puts a rectangle in: `navigationIcon` is on the left of the bar, `actions` on the right. */
const side = (r: Rect): 'navigationIcon' | 'actions' =>
  centerX(r) < 100 + 120 ? 'navigationIcon' : 'actions';

describe.each([true, false])(
  'componentPlacement with accepts and max (drawings: %s)',
  (withDrawings) => {
    it('the first pin goes to the first slot that accepts it', () => {
      expect(side(place(bar(), 'pin', undefined, withDrawings))).toBe('navigationIcon');
    });

    it('the second pin skips `navigationIcon` (max 1, full) and goes to `actions`', () => {
      const p = add(bar(), 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
      expect(side(place(p, 'pin', undefined, withDrawings))).toBe('actions');
    });

    it('a slot asked for wins, even if it is full', () => {
      const p = add(bar(), 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
      expect(side(place(p, 'pin', 'navigationIcon', withDrawings))).toBe(
        'navigationIcon',
      );
    });

    it('a type no slot accepts goes to the first slot (the issue says what does not match)', () => {
      expect(side(place(bar(), 'rounded-bar', undefined, withDrawings))).toBe(
        'navigationIcon',
      );
    });
  },
);

it('the app and the MCP batch place the same rectangle', () => {
  const p = add(bar(), 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
  expect(place(p, 'pin', undefined, true)).toEqual(place(p, 'pin', undefined, false));
});
