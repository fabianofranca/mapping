// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { serialize } from '../../src/model';
import { readProjectZip, writeProjectZip, zipFileName } from '../../src/storage/zip';
import { sampleProject } from '../model/fixtures';

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
    const zip = await writeProjectZip({ mapping, images });
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
  });

  it('aceita o projeto dentro de uma pasta no zip', async () => {
    const zip = new JSZip();
    zip.file('meu-projeto/mapping.json', '{"x":1}');
    zip.file('meu-projeto/images/a.png', 'PNG');
    zip.file('meu-projeto/images/notas.txt', 'ignorar');
    zip.file('__MACOSX/meu-projeto/mapping.json', 'lixo');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);

    const read = await readProjectZip(blob);
    if (!read.ok) throw new Error(read.error);
    expect(read.files.mapping).toBe('{"x":1}');
    expect([...read.files.images.keys()]).toEqual(['images/a.png']);
    expect(read.files.images.get('images/a.png')?.type).toBe('image/png');
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
