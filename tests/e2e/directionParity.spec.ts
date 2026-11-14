// R1 (#1096): paridade Konva × raster do MCP da direção de leitura, no Chromium de verdade. A caixa
// de tinta (bbox dos pixels pintados) do ícone e do caminho espelhados em rtl difere ≤ 0,5 px entre
// os dois; o texto rtl com align right/left cai no mesmo lado físico (a borda da tinta, ≤ 2 px:
// o raster sem fontes desenha barras, o Konva os glifos). Limite conhecido: os glifos saem na ordem
// do texto, sem bidi. Não abre a app: monta o Konva numa página em branco (como shadowsGap.spec).
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Instancia o componente (com a direção e os ícones) e desenha no Konva e no raster; devolve a caixa
// de tinta (pixels escuros sobre branco) de cada um.
window.draw = (component, width, height, direction, icons) => {
  const options = { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) };
  const { root } = instantiate(component, {}, { x: 0, y: 0, width, height }, options);
  const scene = { root, warnings: [] };
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width, height });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene(scene).root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const box = (get) => {
    let left = Infinity; let right = -Infinity;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (get(y * width + x) < 128) { left = Math.min(left, x); right = Math.max(right, x + 1); }
    }
    return { left, right };
  };
  const konva = box((i) => { const a = data[i * 4 + 3] / 255; return data[i * 4 + 1] * a + 255 * (1 - a); });
  host.remove();
  const target = createRaster(width, height);
  target.data.fill(255);
  paintScene(target, [scene], approximateMeasurer, { clip: { x: 0, y: 0, width, height }, scaleX: 1, scaleY: 1 });
  return { konva, raster: box((i) => target.data[i * 4 + 1]) };
};
`;

const stubFonts: Plugin = {
  name: 'font-stub',
  setup(b) {
    b.onResolve({ filter: /^font:/ }, (args) => ({
      path: args.path,
      namespace: 'font-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'font-stub' }, () => ({
      contents: 'export default new Uint8Array(0);',
      loader: 'js',
    }));
  },
};

let bundle = '';

type Ink = { left: number; right: number };
type Drawn = { konva: Ink; raster: Ink };
type Window = {
  draw: (c: object, w: number, h: number, d: string | undefined, i: object) => Drawn;
};

const ICONS = {
  viewBox: [24, 24],
  icons: {
    back: {
      mirror: true,
      paths: [{ d: 'M2 4L20 4L20 10L2 10Z', fill: true }],
    },
  },
};

async function draw(page: Page, children: object[], direction?: 'rtl'): Promise<Drawn> {
  if (bundle === '') {
    const result = await build({
      stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      plugins: [stubFonts],
    });
    bundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: bundle });
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 's',
    name: 'S',
    size: { width: 60, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children },
  };
  return page.evaluate(
    ([c, d, i]) =>
      (window as unknown as Window).draw(c as object, 60, 40, d as never, i as object),
    [component, direction, ICONS] as const,
  );
}

const icon = { type: 'icon', name: 'back', width: 24, height: 24, color: '#000000' };
const path = {
  type: 'path',
  name: 'p',
  d: 'M2 0L20 0L20 10L2 10Z',
  viewBox: [24, 10],
  width: 48,
  height: 20,
  mirror: true,
  fill: '#000000',
};

for (const [label, node, rtl] of [
  ['ícone', icon, { left: 40, right: 58 }],
  ['caminho', path, { left: 20, right: 56 }],
] as const) {
  test(`${label} espelhado em rtl: a tinta do Konva e do raster difere ≤ 0,5 px`, async ({
    page,
  }) => {
    const drawn = await draw(page, [node], 'rtl');
    expect(Math.abs(drawn.konva.left - drawn.raster.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(drawn.konva.right - drawn.raster.right)).toBeLessThanOrEqual(0.5);
    expect(drawn.raster).toEqual(rtl);
  });

  test(`${label} em ltr: a mesma paridade, sem espelho`, async ({ page }) => {
    const drawn = await draw(page, [node]);
    expect(Math.abs(drawn.konva.left - drawn.raster.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(drawn.konva.right - drawn.raster.right)).toBeLessThanOrEqual(0.5);
  });
}

for (const align of ['right', 'left'] as const) {
  test(`texto rtl com align ${align}: a tinta cai do mesmo lado físico`, async ({
    page,
  }) => {
    const text = {
      type: 'text',
      name: 't',
      text: 'HHH',
      width: 60,
      height: 20,
      color: '#000000',
      font: { family: 'sans-serif', size: 12, align, lineHeight: 14 },
    };
    const drawn = await draw(page, [text], 'rtl');
    const edge = align === 'right' ? 'right' : 'left';
    expect(Math.abs(drawn.konva[edge] - drawn.raster[edge])).toBeLessThanOrEqual(2);
    // e é mesmo o lado pedido: a tinta encosta na borda, longe da oposta
    expect(
      Math.abs(drawn.raster[edge] - (align === 'right' ? 60 : 0)),
    ).toBeLessThanOrEqual(2);
  });
}
