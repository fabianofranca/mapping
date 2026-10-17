import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  deserialize,
  getAnnotationIssues,
  migrateFrom8To9,
  migrations,
  serialize,
  specFiles,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import {
  LEGACY_CODE_VALUE,
  codeProject,
  legacyCodeFiles,
  legacySduiText,
} from './specFixtures';

// Schema v9 (etapa 9): o campo de código removido (`codeRef`, onde a instância foi
// implementada) sai do formato. A migração v8 → v9 descarta os valores desses campos, pelo
// tipo que a cópia da especialização aplicada declara; o resto do projeto não muda.

function load(text: string, specs: ReadonlyMap<string, string>) {
  const result = deserialize(text, migrations, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** Um mapping.json v8 do projeto, sem nada além da versão diferente. */
function v8Text(p: Project): string {
  return JSON.stringify({ ...JSON.parse(serialize(p)), schemaVersion: 8 });
}

const screenValues = (p: Project) => p.annotations.find((a) => a.id === 'AS')?.values;

describe('migração v8 → v9 (campo de código removido)', () => {
  it('descarta os valores do campo removido e mantém o resto do projeto', () => {
    const { text, specs } = legacyCodeFiles();
    const result = load(text, specs);
    expect(result.migratedFrom).toBe(8);
    expect(result.readOnly).toBe(false);
    expect(result.specWarnings).toEqual([]);
    expect(result.project.schemaVersion).toBe(10);
    expect(screenValues(result.project)).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    // O mesmo projeto de antes do campo, com a cópia lida sem ele.
    expect(result.project).toEqual(codeProject());
    expect(getAnnotationIssues(result.project, 'AS')).toEqual([]);
  });

  it('grava a versão atual sem os valores, e a releitura é estável (com a cópia antiga em specs/)', () => {
    const { text, specs } = legacyCodeFiles();
    const saved = serialize(load(text, specs).project);
    expect(JSON.parse(saved).schemaVersion).toBe(10);
    expect(saved).not.toContain('implementacao');
    expect(saved).not.toContain('CadastroScreen');
    const again = load(saved, specs);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('projeto v8 sem o campo migra sem mudar mais nada', () => {
    for (const p of [sampleProject(), codeProject()]) {
      const result = load(v8Text(p), specFiles(p));
      expect(result.migratedFrom).toBe(8);
      expect(result.project).toEqual(p);
    }
    // A cópia com o campo declarado, mas sem valor gravado na anotação: nada a descartar.
    const p = codeProject();
    const specs = specFiles(p);
    specs.set('specs/sdui.json', legacySduiText());
    expect(load(v8Text(p), specs).project).toEqual(p);
  });

  it('só descarta as chaves que a cópia declara com o tipo removido, nos tipos dela', () => {
    const { text, specs } = legacyCodeFiles();
    const data = JSON.parse(text) as {
      annotations: { id: string; values: Record<string, unknown> | null }[];
    };
    // A mesma chave num tipo que não a declara (o Button) fica, e vira pendência.
    const button = data.annotations.find((a) => a.id === 'AB')!;
    button.values!.implementacao = LEGACY_CODE_VALUE;
    const result = load(JSON.stringify(data), specs);
    expect(screenValues(result.project)).not.toHaveProperty('implementacao');
    const migrated = result.project.annotations.find((a) => a.id === 'AB')!;
    expect(migrated.values?.implementacao).toEqual(LEGACY_CODE_VALUE);
    expect(getAnnotationIssues(result.project, 'AB')).toContainEqual({
      code: 'unknown-field',
      key: 'implementacao',
    });
  });

  it('sem a cópia (ausente, ilegível ou de outro id) os valores ficam', () => {
    const { text, specs } = legacyCodeFiles();
    const variants: [string, Map<string, string>][] = [
      ['ausente', new Map([...specs].filter(([file]) => file !== 'specs/sdui.json'))],
      ['ilegível', new Map([...specs, ['specs/sdui.json', '{ não é JSON']])],
      [
        'outro id',
        new Map([
          ...specs,
          [
            'specs/sdui.json',
            JSON.stringify({ ...JSON.parse(legacySduiText()), id: 'outra' }),
          ],
        ]),
      ],
    ];
    for (const [label, files] of variants) {
      const result = load(text, files);
      expect(result.migratedFrom, label).toBe(8);
      expect(screenValues(result.project)?.implementacao, label).toEqual(
        LEGACY_CODE_VALUE,
      );
      expect(
        result.specWarnings.map((w) => w.specId),
        label,
      ).toEqual(['sdui']);
    }
    // Com a cópia de volta (já na v9), a chave aparece como "chave que não existe no tipo".
    const missing = variants[0]![1];
    const saved = serialize(load(text, missing).project);
    const reopened = load(saved, specs);
    expect(reopened.migratedFrom).toBeNull();
    expect(getAnnotationIssues(reopened.project, 'AS')).toEqual([
      { code: 'unknown-field', key: 'implementacao' },
    ]);
  });

  it('a função da migração: sem contexto não muda nada; preserva itens que não são objetos', () => {
    const data = {
      specializations: [{ id: 'sdui', version: 2, file: 'specs/sdui.json' }, 3],
      annotations: [
        {
          id: 'A1',
          type: { specId: 'sdui', typeId: 'screen' },
          values: { nome: 'X', implementacao: [] },
        },
        { id: 'A2', type: null, values: null },
        'texto',
      ],
    };
    expect(migrateFrom8To9(data)).toBe(data);
    const migrated = migrateFrom8To9(data, {
      specs: new Map([['specs/sdui.json', legacySduiText()]]),
    });
    expect(migrated.annotations).toEqual([
      { id: 'A1', type: { specId: 'sdui', typeId: 'screen' }, values: { nome: 'X' } },
      { id: 'A2', type: null, values: null },
      'texto',
    ]);
  });

  it('o registro tem as migrações de cada versão até a v9', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9);
    expect([...migrations.keys()].slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(migrations.get(8)).toBe(migrateFrom8To9);
  });
});
