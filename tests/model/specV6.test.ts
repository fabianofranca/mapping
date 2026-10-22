import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MAX_BLANK_SIZE, parseSpec, type SpecIssue } from '../../src/model';

// Especialização formatVersion 6 (etapa Container): `containers` na raiz, os presets do
// diálogo Novo container. v1 a v5 seguem como estavam e recusam a chave.

const read = (path: string): string => readFileSync(path, 'utf8');
const sdui = read('tests/fixtures/sdui-v2.json');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PHONE = { id: 'phone', name: 'Celular', width: 360, height: 800 };

function withContainers(containers: unknown, formatVersion = 6): Json {
  const spec = JSON.parse(sdui) as Json;
  spec.formatVersion = formatVersion;
  spec.containers = containers;
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('era para falhar');
  return result.issues;
}

describe('formatVersion 6: containers', () => {
  it('presets válidos passam no zod e no JSON Schema e sobrevivem à leitura', () => {
    const containers = [
      PHONE,
      { ...PHONE, id: 'tablet', width: 800, background: '#eeeeee' },
    ];
    const spec = withContainers(containers);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const result = parseSpec(spec);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(result.spec.containers).toEqual(containers);
  });

  it('a v5 continua aceita sem containers', () => {
    const spec = JSON.parse(sdui) as Json;
    spec.formatVersion = 5;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('antes da v6 a chave é erro no caminho exato', () => {
    for (const version of [2, 5]) {
      const issues = issuesOf(withContainers([PHONE], version));
      expect(issues.map((i) => [i.path, i.message])).toContainEqual([
        'containers',
        'só é permitido com formatVersion 6',
      ]);
    }
  });

  it('id repetido é erro no id do segundo', () => {
    const issues = issuesOf(withContainers([PHONE, { ...PHONE, name: 'Outro' }]));
    expect(issues.map((i) => [i.path, i.message])).toContainEqual([
      'containers[1].id',
      'id "phone" repetido',
    ]);
  });

  it.each([
    ['id fora do formato', { ...PHONE, id: 'Celular 1' }, 'containers[0].id'],
    ['nome vazio', { ...PHONE, name: '' }, 'containers[0].name'],
    ['largura zero', { ...PHONE, width: 0 }, 'containers[0].width'],
    [
      'altura acima do limite',
      { ...PHONE, height: MAX_BLANK_SIZE + 1 },
      'containers[0].height',
    ],
    ['largura fracionada', { ...PHONE, width: 10.5 }, 'containers[0].width'],
    ['fundo inválido', { ...PHONE, background: 'azul' }, 'containers[0].background'],
  ])('rejeita: %s', (_name, container, path) => {
    const spec = withContainers([container]);
    expect(issuesOf(spec).some((i) => i.path === path)).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('aceita os limites 1 e MAX_BLANK_SIZE', () => {
    const spec = withContainers([{ ...PHONE, width: 1, height: MAX_BLANK_SIZE }]);
    expect(parseSpec(spec).ok).toBe(true);
  });
});
