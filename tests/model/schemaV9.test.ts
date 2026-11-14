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
import { legacyJson } from './legacyShape';
import {
  LEGACY_CODE_VALUE,
  codeProject,
  legacyCodeFiles,
  legacySduiText,
} from './specFixtures';

// Schema v9 (stage 9): the removed code field (`codeRef`, where the instance was
// implemented) leaves the format. The v8 → v9 migration discards the values of those fields, by the
// type that the applied specialization copy declares; the rest of the project does not change.

function load(text: string, specs: ReadonlyMap<string, string>) {
  const result = deserialize(text, migrations, specs);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

/** A v8 mapping.json of the project, with nothing but the version different. */
function v8Text(p: Project): string {
  return JSON.stringify({ ...legacyJson(p), schemaVersion: 8 });
}

const screenValues = (p: Project) => p.annotations.find((a) => a.id === 'AS')?.values;

describe('migration v8 → v9 (removed code field)', () => {
  it('discards the values of the removed field and keeps the rest of the project', () => {
    const { text, specs } = legacyCodeFiles();
    const result = load(text, specs);
    expect(result.migratedFrom).toBe(8);
    expect(result.readOnly).toBe(false);
    expect(result.specWarnings).toEqual([]);
    expect(result.project.schemaVersion).toBe(20);
    expect(screenValues(result.project)).toEqual({ nome: 'Cadastro', rota: '/cadastro' });
    // The same project as before the field, with the copy read without it.
    expect(result.project).toEqual(codeProject());
    expect(getAnnotationIssues(result.project, 'AS')).toEqual([]);
  });

  it('writes the current version without the values, and re-reading is stable (with the old copy in specs/)', () => {
    const { text, specs } = legacyCodeFiles();
    const saved = serialize(load(text, specs).project);
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    expect(saved).not.toContain('implementacao');
    expect(saved).not.toContain('CadastroScreen');
    const again = load(saved, specs);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('a v8 project without the field migrates without changing anything else', () => {
    for (const p of [sampleProject(), codeProject()]) {
      const result = load(v8Text(p), specFiles(p));
      expect(result.migratedFrom).toBe(8);
      expect(result.project).toEqual(p);
    }
    // The copy with the field declared, but without a value stored on the annotation: nothing to discard.
    const p = codeProject();
    const specs = specFiles(p);
    specs.set('specs/sdui.json', legacySduiText());
    expect(load(v8Text(p), specs).project).toEqual(p);
  });

  it('only discards the keys that the copy declares with the removed type, in its types', () => {
    const { text, specs } = legacyCodeFiles();
    const data = JSON.parse(text) as {
      annotations: { id: string; values: Record<string, unknown> | null }[];
    };
    // The same key on a type that does not declare it (the Button) stays, and becomes an issue.
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

  it('without the copy (missing, unreadable or of another id) the values stay', () => {
    const { text, specs } = legacyCodeFiles();
    const variants: [string, Map<string, string>][] = [
      ['missing', new Map([...specs].filter(([file]) => file !== 'specs/sdui.json'))],
      ['unreadable', new Map([...specs, ['specs/sdui.json', '{ not JSON']])],
      [
        'another id',
        new Map([
          ...specs,
          [
            'specs/sdui.json',
            JSON.stringify({ ...JSON.parse(legacySduiText()), id: 'another' }),
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
    // With the copy back (already on v9), the key shows up as "a key that does not exist on the type".
    const missing = variants[0]![1];
    const saved = serialize(load(text, missing).project);
    const reopened = load(saved, specs);
    expect(reopened.migratedFrom).toBeNull();
    expect(getAnnotationIssues(reopened.project, 'AS')).toEqual([
      { code: 'unknown-field', key: 'implementacao' },
    ]);
  });

  it('the migration function: without context it changes nothing; preserves items that are not objects', () => {
    const data = {
      specializations: [{ id: 'sdui', version: 2, file: 'specs/sdui.json' }, 3],
      annotations: [
        {
          id: 'A1',
          type: { specId: 'sdui', typeId: 'screen' },
          values: { nome: 'X', implementacao: [] },
        },
        { id: 'A2', type: null, values: null },
        'text',
      ],
    };
    expect(migrateFrom8To9(data)).toBe(data);
    const migrated = migrateFrom8To9(data, {
      specs: new Map([['specs/sdui.json', legacySduiText()]]),
    });
    expect(migrated.annotations).toEqual([
      { id: 'A1', type: { specId: 'sdui', typeId: 'screen' }, values: { nome: 'X' } },
      { id: 'A2', type: null, values: null },
      'text',
    ]);
  });

  it('the registry has the migrations of each version up to v9', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9);
    expect([...migrations.keys()].slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(migrations.get(8)).toBe(migrateFrom8To9);
  });
});
