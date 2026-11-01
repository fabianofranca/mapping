import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTextPackageFile, toLibraryFiles, type PackageEntry } from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { exampleFiles } from '../../scripts/exampleProject.mjs';
import {
  MATERIAL3_COMPOSE_DIR,
  MATERIAL3_COMPOSE_ZIP,
} from '../../scripts/material3ComposeZip.mjs';

// `examples/material3-compose.zip`: o pacote `libraries/material3-compose/` compactado, para o
// roteiro R17 do docs/TESTING.md (aplicar pelo zip em Especializações). A pasta é a fonte.
// Para gerar de novo: `npm run build:material3-zip`.

const HINT =
  'Rode `npm run build:material3-zip` para regerar examples/material3-compose.zip.';
const SPEC_FILE = 'material3-compose.spec.json';

async function zipEntries() {
  const zip = await JSZip.loadAsync(readFileSync(MATERIAL3_COMPOSE_ZIP));
  return Object.entries(zip.files).filter(([, entry]) => !entry.dir);
}

describe('zip da biblioteca Material 3 (Compose)', () => {
  it('examples/material3-compose.zip tem exatamente o conteúdo da pasta', async () => {
    const expected = await exampleFiles(MATERIAL3_COMPOSE_DIR);
    const entries = await zipEntries();
    expect(entries.map(([name]) => name).sort(), HINT).toEqual(
      [...expected.keys()].sort(),
    );
    for (const [name, entry] of entries) {
      const bytes = Buffer.from(await entry.async('uint8array'));
      expect(bytes.equals(expected.get(name) as Buffer), `${name}. ${HINT}`).toBe(true);
    }
  });

  it('o conteúdo fica na raiz do zip, com a especialização ao lado de components/ e docs/', async () => {
    const names = (await zipEntries()).map(([name]) => name);
    expect(names).toContain(SPEC_FILE);
    expect(names.filter((n) => n.startsWith('components/')).length).toBe(50);
    expect(names.filter((n) => n.startsWith('docs/')).length).toBe(50);
  });

  it('é um pacote válido (níveis 1 e 2 da validação, sem erros)', async () => {
    const entries: PackageEntry[] = [];
    // Na app, o pacote mora em `specs/<id>/`; aqui o zip faz esse papel.
    for (const [name, entry] of await zipEntries()) {
      const path = `material3-compose/${name}`;
      entries.push(
        isTextPackageFile(name) ? { path, text: await entry.async('string') } : { path },
      );
    }
    const report = validateLibrary({
      files: toLibraryFiles('material3-compose', entries),
      specPath: SPEC_FILE,
    });
    expect(report.errors.map((i) => `${i.file} ${i.path} ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
