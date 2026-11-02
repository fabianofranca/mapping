// Catálogo da biblioteca: o pacote Material 3 lido de tests/fixtures/material3/.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  clampPlaygroundSize,
  drawEntry,
  exampleDrawing,
  findEntry,
  fittedSize,
  hugAxes,
  playgroundSizeRange,
} from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { isFontPath } from '../../src/model/components/library';
import type { LibraryFile } from '../../src/model/library';
import { BUTTON_PATH, TEXT_BUTTON_PATH, variantsSpecJson } from './variantsFixtures';

const ROOT = join(__dirname, '../../tests/fixtures/material3');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files: LibraryFile[] = listDisk(ROOT).map((path) =>
  isFontPath(path)
    ? { path, binary: true }
    : { path, text: readFileSync(join(ROOT, path), 'utf8') },
);

const catalog = buildCatalog(files);
const entries = catalog.layers.flatMap((l) => l.entries);

describe('catálogo do Material 3', () => {
  it('lê a especialização, o relatório e os quinze tipos', () => {
    expect(catalog.spec?.id).toBe('material3');
    expect(catalog.report.errors).toEqual([]);
    expect(catalog.layers.length).toBeGreaterThan(0);
    expect(entries).toHaveLength(15);
    expect(catalog.layers[0]?.entries[0]?.layerId).toBe(catalog.layers[0]?.id);
  });

  it('todo tipo tem componente, documento e exemplos', () => {
    for (const entry of entries) {
      expect(entry.component, entry.type.id).not.toBeNull();
      expect(entry.docText, entry.type.id).toMatch(/\S/);
      expect(entry.examples.length, entry.type.id).toBeGreaterThan(0);
      expect(entry.previewValues).not.toBeNull();
    }
  });

  it('marca como container os tipos com slot', () => {
    const containers = entries.filter((e) => e.container).map((e) => e.type.id);
    const plain = entries.filter((e) => !e.container).map((e) => e.type.id);
    expect(containers.length).toBeGreaterThan(0);
    for (const id of ['m3-box', 'm3-row', 'm3-column']) expect(containers).toContain(id);
    expect(plain).toContain('m3-button');
  });

  it('monta a tabela de propriedades de um tipo conhecido', () => {
    const button = findEntry(catalog, 'm3-button');
    expect(button?.fields.map((f) => f.key)).toContain('variant');
    const variant = button?.fields.find((f) => f.key === 'variant');
    expect(variant?.type).toBe('enum');
    expect(variant?.options?.length).toBeGreaterThan(1);
    expect(variant?.label).toMatch(/\S/);
    expect(findEntry(catalog, 'não-existe')).toBeUndefined();
  });

  it('desenha o preview e cada exemplo sem erro', () => {
    for (const entry of entries) {
      expect(
        exampleDrawing(catalog, entry, undefined, approximateMeasurer),
        entry.type.id,
      ).not.toBeNull();
      for (const example of entry.examples) {
        const drawing = exampleDrawing(catalog, entry, example, approximateMeasurer);
        expect(drawing, `${entry.type.id}/${example.name}`).not.toBeNull();
        expect(drawing?.root.type).toBe('frame');
      }
    }
  });

  it('o tamanho passado ao desenho vale na raiz', () => {
    const button = findEntry(catalog, 'm3-button');
    if (button === undefined) throw new Error('sem botão');
    const drawing = drawEntry(button, {}, approximateMeasurer, {
      width: 200,
      height: 60,
    });
    expect(drawing?.root.width).toBe(200);
    expect(drawing?.root.height).toBe(60);
  });

  it('intervalo do playground: do minSize ao dobro do size', () => {
    const button = findEntry(catalog, 'm3-button')?.component;
    if (!button) throw new Error('sem componente');
    const { min, max } = playgroundSizeRange(button);
    expect(min).toEqual({
      width: button.minSize?.width ?? 1,
      height: button.minSize?.height ?? 1,
    });
    expect(max).toEqual({ width: button.size.width * 2, height: button.size.height * 2 });
    expect(clampPlaygroundSize(button, { width: 1e6, height: -5 })).toEqual({
      width: max.width,
      height: min.height,
    });
    expect(clampPlaygroundSize(button, button.size)).toEqual(button.size);
  });

  describe('tamanho que respeita o sizing', () => {
    const button = () => {
      const entry = findEntry(catalog, 'm3-button');
      if (entry === undefined) throw new Error('sem botão');
      return entry;
    };
    const overflow = /conteúdo maior que a caixa/;

    it('hugAxes lê o sizing do componente', () => {
      expect(hugAxes(button().component!)).toEqual({ width: true, height: false });
    });

    it('label longo: a largura cresce e o desenho não corta', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'Confirmar compra' };
      const size = fittedSize(entry, values, approximateMeasurer);
      expect(size.width).toBeGreaterThan(120);
      expect(size.height).toBe(40);
      const drawing = drawEntry(entry, values, approximateMeasurer, size);
      expect(drawing?.warnings.join('|')).not.toMatch(overflow);
    });

    it('label curto: respeita o mínimo; eixo não-hug fica no size', () => {
      const entry = button();
      const size = fittedSize(
        entry,
        { ...entry.previewValues, label: 'A' },
        approximateMeasurer,
      );
      expect(size.width).toBeGreaterThanOrEqual(48);
      expect(size.height).toBe(40);
    });

    it('label enorme: limita ao dobro do size', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'x'.repeat(200) };
      const size = fittedSize(entry, values, approximateMeasurer);
      expect(size.width).toBe(240);
      const drawing = drawEntry(entry, values, approximateMeasurer, size);
      expect(drawing).not.toBeNull();
    });

    it('eixo desligado em auto usa o base', () => {
      const entry = button();
      const values = { ...entry.previewValues, label: 'Confirmar compra' };
      expect(
        fittedSize(entry, values, approximateMeasurer, {
          base: { width: 150, height: 40 },
          auto: { width: false },
        }),
      ).toEqual({ width: 150, height: 40 });
    });

    it('sem componente devolve 1x1', () => {
      const entry = { ...button(), component: null };
      expect(fittedSize(entry, {}, approximateMeasurer)).toEqual({ width: 1, height: 1 });
    });
  });

  it('expõe o código por plataforma e as fontes agrupadas', () => {
    const withCode = entries.filter((e) => e.code.length > 0);
    for (const entry of withCode) {
      for (const code of entry.code) {
        expect(code.symbol).toMatch(/\S/);
        expect(code.platform.name).toMatch(/\S/);
      }
    }
    for (const entry of entries) {
      expect(new Set(entry.sources.map((g) => g.system)).size).toBe(entry.sources.length);
    }
  });
});

describe('exemplo de sistema externo', () => {
  it('passa o nó pela origem declarada e desenha a árvore', () => {
    const withExample = files.map((f) => {
      if (f.path === 'material3.spec.json' && f.text !== undefined) {
        const spec = JSON.parse(f.text);
        const type = spec.layers[0].annotationTypes.find(
          (t: { id: string }) => t.id === 'm3-top-app-bar',
        );
        type.examples.push({
          name: 'Nó SDUI',
          system: 'sdui',
          file: 'examples/bar.sdui.json',
        });
        return { ...f, text: JSON.stringify(spec) };
      }
      return f;
    });
    withExample.push({
      path: 'examples/bar.sdui.json',
      text: JSON.stringify({ type: 'TopAppBar', props: { title: 'Olá' } }),
    });
    const withSystem = buildCatalog(withExample);
    const entry = findEntry(withSystem, 'm3-top-app-bar');
    const example = entry?.examples.find((e) => e.name === 'Nó SDUI');
    expect(example?.mode).toBe('system');
    expect(example?.json).toEqual({ type: 'TopAppBar', props: { title: 'Olá' } });
    const drawing = exampleDrawing(withSystem, entry!, example, approximateMeasurer);
    expect(drawing).not.toBeNull();
    expect(drawing?.root.children.length).toBeGreaterThan(0);
  });
});

describe('pacote quebrado de propósito', () => {
  it('componente ausente: não lança, mantém o relatório e a entrada sem componente', () => {
    const broken = buildCatalog(
      files.filter((f) => f.path !== 'components/m3-button.json'),
    );
    expect(broken.report.ok).toBe(false);
    const button = findEntry(broken, 'm3-button');
    expect(button?.component).toBeNull();
    expect(button?.componentProblem).toMatch(/ausente/);
    expect(button?.container).toBe(false);
    expect(exampleDrawing(broken, button!, undefined, approximateMeasurer)).toBeNull();
    expect(findEntry(broken, 'm3-card')?.component).not.toBeNull();
  });

  it('documento ausente: docText nulo', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'docs/m3-button.md'));
    expect(broken.report.ok).toBe(false);
    expect(findEntry(broken, 'm3-button')?.docText).toBeNull();
    expect(findEntry(broken, 'm3-card')?.docText).not.toBeNull();
  });

  it('sem especialização legível: catálogo vazio com o relatório', () => {
    const broken = buildCatalog(files.filter((f) => f.path !== 'material3.spec.json'));
    expect(broken.spec).toBeNull();
    expect(broken.layers).toEqual([]);
    expect(broken.report.ok).toBe(false);
    expect(buildCatalog([]).report.ok).toBe(false);
    expect(buildCatalog([{ path: 'a.spec.json', text: '{' }]).spec).toBeNull();
  });
});

describe('catálogo com variants no code (formatVersion 9)', () => {
  const build = (formatVersion = 9) =>
    buildCatalog([
      {
        path: 'm3.json',
        text: JSON.stringify(variantsSpecJson(formatVersion)),
      },
    ]);
  const codeOf = (typeId: string, formatVersion = 9) => {
    const entry = build(formatVersion)
      .layers.flatMap((l) => l.entries)
      .find((e) => e.type.id === typeId);
    return entry?.code[0];
  };

  it('a base fica como está e variants traz o campo e os casos na ordem das options', () => {
    const code = codeOf('button');
    expect(code).toMatchObject({
      platform: { id: 'compose', name: 'Compose', language: 'kotlin' },
      symbol: 'androidx.compose.material3.Button',
      path: BUTTON_PATH,
    });
    expect(code?.variants).toEqual({
      field: 'style',
      fieldLabel: 'style',
      cases: [
        {
          value: 'outlined',
          symbol: 'androidx.compose.material3.OutlinedButton',
          path: BUTTON_PATH,
        },
        {
          value: 'text',
          symbol: 'androidx.compose.material3.TextButton',
          path: TEXT_BUTTON_PATH,
        },
        {
          value: 'tonal',
          symbol: 'androidx.compose.material3.FilledTonalButton',
          path: BUTTON_PATH,
        },
      ],
    });
  });

  it('tipo sem variants não tem a chave', () => {
    expect(codeOf('card')).toBeDefined();
    expect('variants' in codeOf('card')!).toBe(false);
  });

  it('numa especialização 8 sem variants, o catálogo é o de sempre', () => {
    const json = variantsSpecJson(8) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete json.layers[0].annotationTypes[0].code.compose.variants;
    const code = buildCatalog([{ path: 'm3.json', text: JSON.stringify(json) }])
      .layers.flatMap((l) => l.entries)
      .find((e) => e.type.id === 'button')?.code[0];
    expect(code?.symbol).toBe('androidx.compose.material3.Button');
    expect(code && 'variants' in code).toBe(false);
  });
});
