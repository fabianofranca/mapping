// Pacote de biblioteca de exemplo do produto (`examples/libraries/material3/`): o repositório
// guarda o que o gerador produz (`npm run build:examples`) e este teste prova que está em dia.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryExampleFiles } from '../../scripts/libraryExamples';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { isFontPath, loadLibrary } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';
import { parseComponent } from '../../src/model/components/parseComponent';
import { screenFromSource } from '../../src/model/components/origin';
import { parseSpec } from '../../src/model/spec';

const ROOT = join(__dirname, '../../examples/libraries/material3');
const HINT = 'Rode `npm run build:examples` para regerar examples/libraries/material3/.';

const files = libraryExampleFiles();
const byPath = new Map(files.map((f) => [f.path, f.text]));
const json = (path: string): unknown => JSON.parse(byPath.get(path) ?? 'null');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

describe('pacote material3 em dia com o gerador', () => {
  it('cada arquivo gerado existe no repositório com o mesmo conteúdo', () => {
    for (const f of files) {
      const full = join(ROOT, f.path);
      expect(existsSync(full), `${f.path} não existe. ${HINT}`).toBe(true);
      expect(
        readFileSync(full, 'utf8') === f.text,
        `${f.path} desatualizado. ${HINT}`,
      ).toBe(true);
    }
  });

  it('não há arquivo que o gerador não produz (fora de fonts/)', () => {
    const extra = listDisk(ROOT).filter((p) => !byPath.has(p) && !p.startsWith('fonts/'));
    expect(extra, `arquivos sobrando: ${extra.join(', ')}. ${HINT}`).toEqual([]);
  });
});

describe('pacote material3 é válido', () => {
  const specText = byPath.get('material3.spec.json') ?? '';
  const parsed = parseSpec(JSON.parse(specText));

  it('a especialização valida na formatVersion 6', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.formatVersion).toBe(6);
  });

  it('os quinze componentes validam', () => {
    const paths = files.filter((f) => f.path.startsWith('components/'));
    expect(paths).toHaveLength(15);
    for (const f of paths) {
      const result = parseComponent(JSON.parse(f.text));
      expect(result.ok, `${f.path}: ${result.ok ? '' : result.errors.join('; ')}`).toBe(
        true,
      );
    }
  });

  it('todo component, doc e file citados existem; os .md não são vazios', () => {
    if (!parsed.ok) throw new Error('especialização inválida');
    const cited: string[] = [];
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        if (type.component) cited.push(type.component);
        if (type.doc) cited.push(type.doc);
        for (const e of type.examples ?? []) if (e.file) cited.push(e.file);
      }
    }
    for (const origin of parsed.spec.origins ?? []) {
      for (const e of origin.examples ?? []) cited.push(e.file);
    }
    for (const font of parsed.spec.fonts ?? []) cited.push(font.file);
    for (const path of cited.filter((p) => !p.startsWith('fonts/'))) {
      expect(byPath.has(path), `${path} citado e ausente`).toBe(true);
    }
    for (const f of files.filter((x) => x.path.endsWith('.md'))) {
      expect(f.text.trim().length, f.path).toBeGreaterThan(0);
    }
    expect(files.filter((x) => x.path.endsWith('.md'))).toHaveLength(15);
  });

  it('cada tipo com componente tem de um a três exemplos', () => {
    if (!parsed.ok) throw new Error('especialização inválida');
    for (const layer of parsed.spec.layers) {
      for (const type of layer.annotationTypes) {
        if (!type.component) continue;
        const n = type.examples?.length ?? 0;
        expect(n, type.id).toBeGreaterThanOrEqual(1);
        expect(n, type.id).toBeLessThanOrEqual(3);
      }
    }
  });
});

// O pacote do repositório é o fixture das três portas (B2), do canvas (B3) e do Catálogo (B5):
// ele precisa passar pelos três níveis do validador sem nenhum erro. Os avisos que sobram são
// fixados aqui, para o número não andar sozinho: duas fontes ausentes (o `.ttf` da Roboto não é
// versionado) e o resto da prova de desenho, que avisa conteúdo maior que a caixa no tamanho
// inicial (o tamanho mínimo não é desenhado). A medida do Node é **aproximada** (no
// navegador é a do Konva, a real), e a decisão da etapa é avisar, sem recortar nem recusar.
describe('o pacote do repositório passa pelo validador da biblioteca', () => {
  const report = validateLibrary({
    files: listDisk(ROOT).map((path) => {
      const full = join(ROOT, path);
      return isFontPath(path)
        ? { path, binary: true }
        : { path, text: readFileSync(full, 'utf8') };
    }),
    specPath: 'material3.spec.json',
  });

  it('nenhum erro, nos três níveis', () => {
    expect(report.errors.map((i) => `${i.file}:${i.path}: ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 15,
      components: 15,
      docs: 15,
    });
  });

  it('os avisos são só as fontes ausentes e a prova de desenho aproximada', () => {
    const fonts = report.warnings.filter((w) => w.path.startsWith('fonts['));
    expect(fonts).toHaveLength(2);
    const approximate = report.warnings.filter((w) => w.message.endsWith('(aproximado)'));
    expect(
      approximate.every((w) => w.message.includes('conteúdo maior que a caixa')),
    ).toBe(true);
    // Só o chip "Selecionado" avisa, no tamanho inicial; o mínimo não é desenhado.
    expect(approximate.map((w) => w.path)).toEqual([
      'layers[0].annotationTypes[6].examples[1]',
    ]);
    expect(approximate.every((w) => w.message.includes('tamanho inicial'))).toBe(true);
    const others = report.warnings.filter(
      (w) => !w.path.startsWith('fonts[') && !w.message.endsWith('(aproximado)'),
    );
    expect(others.map((w) => `${w.file}:${w.path}: ${w.message}`)).toEqual([]);
  });
});

describe('contrato da origem do pacote', () => {
  it('a declaração traduz examples/settings.sdui.json sem aviso', () => {
    const library = loadLibrary(
      files
        .filter((f) => f.path.endsWith('.json'))
        .map((f) => ({ path: f.path, text: f.text })),
    );
    expect(library.problems).toEqual([]);
    expect(library.types.filter((t) => t.component)).toHaveLength(15);
    const result = screenFromSource(library, json('examples/settings.sdui.json'), {
      measure: approximateMeasurer,
    });
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.screen).toBeDefined();
  });
});
