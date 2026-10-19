// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES,
  applySpecialization,
  isPackageFile,
  isTextPackageFile,
  packageDirOf,
  packageSpecNameOf,
  packageWithinLimits,
  specFileFor,
  toLibraryFiles,
  updateSpecialization,
  parseSpecText,
  usesPackageFiles,
  type Spec,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { emptyProject } from './fixtures';
import { idGen, loadExample } from './specFixtures';
import { material3Package, material3Spec } from '../storage/packageFixture';

describe('caminhos do pacote', () => {
  it('packageDirOf e isPackageFile distinguem pasta de arquivo único', () => {
    expect(packageDirOf('specs/material3/material3.spec.json')).toBe('specs/material3');
    expect(packageDirOf('specs/a/b/c.json')).toBe('specs/a');
    expect(packageDirOf('specs/sdui.json')).toBeNull();
    expect(packageDirOf('images/a/b.png')).toBeNull();
    expect(isPackageFile('specs/m3/m3.spec.json')).toBe(true);
    expect(isPackageFile('specs/sdui.json')).toBe(false);
  });

  it('.json e .md são texto; o resto é binário', () => {
    expect(isTextPackageFile('components/a.json')).toBe(true);
    expect(isTextPackageFile('docs/A.MD')).toBe(true);
    expect(isTextPackageFile('fonts/Roboto.ttf')).toBe(false);
    expect(isTextPackageFile('fonts/LEIA-ME.txt')).toBe(false);
  });

  it('limites', () => {
    expect(packageWithinLimits(MAX_PACKAGE_FILES, MAX_PACKAGE_BYTES)).toBe(true);
    expect(packageWithinLimits(MAX_PACKAGE_FILES + 1, 0)).toBe(false);
    expect(packageWithinLimits(0, MAX_PACKAGE_BYTES + 1)).toBe(false);
  });

  it('toLibraryFiles tira a pasta do caminho, mantém texto e marca binário', () => {
    expect(
      toLibraryFiles('specs/m3', [
        { path: 'specs/m3/m3.spec.json', text: '{}' },
        { path: 'specs/m3/docs/a.md', text: '# a' },
        { path: 'specs/m3/fonts/R.ttf' },
        { path: 'specs/m3/docs/sem-texto.md' },
        { path: 'specs/outro/x.json', text: '{}' },
        { path: 'specs/m3/', text: '' },
      ]),
    ).toEqual([
      { path: 'm3.spec.json', text: '{}' },
      { path: 'docs/a.md', text: '# a' },
      { path: 'fonts/R.ttf', binary: true },
    ]);
  });

  it('packageSpecNameOf acha o arquivo da especialização na raiz do pacote', () => {
    const files = material3Package();
    expect(packageSpecNameOf(files, 'material3')).toBe('material3.spec.json');
    expect(packageSpecNameOf(files, 'outro')).toBe('outro.spec.json');
    expect(packageSpecNameOf(new Map(), 'x')).toBe('x.spec.json');
  });
});

describe('specFileFor com pacote', () => {
  it('v1 a v3 continuam specs/<id>.json', () => {
    expect(specFileFor(emptyProject(), 'sdui')).toBe('specs/sdui.json');
  });

  it('pacote: specs/<id>/<arquivo>, id limpo e sem colidir', () => {
    const p = applySpecialization(emptyProject(), material3Spec(), {
      newId: idGen('L'),
      packageSpecName: 'material3.spec.json',
    });
    expect(p.specializations[0]?.file).toBe('specs/material3/material3.spec.json');
    expect(specFileFor(emptyProject(), 'a b/c', 'x.spec.json')).toBe(
      'specs/a-b-c/x.spec.json',
    );
    // Outro id que limpa para a mesma pasta ganha sufixo.
    const first = {
      ...p.specializations[0]!,
      id: 'a b',
      file: specFileFor(p, 'a b', 'x.json'),
    };
    const base = { ...emptyProject(), specializations: [first] };
    expect(first.file).toBe('specs/a-b/x.json');
    expect(specFileFor(base, 'a?b', 'm.spec.json')).toBe('specs/a-b-2/m.spec.json');
  });

  it('atualizar acompanha o layout: pacote mantém a pasta; sem pacote volta ao arquivo único', () => {
    const v1 = { ...material3Spec(), version: 1 };
    const v2 = { ...v1, version: 2 };
    const applied = applySpecialization(emptyProject(), v1, {
      newId: idGen('L'),
      packageSpecName: 'material3.spec.json',
    });
    const kept = updateSpecialization(applied, v2, {
      newId: idGen('M'),
      packageSpecName: 'material3.spec.json',
    });
    expect(kept.specializations[0]?.file).toBe('specs/material3/material3.spec.json');
    const flat = updateSpecialization(applied, v2, { newId: idGen('M') });
    expect(flat.specializations[0]?.file).toBe('specs/material3.json');
    const sdui = applySpecialization(emptyProject(), {
      ...loadExample('sdui'),
      version: 1,
    });
    const packaged = updateSpecialization(
      sdui,
      { ...loadExample('sdui'), version: 2 },
      { packageSpecName: 'sdui.spec.json' },
    );
    expect(packaged.specializations[0]?.file).toBe('specs/sdui/sdui.spec.json');
  });
});

describe('validateLibrary sobre os arquivos lidos do pacote', () => {
  it('o Material 3 em specs/material3/ monta a entrada do validador', () => {
    const entries = [...material3Package()].map(([path, data]) => ({
      path: `specs/material3/${path}`,
      ...(typeof data === 'string' ? { text: data } : {}),
    }));
    const report = validateLibrary({
      files: toLibraryFiles('specs/material3', entries),
      specPath: 'material3.spec.json',
      level: 2,
    });
    expect(report.errors.map((e) => e.message)).toEqual([]);
  });
});

describe('usesPackageFiles', () => {
  const sduiAs = (
    formatVersion: number,
    patch: (raw: Record<string, unknown>) => void = () => {},
  ): Spec => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'examples', 'specs', 'sdui.json'), 'utf8'),
    ) as Record<string, unknown>;
    raw.formatVersion = formatVersion;
    patch(raw);
    const parsed = parseSpecText(JSON.stringify(raw));
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    return parsed.spec;
  };
  const firstType = (raw: Record<string, unknown>) =>
    (
      (raw.layers as { annotationTypes: Record<string, unknown>[] }[])[0] ?? {
        annotationTypes: [],
      }
    ).annotationTypes[0] as Record<string, unknown>;

  it('v1 a v3 e v4 sem nenhum arquivo do pacote valem isoladas', () => {
    expect(usesPackageFiles(sduiAs(2))).toBe(false);
    expect(usesPackageFiles(sduiAs(4))).toBe(false);
  });

  it('migrations não conta', () => {
    expect(usesPackageFiles(sduiAs(4, (raw) => (raw.migrations = [])))).toBe(false);
  });

  it('component, doc, examples ou fonts pedem o pacote', () => {
    const doc = sduiAs(4, (raw) => (firstType(raw).doc = 'docs/a.md'));
    expect(usesPackageFiles(doc)).toBe(true);
    const component = sduiAs(
      4,
      (raw) => (firstType(raw).component = 'components/a.json'),
    );
    expect(usesPackageFiles(component)).toBe(true);
    const fonts = sduiAs(
      4,
      (raw) =>
        (raw.fonts = [
          { family: 'Roboto', weight: 400, style: 'normal', file: 'fonts/r.ttf' },
        ]),
    );
    expect(usesPackageFiles(fonts)).toBe(true);
  });

  it('o material3 (pacote) usa arquivos do pacote', () => {
    expect(usesPackageFiles(material3Spec())).toBe(true);
  });
});
