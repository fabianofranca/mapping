// Named slots (#1080, SL4, decisions 7 and 10): the drawing cache says which children no slot accepts
// (`slot-not-accepted`) and which go past a slot's `max` (`slot-full`), from the `slots` of the type in
// the project's specialization. Without `slots` on the type there is no issue.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function specOf(edit?: (raw: Json) => void): Spec {
  const raw: Json = JSON.parse(read('slots.spec.json'));
  edit?.(raw);
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

function catalogOf(spec: Spec): ComponentCatalog {
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
}

function projectOf(spec: Spec): Project {
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

const spec = specOf();
const catalog = catalogOf(spec);

function add(
  p: Project,
  cat: ComponentCatalog,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    cat,
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

const draw = (p: Project, cat: ComponentCatalog = catalog) =>
  createDrawingCache()(p, cat, approximateMeasurer, 0);

const bar = (s: Spec = spec, cat: ComponentCatalog = catalog): Project =>
  add(projectOf(s), cat, 'B', 'bar', {
    rect: { x: 100, y: 100, width: 360, height: 56 },
  });

describe('ComponentDrawing.slotIssues', () => {
  it('a child the slots do not accept gets slot-not-accepted, with the slot, the owner type and no max', () => {
    // `rounded-bar` is not in the `accepts` ["pin"] of either slot of the `bar`.
    let p = bar();
    p = add(p, catalog, 'R', 'rounded-bar', {
      parentId: 'B',
      slot: 'actions',
      rect: { x: 400, y: 108, width: 30, height: 30 },
    });
    const issues = draw(p).get('B')!.slotIssues;
    expect(issues).toEqual([
      {
        annotationId: 'A_R',
        code: 'slot-not-accepted',
        slot: { id: 'actions', name: 'Actions' },
        owner: 'Bar',
      },
    ]);
  });

  it('a child beyond the `max` of the slot gets slot-full, with the max', () => {
    // `navigationIcon` takes 1 pin; the second one (in the order of the siblings) is the extra.
    let p = bar();
    p = add(p, catalog, 'P1', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, catalog, 'P2', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    expect(draw(p).get('B')!.slotIssues).toEqual([
      {
        annotationId: 'A_P2',
        code: 'slot-full',
        slot: { id: 'navigationIcon', name: 'Navigation icon' },
        owner: 'Bar',
        max: 1,
      },
    ]);
  });

  it('with children that fit (a pin in each slot), no issue', () => {
    let p = bar();
    p = add(p, catalog, 'NAV', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, catalog, 'ACT', 'pin', { parentId: 'B', slot: 'actions' });
    expect(draw(p).get('B')!.slotIssues).toEqual([]);
  });

  it('a type with no `slots` in the specialization has no issue (every slot accepts everything)', () => {
    const plain = specOf((raw) => {
      delete raw.layers[0].annotationTypes[0].slots;
    });
    const cat = catalogOf(plain);
    let p = bar(plain, cat);
    p = add(p, cat, 'R', 'rounded-bar', {
      parentId: 'B',
      slot: 'actions',
      rect: { x: 400, y: 108, width: 30, height: 30 },
    });
    p = add(p, cat, 'P1', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, cat, 'P2', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    expect(draw(p, cat).get('B')!.slotIssues).toEqual([]);
  });

  it('the cache keeps the same drawing when nothing changes, and re-instantiates when the type`s slots change', () => {
    let p = bar();
    p = add(p, catalog, 'P1', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, catalog, 'P2', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    const cache = createDrawingCache();
    const first = cache(p, catalog, approximateMeasurer, 0).get('B')!;
    expect(cache(p, catalog, approximateMeasurer, 0).get('B')).toBe(first);
    expect(first.slotIssues).toHaveLength(1);
    // The project's specialization now lets `navigationIcon` hold 2: the issue goes away.
    const wider = specOf((raw) => {
      raw.layers[0].annotationTypes[0].slots[0].max = 2;
    });
    const q: Project = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: wider })),
    };
    const after = cache(q, catalog, approximateMeasurer, 0).get('B')!;
    expect(after).not.toBe(first);
    expect(after.slotIssues).toEqual([]);
  });
});
