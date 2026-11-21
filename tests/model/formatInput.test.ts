// The projection a format plugin receives (stage #1923, FP2, decision 13): `buildFormatInput`, pure,
// built from the project and the format's specialization only.
import { describe, expect, it } from 'vitest';
import {
  FORMAT_INPUT_KEYS,
  FORMAT_PLUGIN_CONTRACT,
  addBackgroundContainer,
  addTypedAnnotation,
  buildFormatInput,
  createMarking,
  createPage,
  type FormatInput,
  type Project,
} from '../../src/model';
import { FORMAT_SPEC_ID, formatProject, formatSpec } from './formatFixtures';
import { layerOf } from './specFixtures';

const NAME = 'shop';
const m = (code: string) => `mapping://${NAME}/m/${code}`;
const i = (code: string) => `mapping://${NAME}/i/${code}`;
const a = (code: string) => `mapping://${NAME}/a/${code}`;

const build = (p: Project, format = 'data-model/openapi', extra = {}): FormatInput =>
  buildFormatInput(p, format, { projectName: NAME, ...extra });

/** The fixture plus a container `C3` on page "Second" with a class annotation `A6`. */
function withThirdContainer(p: Project): Project {
  let q = createPage(p, { id: 'PG2', name: 'Second' });
  q = addBackgroundContainer(q, {
    id: 'C3',
    name: 'Third',
    width: 300,
    height: 200,
    background: '#FAFAFA',
    pageId: 'PG2',
  });
  q = createMarking(q, {
    id: 'M6',
    containerId: 'C3',
    rect: { x: 0, y: 0, width: 100, height: 100 },
  });
  return addTypedAnnotation(q, {
    id: 'A6',
    markingId: 'M6',
    layerId: layerOf(q, FORMAT_SPEC_ID, 'classes'),
    type: { specId: FORMAT_SPEC_ID, typeId: 'class' },
    name: 'Third class',
  });
}

describe('buildFormatInput: the envelope', () => {
  it('carries the contract, the format, the specialization and the project name', () => {
    const input = build(formatProject());
    expect(input.contract).toBe(FORMAT_PLUGIN_CONTRACT);
    expect(input.format).toEqual({
      ref: 'data-model/openapi',
      id: 'openapi',
      specId: 'data-model',
      name: 'OpenAPI',
      extension: 'yaml',
      scope: 'project',
    });
    expect(input.specialization).toEqual(formatSpec);
    expect(input.project).toEqual({ name: NAME });
    expect(input.target).toBeNull();
  });

  it('has exactly the top-level keys of the contract, in order', () => {
    expect(Object.keys(build(formatProject()))).toEqual([...FORMAT_INPUT_KEYS]);
  });

  it('fails with not-found for a format the project does not know', () => {
    expect(() => build(formatProject(), 'data-model/nope')).toThrow(/not-found/);
    expect(() => build(formatProject(), 'ghost/openapi')).toThrow(/not-found/);
  });
});

describe('buildFormatInput: what enters', () => {
  it("keeps only the format's own specialization: another specialization and a free layer are left out", () => {
    const input = build(formatProject());
    expect(input.annotations.map((x) => x.ref)).toEqual([
      a('a1'),
      a('a3'),
      a('a4'),
      a('a5'),
    ]);
    // M5 holds only `other/note` and a free annotation: neither it nor its container enters.
    expect(input.markings.map((x) => x.ref)).toEqual([m('m1'), m('m3'), m('m4')]);
    expect(input.containers.map((x) => x.ref)).toEqual([i('c1')]);
  });

  it('describes a container with its page name, size, background and source', () => {
    const p = withThirdContainer(formatProject());
    const input = build(p);
    expect(input.containers).toEqual([
      {
        ref: i('c1'),
        code: 'c1',
        name: 'Main',
        page: 'Page 1',
        width: 800,
        height: 600,
        background: '#FFFFFF',
        source: null,
      },
      {
        ref: i('c3'),
        code: 'c3',
        name: 'Third',
        page: 'Second',
        width: 300,
        height: 200,
        background: '#FAFAFA',
        source: null,
      },
    ]);
  });

  it('`parent` is the nearest included ancestor: it skips a marking that is not included', () => {
    const input = build(formatProject());
    const byRef = new Map(input.markings.map((x) => [x.ref, x]));
    // M3 sits in M2 (only a free annotation, so not included), which sits in M1.
    expect(byRef.get(m('m3'))!.parent).toBe(m('m1'));
    expect(byRef.get(m('m1'))!.parent).toBeNull();
    expect(byRef.get(m('m4'))!.parent).toBeNull();
  });

  it('describes a marking: container, rectangle, name, anchor and source', () => {
    const input = build(formatProject());
    expect(input.markings[1]).toEqual({
      ref: m('m3'),
      code: 'm3',
      container: i('c1'),
      parent: m('m1'),
      rect: { x: 20, y: 20, width: 50, height: 50 },
      name: 'Account box',
      slot: null,
      anchor: null,
      source: null,
    });
  });

  it('`slot` is the slot of the mother that holds the child, as get_marking reports it', () => {
    const drawings = new Map([
      [
        'M2',
        {
          slots: [
            { id: 'actions', name: 'Actions' },
            { id: '', name: 'Default' },
          ],
          slotOf: new Map<string, string | null>([['M3', 'actions']]),
        },
      ],
    ]);
    const input = build(formatProject(), 'data-model/openapi', { drawings });
    const bySlot = new Map(input.markings.map((x) => [x.ref, x.slot]));
    expect(bySlot.get(m('m3'))).toEqual({ id: 'actions', name: 'Actions' });
    expect(bySlot.get(m('m1'))).toBeNull();
  });

  it('`slot` is null when no slot receives the child or the slot has no id', () => {
    const noSlot = new Map([
      [
        'M2',
        {
          slots: [{ id: 'actions', name: 'Actions' }],
          slotOf: new Map<string, string | null>([['M3', null]]),
        },
      ],
    ]);
    const noId = new Map([
      [
        'M2',
        {
          slots: [{ id: '', name: 'Default' }],
          slotOf: new Map<string, string | null>([['M3', '']]),
        },
      ],
    ]);
    for (const drawings of [noSlot, noId]) {
      const input = build(formatProject(), 'data-model/openapi', { drawings });
      expect(input.markings.find((x) => x.ref === m('m3'))!.slot).toBeNull();
    }
  });
});

describe('buildFormatInput: annotations and arrows', () => {
  it('`values` holds the non-table fields, a `ref` field as the target reference', () => {
    const input = build(formatProject());
    const a3 = input.annotations.find((x) => x.ref === a('a3'))!;
    expect(a3).toMatchObject({
      code: 'a3',
      host: m('m3'),
      type: 'class',
      layer: 'classes',
      name: 'Account',
      owner: null,
      role: null,
    });
    expect(a3.values).toEqual({ name: 'Account', version: 1, parent: a('a4') });
    // An empty `ref` field is `null`.
    const a1 = input.annotations.find((x) => x.ref === a('a1'))!;
    expect(a1.values.parent).toBeNull();
    expect(a1.rows).toEqual({ attributes: [] });
  });

  it('`rows` holds each table field as `{ ref, values }`, with a `ref` column as a reference', () => {
    const input = build(formatProject());
    const a3 = input.annotations.find((x) => x.ref === a('a3'))!;
    expect(a3.rows).toEqual({
      attributes: [
        {
          ref: `${a('a3')}/f/attributes/r/r1`,
          values: { name: 'owner', type: 'Session', of: a('a4') },
        },
        {
          ref: `${a('a3')}/f/attributes/r/r2`,
          values: { name: 'id', type: 'String', of: null },
        },
      ],
    });
    expect(a3.values).not.toHaveProperty('attributes');
  });

  it('an annotation on an arrow has the arrow as its `host`, and the arrow is listed', () => {
    const input = build(formatProject());
    const a5 = input.annotations.find((x) => x.ref === a('a5'))!;
    expect(a5.host).toBe(m('r1'));
    expect(input.arrows).toEqual([
      { ref: m('r1'), code: 'r1', from: m('m1'), to: m('m4'), name: null },
    ]);
  });
});

describe('buildFormatInput: scope', () => {
  it('scope `container` keeps only the target container', () => {
    const p = withThirdContainer(formatProject());
    const csv = build(p, 'data-model/csv', { target: 'C3' });
    expect(csv.format.scope).toBe('container');
    expect(csv.target).toEqual({ container: i('c3') });
    expect(csv.containers.map((x) => x.ref)).toEqual([i('c3')]);
    expect(csv.markings.map((x) => x.ref)).toEqual([m('m6')]);
    expect(csv.annotations.map((x) => x.ref)).toEqual([a('a6')]);
    expect(csv.arrows).toEqual([]);
    const main = build(p, 'data-model/csv', { target: 'C1' });
    expect(main.markings.map((x) => x.ref)).toEqual([m('m1'), m('m3'), m('m4')]);
    expect(main.arrows.map((x) => x.ref)).toEqual([m('r1')]);
  });

  it('scope `container` needs a target that exists; scope `project` ignores it', () => {
    const p = withThirdContainer(formatProject());
    expect(() => build(p, 'data-model/csv')).toThrow();
    expect(() => build(p, 'data-model/csv', { target: 'nope' })).toThrow(/not-found/);
    const whole = build(p, 'data-model/openapi', { target: 'C3' });
    expect(whole.target).toBeNull();
    expect(whole.containers).toHaveLength(2);
  });
});

describe('buildFormatInput: determinism', () => {
  it('gives the same JSON twice for the same project', () => {
    const p = withThirdContainer(formatProject());
    expect(JSON.stringify(build(p))).toBe(JSON.stringify(build(p)));
  });

  it('keeps the order of the project, whatever the order the items were added in', () => {
    const input = build(withThirdContainer(formatProject()));
    expect(input.markings.map((x) => x.code)).toEqual(['m1', 'm3', 'm4', 'm6']);
    expect(input.annotations.map((x) => x.code)).toEqual(['a1', 'a3', 'a4', 'a5', 'a6']);
  });
});
