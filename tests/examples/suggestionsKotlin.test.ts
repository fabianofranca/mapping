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

// `examples/sugestoes-kotlin.zip`: a biblioteca Kotlin aplicada e as data classes `Usuario` e
// `Endereco`, para o roteiro R14 (Sugestões no campo de texto) do docs/TESTING.md. O zip sai de
// `tests/e2e/suggestionsKotlinFixture.ts`. Para gerar de novo: `npm run build:suggestions-kotlin`.

const EXAMPLE = 'examples/sugestoes-kotlin.zip';
const HINT = 'Rode `npm run build:suggestions-kotlin` para regerar o zip.';

describe('zip de exemplo das sugestões Kotlin', () => {
  it('examples/sugestoes-kotlin.zip está em dia com o gerador', async () => {
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

  it('o pacote specs/kotlin/ do zip é uma biblioteca válida', async () => {
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

  it('a app lê o zip: Usuario e Endereco com as propriedades e uma com Tipo vazio', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
    if (!read.ok) throw new Error(`zip ilegível: ${read.error}`);
    const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
    if (!parsed.ok) throw new Error(`mapping.json inválido: ${parsed.error.code}`);
    const p = parsed.project;
    expect(p.specializations.map((s) => `${s.id}@${s.version}`)).toEqual(['kotlin@2']);
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
      ['nome', 'String'],
      ['email', 'String?'],
      ['endereco', 'Endereco'],
      ['ativo', null],
    ]);
    expect(rowsOf(ANNOTATION_IDS.address).map((r) => [r.name, r.type])).toEqual([
      ['rua', 'String'],
      ['cidade', 'String'],
    ]);
  });
});
