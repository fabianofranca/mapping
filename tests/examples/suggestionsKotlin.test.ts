import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialize } from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import {
  ANNOTATION_IDS,
  NAMES,
  files,
  suggestionsZip,
} from '../e2e/suggestionsKotlinFixture';

// `examples/suggestions-kotlin.zip`: the Kotlin library applied and the data classes `User` and
// `Address`, for script R14 (Text field suggestions) of docs/TESTING.md. The zip comes from
// `tests/e2e/suggestionsKotlinFixture.ts`. To generate it again: `npm run build:suggestions-kotlin`.

const EXAMPLE = 'examples/suggestions-kotlin.zip';
const HINT = 'Run `npm run build:suggestions-kotlin` to regenerate the zip.';

describe('Kotlin suggestions example zip', () => {
  it('examples/suggestions-kotlin.zip is up to date with the generator', async () => {
    if (process.env.UPDATE_EXAMPLES === '1') {
      writeFileSync(EXAMPLE, await suggestionsZip());
    }
    const expected = files();
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(names.sort(), HINT).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      const entry = zip.file(path);
      if (typeof content === 'string') {
        expect(await entry?.async('string'), `${path}. ${HINT}`).toBe(content);
      } else {
        const bytes = Buffer.from((await entry?.async('uint8array')) ?? []);
        expect(bytes.equals(content), `${path}. ${HINT}`).toBe(true);
      }
    }
  });

  it('the specs/kotlin/ package of the zip is a valid library', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const prefix = 'specs/kotlin/';
    const libFiles: LibraryFile[] = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith(prefix)) continue;
      libFiles.push({
        path: name.slice(prefix.length),
        text: await entry.async('string'),
      });
    }
    const report = validateLibrary({ files: libFiles, specPath: 'kotlin.spec.json' });
    expect(report.errors.map((i) => `${i.file} ${i.path} ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('the app reads the zip: User and Address with the properties and one with an empty Type', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
    if (!read.ok) throw new Error(`unreadable zip: ${read.error}`);
    const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
    if (!parsed.ok) throw new Error(`invalid mapping.json: ${parsed.error.code}`);
    const p = parsed.project;
    expect(p.specializations.map((s) => `${s.id}@${s.version}`)).toEqual(['kotlin@3']);
    const rowsOf = (id: string) => {
      const a = p.annotations.find((x) => x.id === id);
      expect(a?.type?.typeId).toBe('data-class');
      const rows = a?.values?.properties;
      return (Array.isArray(rows) ? rows : []) as { name: string; type: string | null }[];
    };
    expect(p.annotations.find((a) => a.id === ANNOTATION_IDS.user)?.values?.name).toBe(
      NAMES.user,
    );
    expect(rowsOf(ANNOTATION_IDS.user).map((r) => [r.name, r.type])).toEqual([
      ['id', 'Long'],
      ['name', 'String'],
      ['email', 'String?'],
      ['address', 'Address'],
      ['active', null],
    ]);
    expect(rowsOf(ANNOTATION_IDS.address).map((r) => [r.name, r.type])).toEqual([
      ['street', 'String'],
      ['city', 'String'],
    ]);
  });
});
