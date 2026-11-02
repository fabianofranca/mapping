import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialize, projectIssues } from '../../src/model';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { readProjectZip } from '../../src/storage/zip';
import {
  CAROUSEL_LABELS,
  IMAGE_URL,
  SPEC_FILE,
  SPEC_ID,
  SIZE,
  USED_TYPES,
  annotationIdOf,
  complexZip,
  files,
  items,
} from '../e2e/material3ComplexFixture';

// `examples/material3-complexos.zip`: uma tela de reserva montada só com a biblioteca Material 3
// (Compose), com os componentes de mais propriedades e todas elas preenchidas, inclusive as URLs de
// imagem. Não é usado por nenhum roteiro. O zip sai de `tests/e2e/material3ComplexFixture.ts`.
// Para gerar de novo: `npm run build:material3-complex`.

const EXAMPLE = 'examples/material3-complexos.zip';
const HINT = 'Rode `npm run build:material3-complex` para regerar o zip.';

const COMPLEX_TYPES = [
  'top-app-bar',
  'search-bar',
  'carousel',
  'flow-row',
  'chip',
  'card',
  'list-item',
  'swipe-to-dismiss',
  'date-picker',
  'slider',
  'text-field',
  'secure-text-field',
  'button',
];

async function readExample() {
  const read = await readProjectZip(new Blob([readFileSync(EXAMPLE)]));
  if (!read.ok) throw new Error(`zip ilegível: ${read.error}`);
  const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
  if (!parsed.ok) throw new Error(`mapping.json inválido: ${parsed.error.code}`);
  return parsed.project;
}

describe('zip de exemplo dos componentes complexos do Material 3', () => {
  it('examples/material3-complexos.zip está em dia com o gerador', async () => {
    if (process.env.UPDATE_EXAMPLES === '1') {
      writeFileSync(EXAMPLE, await complexZip());
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

  it('o pacote specs/material3-compose/ do zip é uma biblioteca válida', async () => {
    const zip = await JSZip.loadAsync(readFileSync(EXAMPLE));
    const prefix = `specs/${SPEC_ID}/`;
    const libFiles: LibraryFile[] = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !name.startsWith(prefix)) continue;
      const path = name.slice(prefix.length);
      // Só o texto entra na conferência; as fontes são binárias.
      if (!/\.(json|md|txt)$/.test(path)) continue;
      libFiles.push({ path, text: await entry.async('string') });
    }
    const report = validateLibrary({ files: libFiles, specPath: SPEC_FILE });
    expect(report.errors.map((i) => `${i.file} ${i.path} ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a app lê o zip: um container sem arquivo e todos os campos preenchidos', async () => {
    const p = await readExample();
    expect(p.specializations.map((s) => `${s.id}@${s.version}`)).toEqual([
      `${SPEC_ID}@1`,
    ]);
    expect(p.containers).toHaveLength(1);
    expect(p.containers[0]).toMatchObject({
      file: null,
      width: SIZE.width,
      height: SIZE.height,
    });

    const used = new Set(p.annotations.map((a) => a.type?.typeId));
    for (const typeId of COMPLEX_TYPES) expect(used.has(typeId), typeId).toBe(true);
    expect([...used].sort()).toEqual([...USED_TYPES].sort());

    const spec = p.specializations[0]?.spec;
    const types = new Map(
      spec?.layers.flatMap((l) => l.annotationTypes).map((t) => [t.id, t]) ?? [],
    );
    for (const item of items()) {
      const a = p.annotations.find((x) => x.id === annotationIdOf(item.id));
      expect(a?.type?.typeId, item.id).toBe(item.type);
      for (const field of types.get(item.type)?.fields ?? []) {
        const value = a?.values?.[field.key];
        if (field.type === 'table') {
          expect(Array.isArray(value) ? value.length : 0, `${item.id}.${field.key}`).toBe(
            CAROUSEL_LABELS.length,
          );
          continue;
        }
        expect(
          value !== undefined && value !== null && value !== '',
          `${item.id}.${field.key}`,
        ).toBe(true);
      }
    }
  });

  it('o carrossel tem os quatro rótulos, cada um com a URL da imagem de teste', async () => {
    const p = await readExample();
    const rows = p.annotations.find((a) => a.id === annotationIdOf('M_CAROUSEL'))?.values
      ?.items;
    const list = (Array.isArray(rows) ? rows : []) as {
      label?: string;
      image?: string;
    }[];
    expect(list.map((r) => r.label)).toEqual([...CAROUSEL_LABELS]);
    expect(list.every((r) => r.image?.startsWith(IMAGE_URL))).toBe(true);
  });

  it('o projeto não tem pendências', async () => {
    const p = await readExample();
    expect([...projectIssues(p)]).toEqual([]);
  });
});
