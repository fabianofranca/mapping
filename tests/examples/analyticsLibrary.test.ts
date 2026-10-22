// Biblioteca de exemplo de analytics (`examples/libraries/analytics/`, ME4): o pacote valida sem
// erro, o Evento desenha a tabela do `preview` e a Transição só se aplica a setas.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';

const ROOT = join(__dirname, '../../examples/libraries/analytics');
const SPEC_FILE = 'analytics.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('biblioteca de exemplo analytics', () => {
  it('tem a especialização, um componente e um documento por tipo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [SPEC_FILE, 'components/evento.json', 'docs/evento.md', 'docs/transicao.md'].sort(),
    );
  });

  it('valida sem erro nos três níveis e sem aviso', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    // Nenhum aviso: o preview cabe até no tamanho mínimo.
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 1, docs: 2 });
  });

  it('a especialização é a formatVersion 7: Evento flutuante com componente e Transição só de seta', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec).toMatchObject({ formatVersion: 7, id: 'analytics', version: 1 });
    const [layer] = parsed.spec.layers;
    expect(layer).toMatchObject({ id: 'analytics', name: 'Analytics' });
    const [evento, transicao] = layer?.annotationTypes ?? [];
    expect(evento).toMatchObject({
      id: 'evento',
      floating: true,
      labelField: 'nome',
      component: 'components/evento.json',
    });
    expect(evento?.appliesTo).toBeUndefined();
    const props = evento?.fields.find((f) => f.key === 'propriedades');
    expect(props?.type === 'table' && props.columns).toMatchObject([
      { key: 'propriedade', type: 'string', required: true },
      { key: 'valor', type: 'string' },
    ]);
    expect(transicao).toMatchObject({ id: 'transicao', appliesTo: ['arrow'] });
    expect(transicao?.component).toBeUndefined();
    expect(transicao?.floating).toBeUndefined();
    expect(transicao?.fields.map((f) => f.key)).toEqual(['condicao', 'evento']);
  });

  it('os documentos dizem como o evento e a transição se ligam por seta', () => {
    expect(text('docs/evento.md')).toMatch(/seta/);
    expect(text('docs/transicao.md')).toMatch(/seta/);
  });

  it('o Evento desenha o preview: cabeçalho com o nome e uma linha por propriedade', () => {
    const catalog = buildCatalog(files);
    expect(catalog.report.errors).toEqual([]);
    const entry = findEntry(catalog, 'evento');
    expect(entry?.component?.formatVersion).toBe(2);
    expect(entry?.previewValues?.propriedades).toHaveLength(3);
    const drawing = drawEntry(entry!, entry!.previewValues ?? {}, approximateMeasurer);
    expect(drawing?.warnings).toEqual([]);
    const texts: string[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'text') texts.push(node.text);
      if (node.type === 'frame') node.children.forEach(visit);
    };
    if (drawing) visit(drawing.root);
    expect(texts).toEqual([
      'checkout_started',
      'origem',
      'carrinho',
      'itens',
      '3',
      'total',
      '149,90',
    ]);
  });
});
