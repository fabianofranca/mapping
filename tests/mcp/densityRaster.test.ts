import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  createDrawingCache,
  loadSpecComponents,
  parseSpec,
  setContainerDensity,
  type ComponentCatalog,
  type Project,
  type Rect,
} from '../../src/model';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { emptyProject } from '../model/fixtures';

// Densidade (#1085, decisão 8): o mesmo componente num container 3x (174×120) e num 1x (58×40) a
// `zoom` 3 dá o mesmo PNG no raster do MCP, porque a escala vai na raiz da cena. `screen` e
// `stroke.scale: false` não escalam com a densidade.

const book = createFontBook();
const measure = measurerFor(book);

const SPEC_ID = 'dens';
const button = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'button',
  name: 'button',
  size: { width: 58, height: 40 },
  minSize: { width: 58, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center', padding: [0, 8] },
    fill: '#E8DEF8',
    cornerRadius: 20,
    stroke: { color: '#6750A4', width: 0.5 },
    shadow: { color: '#00000066', x: 0, y: 1, blur: 3 },
    children: [
      {
        type: 'text',
        name: 'rótulo',
        text: { $field: 'label', default: 'Salvar' },
        font: { size: 14, lineHeight: 20 },
        color: '#1D1B20',
      },
    ],
  },
};
const fixedBorder = {
  ...button,
  id: 'fixed',
  name: 'fixed',
  template: { ...button.template, stroke: { color: '#6750A4', width: 2, scale: false } },
};

function catalog(): ComponentCatalog {
  const spec = parseSpec({
    format: 'mapping-spec',
    formatVersion: 4,
    id: SPEC_ID,
    name: 'Dens',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#6750A4',
        annotationTypes: [button, fixedBorder].map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [{ key: 'label', type: 'string', default: 'Salvar' }],
        })),
      },
    ],
  });
  if (!spec.ok) throw new Error(spec.errors.join('\n'));
  const texts = new Map(
    [button, fixedBorder].map((c) => [`s/components/${c.id}.json`, JSON.stringify(c)]),
  );
  const loaded = loadSpecComponents(spec.spec, 's/dens.spec.json', 1, (p) =>
    texts.get(p),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
}

const cat = catalog();

function projectWith(typeId: string, rect: Rect, density: number): Project {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 4,
    id: SPEC_ID,
    name: 'Dens',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#6750A4',
        annotationTypes: [button, fixedBorder].map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [{ key: 'label', type: 'string', default: 'Salvar' }],
        })),
      },
    ],
  });
  if (!parsed.ok) throw new Error('spec');
  let p = applySpecialization(emptyProject(), parsed.spec, {
    newId: (() => {
      let n = 0;
      return () => `LS${++n}`;
    })(),
    packageSpecName: 'dens.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/t.png', width: 1080, height: 800 });
  p = setContainerDensity(p, 'I1', density);
  return addComponentMarking(
    p,
    cat,
    {
      markingId: 'M',
      annotationId: 'A',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      rect,
    },
    measure,
  );
}

function paint(p: Project, zoom: number): Raster {
  const drawings = createDrawingCache()(p, cat, measure, 0);
  const raster = createRaster(300, 200);
  raster.data.fill(255);
  paintScene(raster, [...drawings.values()], measure, {
    scaleX: zoom,
    scaleY: zoom,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    fonts: book,
  });
  return raster;
}

function maxDiff(a: Raster, b: Raster): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let worst = 0;
  for (let i = 0; i < a.data.length; i++)
    worst = Math.max(worst, Math.abs(a.data[i]! - b.data[i]!));
  return worst;
}

const inkCount = (r: Raster, bg = 255): number => {
  let n = 0;
  for (let i = 0; i < r.data.length; i += 4) if (r.data[i]! !== bg) n++;
  return n;
};

describe('paridade raster: container 3x × container 1x a zoom 3', () => {
  it('button 174×120 a 3x (zoom 1) é o mesmo PNG do button 58×40 a 1x (zoom 3)', () => {
    const dense = paint(
      projectWith('button', { x: 30, y: 30, width: 174, height: 120 }, 3),
      1,
    );
    const flat = paint(
      projectWith('button', { x: 10, y: 10, width: 58, height: 40 }, 1),
      3,
    );
    expect(inkCount(dense)).toBeGreaterThan(1000);
    expect(maxDiff(dense, flat)).toBeLessThanOrEqual(2);
  });

  it('a densidade 1 não muda o desenho (a matriz da raiz é só a translação)', () => {
    const p = projectWith('button', { x: 10, y: 10, width: 58, height: 40 }, 1);
    const root = createDrawingCache()(p, cat, measure, 0).get('M')!.root;
    expect(root.transform).toEqual([1, 0, 0, 1, 10, 10]);
  });

  it('stroke.scale: false mantém a largura em pixels de saída, com ou sem densidade', () => {
    const rect3 = { x: 30, y: 30, width: 174, height: 120 };
    const dense = paint(projectWith('fixed', rect3, 3), 1);
    const flat = paint(
      projectWith('fixed', { x: 10, y: 10, width: 58, height: 40 }, 1),
      3,
    );
    // O traço de 2 px de saída: a coluna de pixels do meio do botão cruza a borda de cima e a de baixo.
    const column = (r: Raster, x: number): number => {
      let n = 0;
      for (let y = 0; y < r.height; y++) {
        const i = (y * r.width + x) * 4;
        // roxo do traço: R baixo, B alto
        if (r.data[i]! < 140 && r.data[i + 2]! > 150) n++;
      }
      return n;
    };
    expect(column(dense, 100)).toBe(column(flat, 100));
    expect(column(dense, 100)).toBeGreaterThan(0);
  });
});
