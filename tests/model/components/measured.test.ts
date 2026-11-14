// `measured` origin (stage #747, CF11, decision 29): a tree of measured rectangles becomes
// markings through the `sources` of the types. Pure core, without a platform name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../../src/model';
import { originProblemText, parseOrigins } from '../../../src/model/components/origin';
import { importMeasured } from '../../../src/model/components/measured';
import type { Spec } from '../../../src/model/spec';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function rawSpec(formatVersion = 15, origins: unknown[] = [MEASURED]): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 'ui',
    name: 'UI',
    version: 1,
    origins,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'primary',
            name: 'Primary button',
            sources: [{ system: 'dom', name: 'btn-primary' }],
            fields: [
              {
                key: 'label',
                type: 'string',
                sources: [{ system: 'dom', path: 'label' }],
              },
              {
                key: 'tone',
                type: 'enum',
                options: ['neutral', 'error'],
                default: 'neutral',
                sources: [{ system: 'dom', path: 'tone', values: { danger: 'error' } }],
              },
            ],
          },
          {
            id: 'card',
            name: 'Card',
            sources: [
              { system: 'dom', name: 'card' },
              { system: 'dom', id: 'main' },
            ],
            fields: [],
          },
          {
            id: 'plain',
            name: 'Button',
            sources: [{ system: 'dom', name: 'button' }],
            fields: [],
          },
        ],
      },
    ],
  };
}

const MEASURED = { system: 'dom', name: 'Measured DOM', kind: 'measured' };

function spec(raw: Json = rawSpec()): Spec {
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.spec;
}

const button = {
  type: 'button',
  classes: ['btn-primary'],
  rect: { x: 10, y: 20, width: 120, height: 40 },
  props: { label: 'Save', tone: 'danger' },
  children: [],
};

describe('origins[].kind', () => {
  it('measured is accepted in v15 and dispenses with node and screen', () => {
    expect(parseSpec(rawSpec(15)).ok).toBe(true);
    const { origins, problems } = parseOrigins([MEASURED]);
    expect(problems).toEqual([]);
    expect(origins[0]).toMatchObject({ system: 'dom', kind: 'measured' });
  });

  it('measured in v14 fails with the version message', () => {
    const r = parseSpec(rawSpec(14));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        path: 'origins[0].kind',
        message: 'only allowed with formatVersion 15',
      }),
    );
  });

  it('an unknown kind fails; without kind it stays tree (asks for node and screen)', () => {
    const unknown = parseOrigins([{ system: 'x', kind: 'nope' }]);
    expect(unknown.problems.map(originProblemText).join(' ')).toContain(
      'origins[0].kind',
    );
    const tree = parseOrigins([{ system: 'x' }]);
    expect(tree.problems.map(originProblemText).join(' ')).toContain('origins[0].node');
    expect(tree.problems.map(originProblemText).join(' ')).toContain('origins[0].screen');
  });

  it('measured does not accept node or screen', () => {
    const { problems } = parseOrigins([{ ...MEASURED, node: {}, screen: {} }]);
    expect(problems.map(originProblemText).join(' ')).toContain('origins[0].node');
  });
});

describe('measured origin: parse → write → re-read cycle', () => {
  it('the specialization read and re-written as JSON re-reads without error and without node/screen', () => {
    const first = parseSpec(rawSpec(15));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const written = JSON.parse(JSON.stringify(first.spec)) as Json;
    expect(written.origins[0]).not.toHaveProperty('node');
    expect(written.origins[0]).not.toHaveProperty('screen');
    const again = parseSpec(written);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.spec.origins?.[0]).toMatchObject({ system: 'dom', kind: 'measured' });
  });

  it('the measured library of the examples re-reads after being written', () => {
    const raw = JSON.parse(
      readFileSync(join('examples', 'libraries', 'medido', 'medido.spec.json'), 'utf8'),
    ) as Json;
    const first = parseSpec(raw);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = parseSpec(JSON.parse(JSON.stringify(first.spec)));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(importMeasured([again.spec], { system: 'dom' } as never)).not.toMatchObject({
      error: expect.stringContaining('not declared'),
    });
  });
});

describe('importMeasured: matching', () => {
  it('matches the class with the type name, creates the marking and fills in the fields', () => {
    const r = importMeasured([spec()], { system: 'dom', tree: button });
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.markings).toHaveLength(1);
    expect(r.markings[0]).toMatchObject({
      specId: 'ui',
      typeId: 'primary',
      rect: { x: 10, y: 20, width: 120, height: 40 },
      values: { label: 'Save', tone: 'error' },
    });
  });

  it('the node id matches the source id and beats the class; without class or id, the type applies', () => {
    const r = importMeasured([spec()], {
      system: 'dom',
      tree: {
        type: 'div',
        id: 'main',
        classes: ['btn-primary'],
        rect: { x: 0, y: 0, width: 50, height: 50 },
        children: [{ type: 'button', rect: { x: 1, y: 1, width: 20, height: 10 } }],
      },
    });
    expect(r.markings.map((m) => m.typeId)).toEqual(['card', 'plain']);
  });

  it('a node without a type is ignored with a warning and the children continue', () => {
    const r = importMeasured([spec()], {
      system: 'dom',
      tree: {
        type: 'div',
        classes: ['x-mysterious'],
        rect: { x: 0, y: 0, width: 300, height: 200 },
        children: [button],
      },
    });
    expect(r.markings.map((m) => m.typeId)).toEqual(['primary']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('x-mysterious');
  });

  it('offset and scale multiply and shift the rectangles', () => {
    const r = importMeasured([spec()], {
      system: 'dom',
      tree: button,
      offset: { x: 100, y: 50 },
      scale: 2,
    });
    expect(r.markings[0]!.rect).toEqual({ x: 120, y: 90, width: 240, height: 80 });
  });

  it('empty rectangle becomes a warning; an unknown or non-measured origin becomes an error', () => {
    const empty = importMeasured([spec()], {
      system: 'dom',
      tree: { ...button, rect: { x: 0, y: 0, width: 0, height: 10 } },
    });
    expect(empty.markings).toEqual([]);
    expect(empty.warnings[0]).toContain('empty rectangle');
    expect(importMeasured([spec()], { system: 'zzz', tree: button }).error).toContain(
      'zzz',
    );
    const treeSpec = spec(rawSpec(15, [{ system: 'dom', node: NODE, screen: SCREEN }]));
    expect(importMeasured([treeSpec], { system: 'dom', tree: button }).error).toContain(
      'measured',
    );
  });

  it('a malformed tree becomes an error, without throwing', () => {
    const r = importMeasured([spec()], { system: 'dom', tree: { type: 'x' } });
    expect(r.error).toContain('rect');
  });
});

describe('importMeasured: booleans per specialization', () => {
  function boolSpec(id: string, booleans: { true: string; false: string }): Spec {
    return spec({
      format: 'mapping-spec',
      formatVersion: 15,
      id,
      name: id,
      version: 1,
      origins: [{ ...MEASURED, booleans }],
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [
            {
              id: `${id}-switch`,
              name: `Switch ${id}`,
              sources: [{ system: 'dom', name: `switch-${id}` }],
              fields: [
                {
                  key: 'state',
                  type: 'string',
                  sources: [{ system: 'dom', path: 'checked' }],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  it('two specializations with the same system each use their own booleans', () => {
    const a = boolSpec('a', { true: 'on', false: 'off' });
    const b = boolSpec('b', { true: 'yes', false: 'no' });
    const node = (cls: string, checked: boolean) => ({
      type: 'div',
      classes: [cls],
      rect: { x: 0, y: 0, width: 10, height: 10 },
      props: { checked },
    });
    const r = importMeasured([a, b], {
      system: 'dom',
      tree: {
        type: 'root',
        rect: { x: 0, y: 0, width: 100, height: 100 },
        children: [
          node('switch-a', true),
          node('switch-b', true),
          node('switch-b', false),
        ],
      },
    });
    expect(r.error).toBeUndefined();
    expect(r.markings.map((m) => [m.specId, m.values.state])).toEqual([
      ['a', 'on'],
      ['b', 'yes'],
      ['b', 'no'],
    ]);
  });
});

const NODE = { type: 'type', props: 'props', children: 'children' };
const SCREEN = { width: 100, height: 100, roots: [{ path: 'root' }] };

describe('the core does not know the platform', () => {
  it('the import modules do not mention DOM or views', () => {
    for (const file of ['src/model/components/measured.ts', 'mcp/importMeasured.ts']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8');
      expect(text, file).not.toMatch(/\b(DOM|views)\b/);
    }
  });
});
