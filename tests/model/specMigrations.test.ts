import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, type Spec, type SpecIssue } from '../../src/model';

// `migrations` da especialização formatVersion 4: só as regras estruturais, que um arquivo
// sozinho confere (versões, `from` único, chaves por `op`, lado novo existente, lado antigo
// ausente, `default` do `fill-field`). Quais quebras uma migração cobre é do `diffSpecs`.

const read = (path: string): string => readFileSync(path, 'utf8');
const jsonSchema = JSON.parse(read('docs/spec.schema.json')) as Record<string, unknown>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Versão 3 do pacote: Button (label, style enum, size number, when date, rows table) e Badge
 * (text). Sem migrações; cada teste monta a sua.
 */
function base(): Json {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lib',
    name: 'Lib',
    version: 3,
    layers: [
      {
        id: 'c',
        name: 'Componentes',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'style', type: 'enum', options: ['primary', 'text'] },
              { key: 'size', type: 'number' },
              { key: 'when', type: 'date' },
              { key: 'rows', type: 'table', columns: [{ key: 'col', type: 'string' }] },
            ],
          },
          { id: 'badge', name: 'Badge', fields: [{ key: 'text', type: 'string' }] },
        ],
      },
    ],
  };
}

/** `base()` com uma migração de 1 para 2 com estes passos. */
function withSteps(...steps: Json[]): Json {
  const spec = base();
  spec.migrations = [{ from: 1, to: 2, steps }];
  return spec;
}

function issuesOf(spec: Json): SpecIssue[] {
  const result = parseSpec(spec);
  if (result.ok) throw new Error('era para falhar');
  return result.issues;
}

function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual({ path, message });
}

function expectIssuePath(spec: Json, path: string): void {
  const paths = issuesOf(spec).map((i) => i.path);
  expect(paths, paths.join(' | ')).toContain(path);
}

const M0 = 'migrations[0]';

describe('migrations: o que é aceito', () => {
  it('os seis passos, em migrações encadeadas', () => {
    const spec = base();
    spec.migrations = [
      {
        from: 1,
        to: 2,
        steps: [
          { op: 'rename-type', from: 'chip', to: 'badge' },
          { op: 'rename-field', type: 'button', from: 'texto', to: 'label' },
          { op: 'remove-field', type: 'badge', field: 'color' },
          {
            op: 'map-values',
            type: 'button',
            field: 'style',
            values: { filled: 'primary' },
          },
          { op: 'fill-field', type: 'button', field: 'size', default: 12 },
        ],
      },
      {
        from: 2,
        to: 3,
        steps: [
          { op: 'remove-type', type: 'old', mode: 'convert' },
          { op: 'remove-type', type: 'older', mode: 'delete' },
        ],
      },
    ];
    const result = parseSpec(spec);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const migrations = (result.ok ? result.spec : ({} as Spec)).migrations;
    expect(migrations).toHaveLength(2);
    expect(migrations?.[1]?.steps[1]).toEqual({
      op: 'remove-type',
      type: 'older',
      mode: 'delete',
    });
  });

  it('uma migração que salta várias versões (de 1 a 3)', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 3;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('fill-field com default de cada tipo de campo', () => {
    for (const [field, value] of [
      ['label', 'Sem nome'],
      ['size', 0],
      ['when', '2026-01-31'],
      ['style', 'text'],
    ] as const) {
      const spec = withSteps({ op: 'fill-field', type: 'button', field, default: value });
      expect(parseSpec(spec).ok, field).toBe(true);
    }
  });

  it('sem migrations é como antes', () => {
    expect(parseSpec(base()).ok).toBe(true);
  });
});

describe('migrations: versões', () => {
  it('from menor que 1', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].from = 0;
    expectIssue(spec, `${M0}.from`, 'deve ser >= 1');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each(['from', 'to'])('%s não inteiro', (key) => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0][key] = 1.5;
    expectIssue(spec, `${M0}.${key}`, 'deve ser inteiro');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('to que não é maior que from', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 1;
    expectIssue(spec, `${M0}.to`, 'deve ser maior que "from" (1)');
    spec.migrations[0].from = 2;
    spec.migrations[0].to = 1;
    expectIssue(spec, `${M0}.to`, 'deve ser maior que "from" (2)');
  });

  it('to além da version do pacote', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 4;
    expectIssue(spec, `${M0}.to`, 'não pode passar de "version" (3)');
  });

  it('to igual à version é aceito', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].to = 3;
    expect(parseSpec(spec).ok).toBe(true);
  });

  it('from repetido', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations.push({
      from: 1,
      to: 3,
      steps: [{ op: 'remove-type', type: 'older', mode: 'delete' }],
    });
    expectIssue(
      spec,
      'migrations[1].from',
      'já existe uma migração a partir da versão 1',
    );
  });

  it('steps vazia', () => {
    const spec = withSteps();
    expectIssue(spec, `${M0}.steps`, 'não pode ser vazia');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('chave de migração desconhecida', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.migrations[0].note = 'x';
    expectIssue(spec, M0, 'Unrecognized key: "note"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('migrations: chaves por op', () => {
  it('op desconhecido', () => {
    const spec = withSteps({ op: 'drop-type', type: 'x' });
    expectIssue(
      spec,
      `${M0}.steps[0].op`,
      '"op" inválido; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values" ou "fill-field"',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('passo sem op', () => {
    const spec = withSteps({ type: 'x' });
    expectIssuePath(spec, `${M0}.steps[0].op`);
  });

  it.each([
    ['rename-type', { from: 'a', to: 'badge' }],
    ['remove-type', { type: 'old', mode: 'delete' }],
    ['rename-field', { type: 'button', from: 'texto', to: 'label' }],
    ['remove-field', { type: 'badge', field: 'color' }],
    ['map-values', { type: 'button', field: 'style', values: { a: 'primary' } }],
    ['fill-field', { type: 'button', field: 'size', default: 1 }],
  ])('%s recusa chave desconhecida', (op, keys) => {
    const spec = withSteps({ op, ...keys, extra: 1 });
    expectIssue(spec, `${M0}.steps[0]`, 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it.each([
    ['rename-type', { from: 'a', to: 'badge' }, 'to'],
    ['remove-type', { type: 'old', mode: 'delete' }, 'type'],
    ['rename-field', { type: 'button', from: 'texto', to: 'label' }, 'from'],
    ['remove-field', { type: 'badge', field: 'color' }, 'field'],
    [
      'map-values',
      { type: 'button', field: 'style', values: { a: 'primary' } },
      'values',
    ],
    ['fill-field', { type: 'button', field: 'size', default: 1 }, 'default'],
  ])('%s sem a chave %s', (op, keys, missing) => {
    const step: Json = { op, ...keys };
    delete step[missing];
    const spec = withSteps(step);
    expectIssuePath(spec, `${M0}.steps[0].${missing}`);
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('remove-type com mode inválido', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'drop' });
    expectIssue(spec, `${M0}.steps[0].mode`, 'use "convert" ou "delete"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('fill-field com default que não é texto nem número', () => {
    const spec = withSteps({
      op: 'fill-field',
      type: 'button',
      field: 'size',
      default: true,
    });
    expectIssue(spec, `${M0}.steps[0].default`, 'deve ser texto ou número');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });

  it('nomes vazios', () => {
    const spec = withSteps({ op: 'remove-field', type: '', field: 'color' });
    expectIssue(spec, `${M0}.steps[0].type`, 'não pode ser vazio');
  });

  it('map-values com destino vazio', () => {
    const spec = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'style',
      values: { filled: '' },
    });
    expectIssue(spec, `${M0}.steps[0].values.filled`, 'não pode ser vazio');
  });
});

describe('migrations: o lado novo existe nesta versão', () => {
  it('rename-type.to é um tipo daqui', () => {
    const ok = withSteps({ op: 'rename-type', from: 'chip', to: 'badge' });
    expect(parseSpec(ok).ok).toBe(true);
    const spec = withSteps({ op: 'rename-type', from: 'chip', to: 'tag' });
    expectIssue(spec, `${M0}.steps[0].to`, 'tipo "tag" não existe nesta versão');
  });

  it.each(['rename-field', 'remove-field', 'map-values', 'fill-field'])(
    '%s: o tipo precisa existir',
    (op) => {
      const step: Json =
        op === 'rename-field'
          ? { op, type: 'ghost', from: 'a', to: 'b' }
          : op === 'remove-field'
            ? { op, type: 'ghost', field: 'a' }
            : op === 'map-values'
              ? { op, type: 'ghost', field: 'a', values: { x: 'y' } }
              : { op, type: 'ghost', field: 'a', default: 1 };
      expectIssue(
        withSteps(step),
        `${M0}.steps[0].type`,
        'tipo "ghost" não existe nesta versão',
      );
    },
  );

  it('rename-field.to é um campo do tipo', () => {
    const ok = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'texto',
      to: 'label',
    });
    expect(parseSpec(ok).ok).toBe(true);
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'texto',
      to: 'rotulo',
    });
    expectIssue(spec, `${M0}.steps[0].to`, '"rotulo" não é um campo do tipo "button"');
  });

  it('rename-field.to não vale para coluna de table', () => {
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'texto',
      to: 'col',
    });
    expectIssue(spec, `${M0}.steps[0].to`, '"col" não é um campo do tipo "button"');
  });

  it('map-values: o campo existe e é enum', () => {
    const missing = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'cor',
      values: { a: 'primary' },
    });
    expectIssue(missing, `${M0}.steps[0].field`, '"cor" não é um campo do tipo "button"');
    const notEnum = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'label',
      values: { a: 'x' },
    });
    expectIssue(
      notEnum,
      `${M0}.steps[0].field`,
      '"label" deve ser um campo enum do tipo',
    );
  });

  it('map-values: os destinos estão nas options do campo', () => {
    const spec = withSteps({
      op: 'map-values',
      type: 'button',
      field: 'style',
      values: { filled: 'primary', plain: 'secondary' },
    });
    expectIssue(spec, `${M0}.steps[0].values.plain`, '"secondary" não está nas options');
    expect(issuesOf(spec).filter((i) => i.path.endsWith('values.filled'))).toEqual([]);
  });

  it('fill-field: o campo existe', () => {
    const spec = withSteps({
      op: 'fill-field',
      type: 'button',
      field: 'cor',
      default: 'x',
    });
    expectIssue(spec, `${M0}.steps[0].field`, '"cor" não é um campo do tipo "button"');
  });

  it.each([
    ['label', 5, 'deve ser texto'],
    ['size', 'doze', 'deve ser número'],
    ['when', '2026-02-30', 'deve ser uma data AAAA-MM-DD válida'],
    ['when', 'hoje', 'deve ser uma data AAAA-MM-DD válida'],
    ['style', 'secondary', 'deve ser uma das options'],
    ['rows', 'x', 'não existe para table'],
  ])(
    'fill-field em %s com %j: o default tem de servir ao tipo',
    (field, value, message) => {
      const spec = withSteps({ op: 'fill-field', type: 'button', field, default: value });
      expectIssue(spec, `${M0}.steps[0].default`, message);
    },
  );
});

describe('migrations: o lado antigo não existe mais nesta versão', () => {
  it('rename-type.from não pode ser um tipo daqui', () => {
    const spec = withSteps({ op: 'rename-type', from: 'button', to: 'badge' });
    expectIssue(spec, `${M0}.steps[0].from`, 'tipo "button" ainda existe nesta versão');
  });

  it('remove-type.type não pode ser um tipo daqui', () => {
    const spec = withSteps({ op: 'remove-type', type: 'badge', mode: 'delete' });
    expectIssue(spec, `${M0}.steps[0].type`, 'tipo "badge" ainda existe nesta versão');
  });

  it('rename-field.from não pode ser um campo do tipo', () => {
    const spec = withSteps({
      op: 'rename-field',
      type: 'button',
      from: 'size',
      to: 'label',
    });
    expectIssue(
      spec,
      `${M0}.steps[0].from`,
      'campo "size" ainda existe no tipo "button" nesta versão',
    );
  });

  it('remove-field.field não pode ser um campo do tipo (e o tipo precisa existir)', () => {
    const spec = withSteps({ op: 'remove-field', type: 'button', field: 'label' });
    expectIssue(
      spec,
      `${M0}.steps[0].field`,
      'campo "label" ainda existe no tipo "button" nesta versão',
    );
    const ghost = withSteps({ op: 'remove-field', type: 'ghost', field: 'label' });
    expectIssue(ghost, `${M0}.steps[0].type`, 'tipo "ghost" não existe nesta versão');
  });

  it('o erro aponta o passo certo quando há vários', () => {
    const spec = withSteps(
      { op: 'remove-type', type: 'old', mode: 'delete' },
      { op: 'remove-field', type: 'button', field: 'label' },
      { op: 'remove-field', type: 'badge', field: 'text' },
    );
    expect(issuesOf(spec).map((i) => i.path)).toEqual([
      `${M0}.steps[1].field`,
      `${M0}.steps[2].field`,
    ]);
  });
});

describe('migrations: versão do formato', () => {
  it('em formatVersion 3 é erro, no caminho de migrations', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    spec.formatVersion = 3;
    expect(issuesOf(spec)).toEqual([
      { path: 'migrations', message: 'só é permitido com formatVersion 4' },
    ]);
  });

  it('o JSON Schema e o zod concordam no exemplo mínimo', () => {
    const spec = withSteps({ op: 'remove-type', type: 'old', mode: 'delete' });
    expect(parseSpec(spec).ok).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });
});
