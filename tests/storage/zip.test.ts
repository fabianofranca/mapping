// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  codeLink,
  deserialize,
  findByCode,
  getProjectIssues,
  migrations,
  serialize,
  specFiles,
} from '../../src/model';
import { readProjectZip, writeProjectZip, zipFileName } from '../../src/storage/zip';
import { sampleProject } from '../model/fixtures';
import { CADASTRO_VIEW_MODEL_KT, codeProject } from '../model/specFixtures';

async function blobText(blob: Blob | undefined): Promise<string | undefined> {
  return blob?.text();
}

describe('zip do projeto', () => {
  it('round-trip: mapping idêntico e imagens preservadas', async () => {
    const mapping = serialize(sampleProject());
    const images = new Map([
      ['images/lateral.jpg', new Blob(['LATERAL'], { type: 'image/jpeg' })],
      ['images/frente.jpg', new Blob(['FRENTE'], { type: 'image/jpeg' })],
    ]);
    const specs = new Map([['specs/sdui.json', '{"id":"sdui"}\n']]);
    const zip = await writeProjectZip({ mapping, images, specs });
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

  it('round-trip v7: SDUI v2 e Modelo de dados v1 juntos, com platformRepos e os _id do codeRef', async () => {
    const project = codeProject();
    const mapping = serialize(project);
    const images = new Map([
      ['images/cadastro.png', new Blob(['PNG'], { type: 'image/png' })],
    ]);
    const zip = await writeProjectZip({ mapping, images, specs: specFiles(project) });

    const read = await readProjectZip(zip);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe(mapping);
    const formatVersions = [...read.files.specs].map(([file, text]) => [
      file,
      (JSON.parse(text) as { formatVersion: number }).formatVersion,
    ]);
    expect(formatVersions).toEqual([
      ['specs/sdui.json', 2],
      ['specs/modelo-dados.json', 1],
    ]);

    const loaded = deserialize(read.files.mapping, migrations, read.files.specs);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.specWarnings).toEqual([]);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.project).toEqual(project);
    expect(serialize(loaded.project)).toBe(mapping);

    const data = JSON.parse(read.files.mapping);
    expect(data.schemaVersion).toBe(7);
    expect(data.platformRepos).toEqual({
      android: {
        urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
        localPath: '../../..',
      },
    });
    const screen = data.annotations.find((a: { id: string }) => a.id === 'AS');
    expect(screen.values.implementacao.map((e: { _id: string }) => e._id)).toEqual([
      'C1',
      'C2',
      'C3',
    ]);
    // O projeto lido do zip responde igual: link, busca e pendências.
    const [found] = findByCode(loaded.project, { path: 'CadastroViewModel.kt' });
    expect(found?.entry._id).toBe('C2');
    expect(found && codeLink(loaded.project, found.entry)).toBe(
      `https://github.com/org/app-android/blob/main/${CADASTRO_VIEW_MODEL_KT}#L42`,
    );
    expect([...getProjectIssues(loaded.project).keys()]).toEqual(['AT']);
  });

  it('aceita o projeto dentro de uma pasta no zip', async () => {
    const zip = new JSZip();
    zip.file('meu-projeto/mapping.json', '{"x":1}');
    zip.file('meu-projeto/images/a.png', 'PNG');
    zip.file('meu-projeto/images/notas.txt', 'ignorar');
    zip.file('meu-projeto/specs/sdui.json', '{}');
    zip.file('meu-projeto/specs/sub/outra.json', 'ignorar');
    zip.file('meu-projeto/specs/notas.txt', 'ignorar');
    zip.file('__MACOSX/meu-projeto/mapping.json', 'lixo');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);

    const read = await readProjectZip(blob);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe('{"x":1}');
    expect([...read.files.images.keys()]).toEqual(['images/a.png']);
    expect(read.files.images.get('images/a.png')?.type).toBe('image/png');
    expect([...read.files.specs.keys()]).toEqual(['specs/sdui.json']);
  });

  it('erros: arquivo que não é zip e zip sem mapping.json', async () => {
    expect(await readProjectZip(new Blob(['não sou zip']))).toEqual({
      ok: false,
      error: 'invalid-zip',
    });
    const zip = new JSZip();
    zip.file('images/a.jpg', 'x');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
    expect(await readProjectZip(blob)).toEqual({ ok: false, error: 'missing-mapping' });
  });

  it('gera um nome de arquivo seguro', () => {
    expect(zipFileName('Vistoria Carro A')).toBe('Vistoria Carro A.zip');
    expect(zipFileName('a/b:c*?')).toBe('a-b-c--.zip');
    expect(zipFileName('   ')).toBe('projeto.zip');
  });
});
