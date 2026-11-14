// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  codeLink,
  deserialize,
  findByCode,
  projectIssues,
  migrations,
  serialize,
  specFiles,
} from '../../src/model';
import { readProjectZip, writeProjectZip, zipFileName } from '../../src/storage/zip';
import { sampleProject } from '../model/fixtures';
import { codeProject } from '../model/specFixtures';

async function blobText(blob: Blob | undefined): Promise<string | undefined> {
  return blob?.text();
}

describe('project zip', () => {
  it('round-trip: identical mapping and preserved images', async () => {
    const mapping = serialize(sampleProject());
    const images = new Map([
      ['images/lateral.jpg', new Blob(['LATERAL'], { type: 'image/jpeg' })],
      ['images/frente.jpg', new Blob(['FRENTE'], { type: 'image/jpeg' })],
    ]);
    const specs = new Map([['specs/sdui.json', '{"id":"sdui"}\n']]);
    const zip = await writeProjectZip({
      mapping,
      images,
      specs,
      proposals: new Map(),
      proposalImages: new Map(),
    });
    expect(zip.type).toBe('application/zip');

    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe(mapping);
    expect([...read.files.images.keys()].sort()).toEqual([
      'images/frente.jpg',
      'images/lateral.jpg',
    ]);
    expect(await blobText(read.files.images.get('images/lateral.jpg'))).toBe('LATERAL');
    expect(read.files.images.get('images/frente.jpg')?.type).toBe('image/jpeg');
    expect(read.files.specs).toEqual(specs);
  });

  it('round-trip v16: SDUI v5 (with repo) and Data model v1 together, with platformRepos', async () => {
    const project = codeProject();
    const mapping = serialize(project);
    const images = new Map([
      ['images/cadastro.png', new Blob(['PNG'], { type: 'image/png' })],
    ]);
    const zip = await writeProjectZip({
      mapping,
      images,
      specs: specFiles(project),
      proposals: new Map(),
      proposalImages: new Map(),
    });

    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe(mapping);
    const formatVersions = [...read.files.specs].map(([file, text]) => [
      file,
      (JSON.parse(text) as { formatVersion: number }).formatVersion,
    ]);
    expect(formatVersions).toEqual([
      ['specs/sdui.json', 5],
      ['specs/modelo-dados.json', 1],
    ]);

    const loaded = deserialize(read.files.mapping, migrations, read.files.specs);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.specWarnings).toEqual([]);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.project).toEqual(project);
    expect(serialize(loaded.project)).toBe(mapping);

    const data = JSON.parse(read.files.mapping);
    expect(data.schemaVersion).toBe(20);
    // The project only keeps the local clone; the address is in the `repo` of the specialization.
    expect(data.platformRepos).toEqual({ android: { localPath: '../../..' } });
    // The project read from the zip answers the same: search by the type file, link and pending items.
    const [found] = findByCode(loaded.project, { path: 'DSButton.kt' });
    expect(found?.typeId).toBe('button');
    const android = found?.code.find((c) => c.platform === 'android');
    expect(
      android &&
        codeLink(loaded.project, {
          specId: found?.specId ?? '',
          platform: 'android',
          path: android.code.path ?? null,
        }),
    ).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    expect([...projectIssues(loaded.project).keys()]).toEqual(['AT']);
  });

  it('accepts the project inside a folder in the zip', async () => {
    const zip = new JSZip();
    zip.file('my-project/mapping.json', '{"x":1}');
    zip.file('my-project/images/a.png', 'PNG');
    zip.file('my-project/images/notes.txt', 'ignore');
    zip.file('my-project/specs/sdui.json', '{}');
    zip.file('my-project/specs/sub/other.json', '{}');
    zip.file('my-project/specs/notes.txt', 'ignore');
    zip.file('__MACOSX/my-project/mapping.json', 'junk');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);

    const read = await readProjectZip(blob);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe('{"x":1}');
    expect([...read.files.images.keys()]).toEqual(['images/a.png']);
    expect(read.files.images.get('images/a.png')?.type).toBe('image/png');
    // `specs/sub/other.json` belongs to a package folder: text in `specs` and bytes in `specAssets`.
    expect([...read.files.specs.keys()].sort()).toEqual([
      'specs/sdui.json',
      'specs/sub/other.json',
    ]);
    expect([...(read.files.specAssets?.keys() ?? [])]).toEqual(['specs/sub/other.json']);
  });

  it('errors: a file that is not a zip and a zip without mapping.json', async () => {
    expect(await readProjectZip(new Blob(['not a zip']))).toEqual({
      ok: false,
      error: 'invalid-zip',
    });
    const zip = new JSZip();
    zip.file('images/a.jpg', 'x');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
    expect(await readProjectZip(blob)).toEqual({ ok: false, error: 'missing-mapping' });
  });

  it('generates a safe file name', () => {
    expect(zipFileName('Car Inspection A', 'untitled')).toBe('Car Inspection A.zip');
    expect(zipFileName('a/b:c*?', 'untitled')).toBe('a-b-c--.zip');
    expect(zipFileName('   ', 'untitled')).toBe('untitled.zip');
    expect(zipFileName('   ', 'project')).toBe('project.zip');
  });

  it('round-trip of the library package: files and bytes preserved', async () => {
    const font = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const specAssets = new Map([
      ['specs/m3/components/a.json', new Blob(['{"a":1}'])],
      ['specs/m3/fonts/Roboto.ttf', new Blob([font])],
    ]);
    const zip = await writeProjectZip({
      mapping: '{"x":1}',
      images: new Map(),
      specs: new Map([['specs/m3/m3.spec.json', '{"id":"m3"}\n']]),
      specAssets,
      proposals: new Map(),
      proposalImages: new Map(),
    });
    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    expect([...read.files.specAssets!.keys()].sort()).toEqual([
      'specs/m3/components/a.json',
      'specs/m3/fonts/Roboto.ttf',
      'specs/m3/m3.spec.json',
    ]);
    const bytes = new Uint8Array(
      await read.files.specAssets!.get('specs/m3/fonts/Roboto.ttf')!.arrayBuffer(),
    );
    expect([...bytes]).toEqual([...font]);
    expect(read.files.specs.get('specs/m3/m3.spec.json')).toBe('{"id":"m3"}\n');
  });

  it('ignores package paths with ..', async () => {
    const zip = new JSZip();
    zip.file('mapping.json', '{}');
    zip.file('specs/m3/../fora.bin', 'x');
    const read = await readProjectZip(
      new Blob([await zip.generateAsync({ type: 'arraybuffer' })]),
    );
    if (!read.ok) throw new Error(read.error);
    expect(read.files.specAssets).toBeUndefined();
  });
});
