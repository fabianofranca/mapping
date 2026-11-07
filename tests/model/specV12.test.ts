// `formatVersion` 12: passos de migração de papel do vínculo (`rename-role`, `remove-role` e
// `set-role`; etapa #557). Nível 1 (um arquivo só) em `parseSpec` e nível 2 (contra a versão
// anterior) em `validateLibrary`. O contrato (`diffSpecs`) está em specVersions.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec, type Spec } from '../../src/model';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';
import { issuesOf, v11Json, type Json } from './specV11Fixtures';

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const M0 = 'migrations[0]';
const ONLY_V12 = 'só é permitido com formatVersion 12';
const ROLES = [
  { id: 'primary', name: 'Primário' },
  { id: 'secondary', name: 'Secundário' },
];

const owner = (spec: Json) => spec.layers[0].annotationTypes[0] as Json;

/**
 * v11 de teste na `formatVersion` pedida, versão 2 do pacote, com uma migração 1 → 2 com os passos
 * dados. O dono `button` tem os papéis `primary` e `secondary` (de 11 em diante); `image` e `text`
 * não têm papéis.
 */
function withSteps(steps: Json[], formatVersion = 12, edit?: (spec: Json) => void): Json {
  return v11Json((spec) => {
    spec.version = 2;
    if (formatVersion >= 11) owner(spec).childRoles = ROLES.map((r) => ({ ...r }));
    spec.migrations = [{ from: 1, to: 2, steps }];
    edit?.(spec);
  }, formatVersion);
}

const rename = (over: Json = {}): Json => ({
  op: 'rename-role',
  type: 'button',
  from: 'old',
  to: 'primary',
  ...over,
});
const remove = (over: Json = {}): Json => ({
  op: 'remove-role',
  type: 'button',
  role: 'gone',
  mode: 'clear',
  ...over,
});
const setRole = (over: Json = {}): Json => ({
  op: 'set-role',
  type: 'button',
  role: 'primary',
  ...over,
});

function errorsAt(spec: Json): Map<string, string[]> {
  const byPath = new Map<string, string[]>();
  for (const issue of issuesOf(spec)) {
    byPath.set(issue.path, [...(byPath.get(issue.path) ?? []), issue.message]);
  }
  return byPath;
}

function expectIssue(spec: Json, path: string, message: string): void {
  expect(issuesOf(spec)).toContainEqual({ path, message });
}

describe('formatVersion 12: passos de papel aceitos', () => {
  it('os três passos na formatVersion 12, no zod e no JSON Schema', () => {
    const spec = withSteps([
      rename(),
      remove(),
      remove({ role: 'other', mode: 'unlink' }),
      setRole(),
      setRole({ role: 'secondary', childType: 'onClick' }),
    ]);
    const result = parseSpec(spec);
    expect(result.ok, result.ok ? '' : result.errors.join('\n')).toBe(true);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
    const steps = (result.ok ? result.spec : ({} as Spec)).migrations?.[0]?.steps;
    expect(steps?.[0]).toEqual({
      op: 'rename-role',
      type: 'button',
      from: 'old',
      to: 'primary',
    });
    expect(steps?.[4]).toEqual({
      op: 'set-role',
      type: 'button',
      role: 'secondary',
      childType: 'onClick',
    });
  });

  it('remove-role vale num tipo que não tem mais childRoles', () => {
    expect(issuesOf(withSteps([remove({ type: 'image', role: 'primary' })]))).toEqual([]);
  });

  it('childType que não existe não é erro (o nível 1 só confere o formato)', () => {
    expect(issuesOf(withSteps([setRole({ childType: 'nao-existe' })]))).toEqual([]);
  });

  it('a v11 sem passo de papel continua válida, com e sem migrations', () => {
    expect(issuesOf(withSteps([], 11, (s) => delete s.migrations))).toEqual([]);
    const v11 = withSteps([{ op: 'remove-field', type: 'button', field: 'antigo' }], 11);
    expect(issuesOf(v11)).toEqual([]);
  });
});

describe('formatVersion 12: passos de papel antes da 12', () => {
  it.each([4, 5, 6, 7, 8, 9, 10, 11])(
    'os três passos dão erro em op com formatVersion %i',
    (formatVersion) => {
      const spec = withSteps([rename(), remove(), setRole()], formatVersion);
      const issues = issuesOf(spec);
      for (let i = 0; i < 3; i++) {
        expect(issues, `passo ${i}`).toContainEqual({
          path: `${M0}.steps[${i}].op`,
          message: ONLY_V12,
        });
      }
    },
  );

  it('o passo antigo na mesma lista não dá esse erro', () => {
    const spec = withSteps(
      [{ op: 'remove-field', type: 'button', field: 'antigo' }, remove()],
      11,
    );
    const paths = issuesOf(spec).map((i) => i.path);
    expect(paths).toContain(`${M0}.steps[1].op`);
    expect(paths).not.toContain(`${M0}.steps[0].op`);
  });
});

describe('formatVersion 12: rename-role', () => {
  it('type que não existe nesta versão', () => {
    expectIssue(
      withSteps([rename({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'tipo "zzz" não existe nesta versão',
    );
  });

  it('type sem childRoles', () => {
    expectIssue(
      withSteps([rename({ type: 'image' })]),
      `${M0}.steps[0].type`,
      'o tipo "image" não tem papéis (childRoles) nesta versão',
    );
  });

  it('to precisa ser um papel do tipo', () => {
    expectIssue(
      withSteps([rename({ to: 'nada' })]),
      `${M0}.steps[0].to`,
      '"nada" não é um papel do tipo "button"',
    );
  });

  it('from não pode ser um papel do tipo', () => {
    expectIssue(
      withSteps([rename({ from: 'secondary' })]),
      `${M0}.steps[0].from`,
      'papel "secondary" ainda existe no tipo "button" nesta versão',
    );
  });

  it('chaves faltando, vazias ou a mais', () => {
    const spec = withSteps([{ op: 'rename-role', type: 'button', to: '' }]);
    const paths = issuesOf(spec).map((i) => i.path);
    expect(paths).toContain(`${M0}.steps[0].from`);
    expect(paths).toContain(`${M0}.steps[0].to`);
    expectIssue(
      withSteps([rename({ extra: 1 })]),
      `${M0}.steps[0]`,
      'Unrecognized key: "extra"',
    );
    expect(jsonValidator.safeParse(withSteps([rename({ extra: 1 })])).success).toBe(
      false,
    );
  });
});

describe('formatVersion 12: remove-role', () => {
  it('type que não existe nesta versão', () => {
    expectIssue(
      withSteps([remove({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'tipo "zzz" não existe nesta versão',
    );
  });

  it('role não pode ser um papel do tipo', () => {
    expectIssue(
      withSteps([remove({ role: 'primary' })]),
      `${M0}.steps[0].role`,
      'papel "primary" ainda existe no tipo "button" nesta versão',
    );
  });

  it('mode inválido ou ausente', () => {
    const bad = withSteps([remove({ mode: 'drop' })]);
    expectIssue(bad, `${M0}.steps[0].mode`, 'use "clear" ou "unlink"');
    expect(jsonValidator.safeParse(bad).success).toBe(false);
    const missing = withSteps([{ op: 'remove-role', type: 'button', role: 'gone' }]);
    expect(issuesOf(missing).map((i) => i.path)).toContain(`${M0}.steps[0].mode`);
    expect(jsonValidator.safeParse(missing).success).toBe(false);
  });

  it('os dois modos valem', () => {
    for (const mode of ['clear', 'unlink']) {
      expect(issuesOf(withSteps([remove({ mode })])), mode).toEqual([]);
    }
  });

  it('chave a mais', () => {
    const spec = withSteps([remove({ extra: 1 })]);
    expectIssue(spec, `${M0}.steps[0]`, 'Unrecognized key: "extra"');
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('formatVersion 12: set-role', () => {
  it('type que não existe nesta versão', () => {
    expectIssue(
      withSteps([setRole({ type: 'zzz' })]),
      `${M0}.steps[0].type`,
      'tipo "zzz" não existe nesta versão',
    );
  });

  it('type sem childRoles', () => {
    expectIssue(
      withSteps([setRole({ type: 'text' })]),
      `${M0}.steps[0].type`,
      'o tipo "text" não tem papéis (childRoles) nesta versão',
    );
  });

  it('role precisa ser um papel do tipo', () => {
    expectIssue(
      withSteps([setRole({ role: 'nada' })]),
      `${M0}.steps[0].role`,
      '"nada" não é um papel do tipo "button"',
    );
  });

  it('childType vazio é erro de formato; ausente é aceito', () => {
    expect(
      issuesOf(withSteps([setRole({ childType: '' })])).map((i) => i.path),
    ).toContain(`${M0}.steps[0].childType`);
    expect(issuesOf(withSteps([setRole()]))).toEqual([]);
  });

  it('chave a mais e role ausente', () => {
    expectIssue(
      withSteps([setRole({ extra: 1 })]),
      `${M0}.steps[0]`,
      'Unrecognized key: "extra"',
    );
    const missing = withSteps([{ op: 'set-role', type: 'button' }]);
    expect(issuesOf(missing).map((i) => i.path)).toContain(`${M0}.steps[0].role`);
    expect(jsonValidator.safeParse(missing).success).toBe(false);
  });
});

describe('formatVersion 12: erros no passo certo e op inválido', () => {
  it('com vários passos, cada erro aponta o seu', () => {
    const spec = withSteps([
      rename(),
      setRole({ role: 'nada' }),
      remove({ role: 'primary' }),
      remove({ type: 'zzz' }),
    ]);
    const byPath = errorsAt(spec);
    expect([...byPath.keys()].sort()).toEqual([
      `${M0}.steps[1].role`,
      `${M0}.steps[2].role`,
      `${M0}.steps[3].type`,
    ]);
  });

  it('op inválido lista os nove passos', () => {
    const spec = withSteps([{ op: 'drop-role', type: 'button' }]);
    expectIssue(
      spec,
      `${M0}.steps[0].op`,
      '"op" inválido; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" ou "set-role"',
    );
    expect(jsonValidator.safeParse(spec).success).toBe(false);
  });
});

describe('formatVersion 12: schema JSON', () => {
  it('declara a versão 12 e os três passos', () => {
    const schema = jsonSchema as Json;
    expect(schema.properties.formatVersion.enum).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    const ops = (schema.$defs.migrationStep.oneOf as Json[]).map(
      (s) => s.properties.op.const as string,
    );
    expect(ops).toEqual([
      'rename-type',
      'remove-type',
      'rename-field',
      'remove-field',
      'map-values',
      'fill-field',
      'rename-role',
      'remove-role',
      'set-role',
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// Nível 2: o passo cita o que não existia na versão anterior (aviso)
// ---------------------------------------------------------------------------------------

describe('formatVersion 12: nível 2 (papéis que não existiam na versão anterior)', () => {
  const SPEC_FILE = 'lib.spec.json';

  /** A v1 (formatVersion 11): `button` com os papéis `old` e `primary`. */
  function previous(edit?: (spec: Json) => void): Spec {
    const json = v11Json((spec) => {
      owner(spec).childRoles = [
        { id: 'old', name: 'Antigo' },
        { id: 'primary', name: 'Primário' },
      ];
      edit?.(spec);
    });
    const result = parseSpec(json);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.spec;
  }

  function report(spec: Json, before: Spec) {
    return validateLibrary({
      files: [{ path: SPEC_FILE, text: JSON.stringify(spec) }],
      specPath: SPEC_FILE,
      previous: before,
    });
  }

  const brief = (issue: LibraryIssue): [string, string, string] => [
    issue.severity,
    issue.path,
    issue.message,
  ];

  it('rename-role.from e remove-role.role que não eram papéis do tipo viram aviso', () => {
    const spec = withSteps([
      rename(),
      rename({ from: 'ghost', to: 'secondary' }),
      remove({ role: 'ghost2' }),
      remove({ role: 'old', mode: 'unlink' }),
      setRole(),
    ]);
    const result = report(spec, previous());
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${M0}.steps[1].from`,
        'o papel "ghost" do tipo "button" não existia na versão 1',
      ],
      [
        'warning',
        `${M0}.steps[2].role`,
        'o papel "ghost2" do tipo "button" não existia na versão 1',
      ],
    ]);
  });

  it('com rename-type do dono no meio, o papel é lido no tipo antigo', () => {
    const before = previous();
    const spec = withSteps(
      [
        { op: 'rename-type', from: 'button', to: 'btn' },
        rename({ type: 'btn' }),
        rename({ type: 'btn', from: 'nope', to: 'secondary' }),
        remove({ type: 'btn', role: 'old' }),
      ],
      12,
      (s) => {
        owner(s).id = 'btn';
      },
    );
    const result = report(spec, before);
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      [
        'warning',
        `${M0}.steps[2].from`,
        'o papel "nope" do tipo "btn" não existia na versão 1',
      ],
    ]);
  });

  it('tipo que não existia na versão anterior avisa o tipo, não o papel', () => {
    const spec = withSteps(
      [rename({ type: 'newbie', from: 'x', to: 'primary' }), remove({ role: 'old' })],
      12,
      (s) => {
        s.layers[0].annotationTypes.push({
          id: 'newbie',
          name: 'Newbie',
          fields: [],
          allowedChildren: [{ layer: 'eventos' }],
          childRoles: [{ id: 'primary', name: 'Primário' }],
        });
      },
    );
    const result = report(spec, previous());
    expect(result.errors.map(brief)).toEqual([]);
    expect(result.warnings.map(brief)).toEqual([
      ['warning', `${M0}.steps[0].type`, 'o tipo "newbie" não existia na versão 1'],
    ]);
  });

  it('a quebra de papel sem passo é erro do contrato; com o passo, nada', () => {
    const before = previous();
    const without = withSteps([setRole({ role: 'secondary' })], 12, (s) => {
      owner(s).childRoles = [{ id: 'secondary', name: 'Secundário' }];
    });
    const missing = report(without, before);
    expect(missing.errors.map((e) => e.path)).toEqual([
      'layers[0].annotationTypes[0].childRoles[0]',
      'layers[0].annotationTypes[0].childRoles[1]',
    ]);
    expect(missing.errors[0]?.message).toContain('"rename-role" ou "remove-role"');
    expect(missing.errors[0]?.message).toContain('formatVersion 12');

    const covered = withSteps(
      [
        rename({ from: 'old', to: 'secondary' }),
        remove({ role: 'primary', mode: 'unlink' }),
      ],
      12,
      (s) => {
        owner(s).childRoles = [{ id: 'secondary', name: 'Secundário' }];
      },
    );
    const ok = report(covered, before);
    expect(ok.issues.map(brief)).toEqual([]);
  });
});
