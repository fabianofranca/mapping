// `typeSlots` (stage #1080, SL3, decision 5): the slots of a type with the `accepts` resolved like
// `allowedChildren` (ids and `{ layer, groups? }` clauses) and the `max`; without `slots` on the type,
// every slot of the component accepts everything and has no `max`. Pure: it is what SL4 plugs into the
// drawing cache and into `slotForPlacement`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySpecialization, parseSpec, type Project, type Spec } from '../../src/model';
import { parseComponent } from '../../src/model/components/parseComponent';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { slotForPlacement } from '../../src/model/components/slots';
import { typeSlots } from '../../src/model/specSlots';
import { emptyProject } from './fixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const component = (name: string): ComponentFile => {
  const parsed = parseComponent(
    JSON.parse(readFileSync(`tests/fixtures/slots/components/${name}.json`, 'utf8')),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.component;
};

function specOf(edit?: (bar: Json, spec: Json) => void): Spec {
  const raw: Json = {
    format: 'mapping-spec',
    formatVersion: 17,
    id: 'slots',
    name: 'Slots',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'bar',
            name: 'Bar',
            fields: [{ key: 'title', type: 'string' }],
            slots: [
              { id: 'navigationIcon', name: 'Navigation', accepts: ['pin'], max: 1 },
              {
                id: 'actions',
                accepts: ['pin', { layer: 'content', groups: ['texts'] }],
              },
            ],
          },
          { id: 'pin', name: 'Pin', fields: [] },
        ],
      },
      {
        id: 'content',
        name: 'Content',
        color: '#445566',
        groups: [{ id: 'texts', name: 'Texts' }],
        annotationTypes: [
          { id: 'text', name: 'Text', groups: ['texts'], fields: [] },
          { id: 'image', name: 'Image', fields: [] },
        ],
      },
    ],
  };
  edit?.(raw.layers[0].annotationTypes[0], raw);
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.spec;
}

function projectOf(spec: Spec): Project {
  let n = 0;
  return applySpecialization(emptyProject(), spec, { newId: () => `L${++n}` });
}

const bar = component('bar');

describe('typeSlots', () => {
  it('declared slots: the accepts resolved like allowedChildren (ids and clauses) and the max', () => {
    const p = projectOf(specOf());
    const slots = typeSlots(p, 'slots', 'bar', bar);
    expect(slots.map((s) => s.id)).toEqual(['navigationIcon', 'actions']);
    expect(slots[0]?.accepts).toEqual(new Set(['pin']));
    expect(slots[0]?.max).toBe(1);
    // A clause covers the types of the layer that are in the groups, after the listed id.
    expect(slots[1]?.accepts).toEqual(new Set(['pin', 'text']));
    expect(slots[1]?.max).toBeUndefined();
  });

  it('the name is the declared one, else the label of the slot, else the id', () => {
    const slots = typeSlots(projectOf(specOf()), 'slots', 'bar', bar);
    expect(slots.map((s) => s.name)).toEqual(['Navigation', 'actions']);
    expect(slots[1]).toEqual(expect.objectContaining({ id: 'actions' }));
  });

  it('a clause without groups covers the whole layer', () => {
    const p = projectOf(
      specOf((type) => (type.slots[1].accepts = [{ layer: 'content' }])),
    );
    expect(typeSlots(p, 'slots', 'bar', bar)[1]?.accepts).toEqual(
      new Set(['text', 'image']),
    );
  });

  it('a slot declared without accepts accepts everything (no accepts in the result)', () => {
    const p = projectOf(
      specOf((type) => {
        delete type.slots[0].accepts;
      }),
    );
    const [first] = typeSlots(p, 'slots', 'bar', bar);
    expect(first?.accepts).toBeUndefined();
    expect(first?.max).toBe(1);
  });

  it('a type that declares no slots: every slot of the component accepts everything, with no max', () => {
    const p = projectOf(
      specOf((type) => {
        delete type.slots;
      }),
    );
    const slots = typeSlots(p, 'slots', 'bar', bar);
    expect(slots).toEqual([
      expect.objectContaining({ id: 'navigationIcon', name: 'navigationIcon' }),
      expect.objectContaining({ id: 'actions', name: 'actions' }),
    ]);
    for (const slot of slots) {
      expect(slot.accepts).toBeUndefined();
      expect(slot.max).toBeUndefined();
    }
  });

  it('a slot the type does not declare still accepts everything', () => {
    const p = projectOf(
      specOf((type) => {
        type.slots = [{ id: 'actions', accepts: ['pin'], max: 2 }];
      }),
    );
    const slots = typeSlots(p, 'slots', 'bar', bar);
    expect(slots.map((s) => [s.id, s.accepts, s.max])).toEqual([
      ['navigationIcon', undefined, undefined],
      ['actions', new Set(['pin']), 2],
    ]);
  });

  it('the specialization or the type is not applied: the component slots, accepting everything', () => {
    const p = projectOf(specOf());
    expect(
      typeSlots(p, 'other', 'bar', bar).map((s) => [s.id, s.accepts, s.max]),
    ).toEqual([
      ['navigationIcon', undefined, undefined],
      ['actions', undefined, undefined],
    ]);
    expect(typeSlots(p, 'slots', 'nope', bar)).toHaveLength(2);
  });

  it('a component without slots has none; one with a single slot has one', () => {
    const p = projectOf(specOf());
    expect(typeSlots(p, 'slots', 'pin', component('pin'))).toEqual([]);
    expect(typeSlots(p, 'slots', 'pin', component('rounded-bar'))).toEqual([
      expect.objectContaining({ id: 'content', name: 'content' }),
    ]);
  });

  it('plugs into slotForPlacement: the type decides the slot and the max skips the full one', () => {
    const slots = typeSlots(projectOf(specOf()), 'slots', 'bar', bar);
    expect(slotForPlacement(slots, { typeId: 'text' })).toEqual(
      expect.objectContaining({ ok: true, id: 'actions' }),
    );
    // `pin` is accepted by both; the first that is not full wins.
    const full = new Map([['navigationIcon', 1]]);
    expect(slotForPlacement(slots, { typeId: 'pin', counts: full })).toEqual(
      expect.objectContaining({ ok: true, id: 'actions', basis: 'accepts' }),
    );
  });
});
