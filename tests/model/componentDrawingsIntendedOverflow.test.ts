// OV1 (decision 4 of #2913): `childOverflow: "intended"` on a slot keeps the child markings past the slot's
// box out of the drawing's overflow. The slot's other checks (`slot-full`, `slot-not-accepted`) stay.
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
  slotOverflowKey,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_FILE = 'specs/slots/slots.spec.json';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

type Json = Record<string, unknown>;

/** The fixture's `bar`, with `childOverflow` on the slots named in `flagged`. */
function barText(flagged: readonly string[]): string {
  const bar = JSON.parse(read('components/bar.json')) as Json;
  const template = bar.template as { children: Json[] };
  for (const node of template.children)
    if (node.type === 'slot' && flagged.includes(String(node.id)))
      node.childOverflow = 'intended';
  return JSON.stringify(bar);
}

function catalogOf(flagged: readonly string[]): ComponentCatalog {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      id === 'bar' ? barText(flagged) : read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(parsed.spec, SPEC_FILE, 1, (path) => texts.get(path));
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

function baseProject(): Project {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  const p = applySpecialization(emptyProject(), parsed.spec, {
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

const draw = (p: Project, cat: ComponentCatalog) =>
  createDrawingCache()(p, cat, approximateMeasurer, 0);

/** A bar with a pin 40 × 52 in the fixed 40 × 40 `navigationIcon` slot. */
function tallPins(cat: ComponentCatalog): Project {
  let p = add(baseProject(), cat, 'B', 'bar', {
    rect: { x: 0, y: 0, width: 360, height: 56 },
  });
  p = add(p, cat, 'NAV', 'pin', {
    parentId: 'B',
    slot: 'navigationIcon',
    rect: { x: 8, y: 2, width: 40, height: 52 },
  });
  return p;
}

describe('childOverflow on a slot', () => {
  it('without the key a child past the slot gives the shortfall (the existing behavior)', () => {
    const bar = draw(tallPins(catalogOf([])), catalogOf([])).get('B')!;
    expect(Object.keys(bar.shortfalls)).toEqual([slotOverflowKey('navigationIcon')]);
    expect(bar.overflow).toBe(true);
  });

  it('with the key the same child gives overflow false and no slot shortfall', () => {
    const cat = catalogOf(['navigationIcon']);
    const bar = draw(tallPins(cat), cat).get('B')!;
    expect(bar.shortfalls).toEqual({});
    expect(bar.overflow).toBe(false);
  });

  it('the key on one slot does not quiet the other', () => {
    const cat = catalogOf(['actions']);
    const bar = draw(tallPins(cat), cat).get('B')!;
    expect(Object.keys(bar.shortfalls)).toEqual([slotOverflowKey('navigationIcon')]);
  });

  it('slot-full still comes for a child past the slot max', () => {
    const cat = catalogOf(['navigationIcon']);
    let p = add(baseProject(), cat, 'B', 'bar', {
      rect: { x: 100, y: 100, width: 360, height: 56 },
    });
    p = add(p, cat, 'P1', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    p = add(p, cat, 'P2', 'pin', { parentId: 'B', slot: 'navigationIcon' });
    expect(
      draw(p, cat)
        .get('B')!
        .slotIssues.map((i) => i.code),
    ).toEqual(['slot-full']);
  });

  it('slot-not-accepted still comes for a child the slot does not accept', () => {
    const cat = catalogOf(['navigationIcon']);
    let p = add(baseProject(), cat, 'B', 'bar', {
      rect: { x: 0, y: 0, width: 360, height: 56 },
    });
    p = add(p, cat, 'RB', 'rounded-bar', {
      parentId: 'B',
      slot: 'navigationIcon',
      rect: { x: 8, y: 2, width: 40, height: 52 },
    });
    const bar = draw(p, cat).get('B')!;
    expect(bar.slotIssues.map((i) => i.code)).toContain('slot-not-accepted');
    expect(bar.shortfalls).toEqual({});
  });
});
