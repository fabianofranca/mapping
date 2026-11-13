// Origem `measured` (etapa #747, CF11, decisão 29): uma árvore de retângulos medidos vira
// marcações pelas `sources` dos tipos. Núcleo puro, sem nome de plataforma.
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
            name: 'Botão primário',
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
            name: 'Cartão',
            sources: [
              { system: 'dom', name: 'card' },
              { system: 'dom', id: 'main' },
            ],
            fields: [],
          },
          {
            id: 'plain',
            name: 'Botão',
            sources: [{ system: 'dom', name: 'button' }],
            fields: [],
          },
        ],
      },
    ],
  };
}

const MEASURED = { system: 'dom', name: 'DOM medido', kind: 'measured' };

function spec(raw: Json = rawSpec()): Spec {
  const parsed = parseSpec(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.spec;
}

const button = {
  type: 'button',
  classes: ['btn-primary'],
  rect: { x: 10, y: 20, width: 120, height: 40 },
  props: { label: 'Salvar', tone: 'danger' },
  children: [],
};

describe('origins[].kind', () => {
  it('measured é aceita na v15 e dispensa node e screen', () => {
    expect(parseSpec(rawSpec(15)).ok).toBe(true);
    const { origins, problems } = parseOrigins([MEASURED]);
    expect(problems).toEqual([]);
    expect(origins[0]).toMatchObject({ system: 'dom', kind: 'measured' });
  });

  it('measured na v14 falha com a mensagem de versão', () => {
    const r = parseSpec(rawSpec(14));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        path: 'origins[0].kind',
        message: 'só é permitido com formatVersion 15',
      }),
    );
  });

  it('kind desconhecido falha; sem kind segue tree (pede node e screen)', () => {
    const unknown = parseOrigins([{ system: 'x', kind: 'nope' }]);
    expect(unknown.problems.map(originProblemText).join(' ')).toContain(
      'origins[0].kind',
    );
    const tree = parseOrigins([{ system: 'x' }]);
    expect(tree.problems.map(originProblemText).join(' ')).toContain('origins[0].node');
    expect(tree.problems.map(originProblemText).join(' ')).toContain('origins[0].screen');
  });

  it('measured não aceita node nem screen', () => {
    const { problems } = parseOrigins([{ ...MEASURED, node: {}, screen: {} }]);
    expect(problems.map(originProblemText).join(' ')).toContain('origins[0].node');
  });
});

describe('origem measured: ciclo parse → gravação → releitura', () => {
  it('a especialização lida e regravada em JSON relê sem erro e sem node/screen', () => {
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

  it('a biblioteca medido dos exemplos relê depois de gravada', () => {
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
      error: expect.stringContaining('não declarada'),
    });
  });
});

describe('importMeasured: casamento', () => {
  it('casa a classe com o name do tipo, cria a marcação e preenche os campos', () => {
    const r = importMeasured([spec()], { system: 'dom', tree: button });
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.markings).toHaveLength(1);
    expect(r.markings[0]).toMatchObject({
      specId: 'ui',
      typeId: 'primary',
      rect: { x: 10, y: 20, width: 120, height: 40 },
      values: { label: 'Salvar', tone: 'error' },
    });
  });

  it('o id do nó casa com o id da source e vence a classe; sem classe nem id, vale o type', () => {
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

  it('nó sem tipo é ignorado com aviso e os filhos seguem', () => {
    const r = importMeasured([spec()], {
      system: 'dom',
      tree: {
        type: 'div',
        classes: ['x-misterioso'],
        rect: { x: 0, y: 0, width: 300, height: 200 },
        children: [button],
      },
    });
    expect(r.markings.map((m) => m.typeId)).toEqual(['primary']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('x-misterioso');
  });

  it('offset e scale multiplicam e deslocam os retângulos', () => {
    const r = importMeasured([spec()], {
      system: 'dom',
      tree: button,
      offset: { x: 100, y: 50 },
      scale: 2,
    });
    expect(r.markings[0]!.rect).toEqual({ x: 120, y: 90, width: 240, height: 80 });
  });

  it('retângulo vazio vira aviso; origem desconhecida ou não measured vira erro', () => {
    const empty = importMeasured([spec()], {
      system: 'dom',
      tree: { ...button, rect: { x: 0, y: 0, width: 0, height: 10 } },
    });
    expect(empty.markings).toEqual([]);
    expect(empty.warnings[0]).toContain('retângulo vazio');
    expect(importMeasured([spec()], { system: 'zzz', tree: button }).error).toContain(
      'zzz',
    );
    const treeSpec = spec(rawSpec(15, [{ system: 'dom', node: NODE, screen: SCREEN }]));
    expect(importMeasured([treeSpec], { system: 'dom', tree: button }).error).toContain(
      'measured',
    );
  });

  it('árvore malformada vira erro, sem lançar', () => {
    const r = importMeasured([spec()], { system: 'dom', tree: { type: 'x' } });
    expect(r.error).toContain('rect');
  });
});

describe('importMeasured: booleans por especialização', () => {
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

  it('duas especializações com o mesmo system usam cada uma os próprios booleans', () => {
    const a = boolSpec('a', { true: 'sim', false: 'não' });
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
      ['a', 'sim'],
      ['b', 'yes'],
      ['b', 'no'],
    ]);
  });
});

const NODE = { type: 'type', props: 'props', children: 'children' };
const SCREEN = { width: 100, height: 100, roots: [{ path: 'root' }] };

describe('o núcleo não conhece plataforma', () => {
  it('os módulos da importação não citam DOM nem views', () => {
    for (const file of ['src/model/components/measured.ts', 'mcp/importMeasured.ts']) {
      const text = readFileSync(join(process.cwd(), file), 'utf8');
      expect(text, file).not.toMatch(/\b(DOM|views)\b/);
    }
  });
});
