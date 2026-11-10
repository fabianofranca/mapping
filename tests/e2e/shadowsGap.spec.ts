// MF2 no Chromium de verdade: a lista de sombras com `spread` e o contorno com vão arredondado
// (`stroke.gap`) desenhados pelo Konva (renderScene), lidos pixel a pixel, e a paridade com o
// raster do MCP (a mesma cena a 100% e a 420%, numa tolerância por canal escrita aqui). Não abre
// a app: monta o Konva numa página em branco, como o rotation.spec.
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

// O Konva e o raster do MCP rodam na mesma página, a partir do mesmo componente. Os bytes das
// fontes do raster (`font:*`) ficam vazios: a medida aqui é a aproximada.
const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
// Instancia o componente e desenha no Konva e no raster, no zoom pedido; os pixels (RGB) já
// compostos sobre branco.
window.draw = (component, width, height, zoom) => {
  const { root } = instantiate(component, {}, { x: 0, y: 0, width, height }, { measure: approximateMeasurer });
  const scene = { root, warnings: [] };
  const w = Math.round(width * zoom);
  const h = Math.round(height * zoom);
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: w, height: h });
  stage.scale({ x: zoom, y: zoom });
  const layer = new Layer();
  stage.add(layer);
  layer.add(renderScene(scene).root);
  layer.draw();
  const data = layer.getCanvas()._canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const konva = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) konva.push(Math.round(data[i + c] * a + 255 * (1 - a)));
  }
  host.remove();
  const target = createRaster(w, h);
  target.data.fill(255);
  paintScene(target, [scene], approximateMeasurer, { clip: { x: 0, y: 0, width: w, height: h }, scaleX: zoom, scaleY: zoom });
  const raster = [];
  for (let i = 0; i < target.data.length; i += 4) raster.push(target.data[i], target.data[i + 1], target.data[i + 2]);
  return { konva, raster };
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

async function load(page: Page): Promise<void> {
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
}

type Drawn = { konva: number[]; raster: number[] };
type Window = { draw: (c: object, w: number, h: number, zoom: number) => Drawn };

/** Os pixels RGB do Konva e do raster do MCP, no zoom pedido. */
async function drawBoth(
  page: Page,
  component: object,
  w: number,
  h: number,
  zoom: number,
) {
  await load(page);
  const { konva, raster } = await page.evaluate(
    ([c, width, height, z]) =>
      (window as unknown as Window).draw(
        c as object,
        width as number,
        height as number,
        z as number,
      ),
    [component, w, h, zoom] as const,
  );
  const width = Math.round(w * zoom);
  return {
    raster,
    rgb: konva,
    at: (x: number, y: number): number[] => {
      const i = (Math.round(y) * width + Math.round(x)) * 3;
      return konva.slice(i, i + 3);
    },
  };
}

function sceneOf(children: object[], width = 120, height = 70): object {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 's',
    name: 'S',
    size: { width, height },
    template: { type: 'frame', children },
  };
}

/** O cartão de duas sombras com `spread` (a de cima azul, a de baixo preta, as duas com desfoque). */
const card = (fill: string, shadow: object[]): object => ({
  type: 'rect',
  name: 'card',
  width: 60,
  height: 30,
  anchors: { left: 30, top: 18 },
  cornerRadius: 8,
  fill,
  shadow,
});

const TWO = [
  { color: '#0000ff99', y: 2, blur: 4, spread: 2 },
  { color: '#000000aa', y: 8, blur: 8, spread: -1 },
];

/** Tolerância por canal (0 a 255) e fração de pixels que pode passar dela (bordas e desfoque). */
const TOLERANCE = 40;
const OUTLIERS = 0.02;

function expectParity(konvaRgb: number[], rasterRgb: number[]): void {
  expect(konvaRgb.length).toBe(rasterRgb.length);
  let outliers = 0;
  for (let i = 0; i < konvaRgb.length; i += 3) {
    const far = [0, 1, 2].some(
      (c) => Math.abs(konvaRgb[i + c]! - rasterRgb[i + c]!) > TOLERANCE,
    );
    if (far) outliers++;
  }
  expect(outliers / (konvaRgb.length / 3)).toBeLessThan(OUTLIERS);
}

for (const zoom of [1, 4.2]) {
  test(`paridade com o raster a ${Math.round(zoom * 100)}%: duas sombras com spread`, async ({
    page,
  }) => {
    const scene = sceneOf([card('#ffffff', TWO)]);
    const drawn = await drawBoth(page, scene, 120, 70, zoom);
    expectParity(drawn.rgb, drawn.raster);
    // As duas aparecem: embaixo do cartão chega a preta (mais afastada) e acima só a azul.
    const below = drawn.at(60 * zoom, (18 + 30 + 9) * zoom);
    const above = drawn.at(60 * zoom, (18 - 3) * zoom);
    expect(below[0] ?? 255).toBeLessThan(250);
    expect(above[2] ?? 0).toBeGreaterThan(above[0] ?? 255);
  });

  test(`paridade com o raster a ${Math.round(zoom * 100)}%: contorno com vão arredondado`, async ({
    page,
  }) => {
    const scene = sceneOf([
      {
        type: 'frame',
        name: 'outline',
        anchors: { left: 10, top: 20, right: 10, bottom: 10 },
        cornerRadius: 6,
        stroke: {
          color: '#cc0000',
          width: 2,
          align: 'inside',
          gap: { node: 'label', padding: 4 },
        },
      },
      {
        type: 'text',
        name: 'label',
        text: 'Nome',
        width: 'hug',
        height: 'hug',
        anchors: { left: 20, top: 12 },
        font: { size: 10 },
        fill: '#000000',
      },
    ]);
    const drawn = await drawBoth(page, scene, 120, 70, zoom);
    expectParity(drawn.rgb, drawn.raster);
  });
}

test('o vão: a cor no vão é a do fundo e o canto é arredondado', async ({ page }) => {
  const scene = sceneOf([
    {
      type: 'frame',
      name: 'outline',
      anchors: { left: 10, top: 20, right: 10, bottom: 10 },
      cornerRadius: 6,
      stroke: {
        color: '#cc0000',
        width: 2,
        align: 'inside',
        gap: { node: 'label', padding: 4 },
      },
    },
    {
      type: 'rect',
      name: 'label',
      width: 30,
      height: 12,
      anchors: { left: 24, top: 14 },
    },
  ]);
  const drawn = await drawBoth(page, scene, 120, 70, 1);
  // O lado de cima do contorno está em y = 20 (a linha vai de 20 a 22); o vão é x de 20 a 58.
  expect(drawn.at(40, 21)).toEqual([255, 255, 255]);
  expect(drawn.at(80, 21)).toEqual([204, 0, 0]);
  // O canto de cima à esquerda é arredondado: o ponto do canto reto (10, 20) fica em branco.
  expect(drawn.at(10, 20)).toEqual([255, 255, 255]);
});

test('uma forma com preenchimento translúcido não muda de cor com várias sombras', async ({
  page,
}) => {
  const away = [
    { color: '#000000', x: 70, blur: 0 },
    { color: '#0000ff', x: -70, blur: 0, spread: 1 },
  ];
  const scene = sceneOf([card('#ff000080', away)], 200, 70);
  const drawn = await drawBoth(page, scene, 200, 70, 1);
  // Metade de vermelho sobre branco; um segundo desenho da forma daria 25% (#ff4040).
  const centre = drawn.at(60, 33);
  expect(centre[0]).toBe(255);
  expect(Math.abs((centre[1] ?? 0) - 127)).toBeLessThanOrEqual(1);
  expect(Math.abs((centre[2] ?? 0) - 127)).toBeLessThanOrEqual(1);
});

test('a forma da sombra não aparece em lugar nenhum fora da sombra', async ({ page }) => {
  const scene = sceneOf([card('#ffffff', TWO)]);
  const drawn = await drawBoth(page, scene, 120, 70, 1);
  // O canto da tela, longe do cartão e das sombras, fica branco.
  expect(drawn.at(2, 2)).toEqual([255, 255, 255]);
  expect(drawn.at(117, 67)).toEqual([255, 255, 255]);
});
