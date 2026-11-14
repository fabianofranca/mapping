import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTextPackageFile, toLibraryFiles, type PackageEntry } from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { folderFiles } from '../../scripts/exampleProject.mjs';
import {
  MATERIAL3_COMPOSE_DIR,
  MATERIAL3_COMPOSE_ZIP,
} from '../../scripts/material3ComposeZip.mjs';

// `examples/material3-compose.zip`: the `libraries/material3-compose/` package zipped, for
// script R17 of docs/TESTING.md (apply through the zip in Specializations). The folder is the source.
// To regenerate: `npm run build:material3-zip`.

const HINT =
  'Run `npm run build:material3-zip` to regenerate examples/material3-compose.zip.';
const SPEC_FILE = 'material3-compose.spec.json';

async function zipEntries() {
  const zip = await JSZip.loadAsync(readFileSync(MATERIAL3_COMPOSE_ZIP));
  return Object.entries(zip.files).filter(([, entry]) => !entry.dir);
}

describe('zip of the Material 3 (Compose) library', () => {
  it('examples/material3-compose.zip has exactly the content of the folder', async () => {
    const expected = await folderFiles(MATERIAL3_COMPOSE_DIR);
    const entries = await zipEntries();
    expect(entries.map(([name]) => name).sort(), HINT).toEqual(
      [...expected.keys()].sort(),
    );
    for (const [name, entry] of entries) {
      const bytes = Buffer.from(await entry.async('uint8array'));
      expect(bytes.equals(expected.get(name) as Buffer), `${name}. ${HINT}`).toBe(true);
    }
  });

  it('the content is at the root of the zip, with the specialization next to components/ and docs/', async () => {
    const names = (await zipEntries()).map(([name]) => name);
    expect(names).toContain(SPEC_FILE);
    expect(names.filter((n) => n.startsWith('components/')).length).toBe(50);
    expect(names.filter((n) => n.startsWith('docs/')).length).toBe(50);
  });

  it('is a valid package (levels 1 and 2 of the validation, no errors)', async () => {
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
  }, 30_000);
});
