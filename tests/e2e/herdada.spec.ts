// MF3 no Chromium de verdade: a cor herdada (`provide` no `slot` do pai, `$provided` na filha)
// desenhada pelo Konva (renderScene), lida pixel a pixel, e a paridade com o raster do MCP (a mesma
// cena a 100% e a 420%, numa tolerância por canal escrita aqui). Não abre a app: monta o Konva
// numa página em branco, como o shadowsGap.spec.
import { expect, test, type Page } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

// O pai e a filha são instanciados como o cache dos desenhos faz: o que o pai oferece
// (`provides`) vira o `provided` da filha, que vai como filha do quadro do pai. Os bytes das
// fontes do raster (`font:*`) ficam vazios (a cena não tem texto).
const ENTRY = `
import Konva from 'konva/lib/Core';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { createRaster } from './mcp/image/raster';
import { paintScene } from './mcp/image/sceneRaster';
Konva.autoDrawEnabled = false;
const measure = { measure: approximateMeasurer };
// O pai desenhado na caixa inteira com a filha (do componente \`child\`, se vier) em \`rect\`; sem
// \`parent\`, só a filha, sem ancestral. Devolve os pixels (RGB, sobre branco) do Konva e do raster.
window.draw = ({ parent, parentValues, child, rect, width, height, zoom }) => {
  const box = { x: 0, y: 0, width, height };
  let provided;
  let root;
  if (parent) {
    const top = instantiate(parent, parentValues ?? {}, box, measure);
    provided = top.provides;
    root = top.root;
  } else {
    root = instantiate({ ...child, template: { type: 'frame', layout: { type: 'none' }, children: [] } }, {}, box, measure).root;
  }
  const inner = instantiate(child, {}, rect, { ...measure, ...(provided ? { provided } : {}) });
  const scene = { root: { ...root, children: [...root.children, inner.root] }, warnings: [] };
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
  return { konva, raster, provided: provided ?? null };
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

interface Request {
  parent?: object;
  parentValues?: Record<string, string>;
  child: object;
  rect: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
  zoom: number;
}
type Drawn = {
  konva: number[];
  raster: number[];
  provided: Record<string, string> | null;
};
type Window = { draw: (request: Request) => Drawn };

/** Os pixels RGB do Konva e do raster do MCP, no zoom pedido. */
async function drawBoth(page: Page, request: Request) {
  await load(page);
  const { konva, raster, provided } = await page.evaluate(
    (r) => (window as unknown as Window).draw(r),
    request,
  );
  const width = Math.round(request.width * request.zoom);
  const at = (rgb: number[], x: number, y: number): number[] => {
    const i = (Math.round(y) * width + Math.round(x)) * 3;
    return rgb.slice(i, i + 3);
  };
  return {
    konva,
    raster,
    provided,
    at: (x: number, y: number) => at(konva, x, y),
    rasterAt: (x: number, y: number) => at(raster, x, y),
  };
}

const COMPONENT = { format: 'mapping-component', formatVersion: 4 };

/** O pai: um quadro creme de 120 × 70 com um `slot` que oferece `content-color` (campo `ink`, ou azul). */
const PARENT = {
  ...COMPONENT,
  id: 'card',
  name: 'Card',
  size: { width: 120, height: 70 },
  template: {
    type: 'frame',
    fill: '#FFF8E1',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        name: 'conteudo',
        anchors: { left: 4, top: 4, right: 4, bottom: 4 },
        layout: { type: 'none' },
        provide: { 'content-color': { $field: 'ink', default: '#1976D2' } },
      },
    ],
  },
};

/** A filha: uma barra de 60 × 20 que lê `content-color` (verde sem ancestral) e um ponto fixo preto. */
const CHILD = {
  ...COMPONENT,
  id: 'bar',
  name: 'Bar',
  size: { width: 60, height: 20 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'barra',
        anchors: { left: 0, top: 0 },
        width: 40,
        height: 20,
        fill: { $provided: 'content-color', default: '#2E7D32' },
        cornerRadius: 4,
      },
      {
        type: 'rect',
        name: 'ponto',
        anchors: { left: 48, top: 6 },
        width: 8,
        height: 8,
        fill: '#000000',
      },
    ],
  },
};

const RECT = { x: 20, y: 25, width: 60, height: 20 };
const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const GREEN = [0x2e, 0x7d, 0x32];
const BLACK = [0, 0, 0];
const CARD = [0xff, 0xf8, 0xe1];

/** Tolerância por canal (0 a 255) e fração de pixels que pode passar dela (bordas arredondadas). */
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

const request = (extra: Partial<Request> = {}): Request => ({
  parent: PARENT,
  child: CHILD,
  rect: RECT,
  width: 120,
  height: 70,
  zoom: 1,
  ...extra,
});

for (const zoom of [1, 4.2]) {
  test(`paridade com o raster a ${Math.round(zoom * 100)}%: a filha herda a cor do pai`, async ({
    page,
  }) => {
    const drawn = await drawBoth(page, request({ zoom }));
    expectParity(drawn.konva, drawn.raster);
    // A barra (x de 20 a 60, y de 25 a 45) é azul: o `default` do `ink` do pai.
    expect(drawn.at(40 * zoom, 35 * zoom)).toEqual(BLUE);
    expect(drawn.rasterAt(40 * zoom, 35 * zoom)).toEqual(BLUE);
    expect(drawn.at(72 * zoom, 35 * zoom)).toEqual(BLACK); // o ponto não lê nada
  });
}

test('o campo do pai muda a cor da filha, e o resto do desenho fica como estava', async ({
  page,
}) => {
  const before = await drawBoth(page, request());
  const after = await drawBoth(page, request({ parentValues: { ink: '#D32F2F' } }));
  expect(before.provided).toEqual({ 'content-color': '#1976D2' });
  expect(after.provided).toEqual({ 'content-color': '#D32F2F' });
  expect(before.at(40, 35)).toEqual(BLUE);
  expect(after.at(40, 35)).toEqual(RED);
  expect(after.rasterAt(40, 35)).toEqual(RED);
  expect(after.at(72, 35)).toEqual(BLACK);
  expect(after.at(5, 5)).toEqual(CARD);
  expectParity(after.konva, after.raster);
});

test('sem ancestral que ofereça a cor vale o default da filha', async ({ page }) => {
  const drawn = await drawBoth(page, request({ parent: undefined }));
  expect(drawn.provided).toBeNull();
  expect(drawn.at(40, 35)).toEqual(GREEN);
  expect(drawn.rasterAt(40, 35)).toEqual(GREEN);
  expectParity(drawn.konva, drawn.raster);
});

test('o campo `ink` vazio do pai oferece o default dele, não a tinta anterior', async ({
  page,
}) => {
  const drawn = await drawBoth(page, request({ parentValues: { ink: '' } }));
  expect(drawn.provided).toEqual({ 'content-color': '#1976D2' });
  expect(drawn.at(40, 35)).toEqual(BLUE);
});
