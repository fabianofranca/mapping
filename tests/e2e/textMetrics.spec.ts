// Medida do texto no Chromium: a altura de linha do canvas contra a do DOM (C4), o centro
// vertical do texto escalado (C5), `wrap`/`ellipsis`/`maxLines` no Konva de verdade (C1) e o texto
// rico (`runs`, CF4): a medida por trechos contra o desenho.
// Não abre a app: monta o medidor (`konvaMeasurer`) e o Konva numa página em branco.
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';

const ENTRY = `
import Konva from 'konva/lib/Core';
import { Text } from 'konva/lib/shapes/Text';
import { Layer } from 'konva/lib/Layer';
import { Stage } from 'konva/lib/Stage';
import { konvaMeasurer } from './src/canvas/components/konvaMeasurer';
import { renderScene } from './src/canvas/components/renderScene';
import { approximateMeasurer, instantiate } from './src/model/components/instantiate';
import { measureRichText } from './src/model/components/richText';
import { walk } from './src/model/components/scene';
Konva.autoDrawEnabled = false;
window.measure = konvaMeasurer;
window.measureRich = (which, runs, base, width) =>
  measureRichText(runs, base, which === 'konva' ? konvaMeasurer : approximateMeasurer, width);
// Monta o nó de texto rico com o medidor do Konva e o desenha: devolve o layout e as formas.
window.drawRich = (runs, width, height) => {
  const component = {
    format: 'mapping-component', formatVersion: 4, id: 'r', name: 'R', size: { width, height },
    template: { type: 'frame', layout: { type: 'none' }, children: [{
      type: 'text', name: 't', anchors: { left: 0, top: 0 }, width, height,
      font: { size: 13, lineHeight: 18, family: 'sans-serif' }, color: '#111111', runs,
    }] },
  };
  const { root } = instantiate(component, {}, { x: 0, y: 0, width, height }, { measure: konvaMeasurer });
  const text = [...walk(root)].find((n) => n.type === 'text');
  const shapes = renderScene({ root, warnings: [] }).root.find('Shape')
    .filter((shape) => shape.fill() !== 'transparent')
    .map((shape) => ({ kind: shape.className, text: shape.className === 'Text' ? shape.text() : '', x: shape.x(), y: shape.y(), width: shape.width(), height: shape.height() }));
  return { layout: text.runLayout, shapes };
};
// O texto 'H' com baselinePadding.top = 30 desenhado pelo renderScene: o pé da tinta, em px do nó.
window.baselineFoot = (zoom) => {
  const W = 120, H = 60;
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: W * zoom, height: H * zoom, scaleX: zoom, scaleY: zoom });
  const layer = new Layer();
  stage.add(layer);
  const component = {
    format: 'mapping-component', formatVersion: 4, id: 'b', name: 'B', size: { width: W, height: H },
    template: { type: 'frame', layout: { type: 'none' }, children: [{
      type: 'text', name: 't', anchors: { left: 0, top: 0 }, width: W, height: H, text: 'H',
      font: { size: 13, lineHeight: 1.2, family: 'sans-serif' }, color: '#000000',
      baselinePadding: { top: 30 },
    }] },
  };
  const { root } = instantiate(component, {}, { x: 0, y: 0, width: W, height: H }, { measure: konvaMeasurer });
  layer.add(renderScene({ root, warnings: [] }).root);
  layer.draw();
  const canvas = layer.getCanvas()._canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 128) { bottom = y; break; }
  }
  stage.destroy();
  return (bottom + 1) / zoom;
};
window.inkCenter = (zoom, align = 'middle') => {
  const W = 120, H = 28;
  const host = document.body.appendChild(document.createElement('div'));
  const stage = new Stage({ container: host, width: W * zoom, height: H * zoom, scaleX: zoom, scaleY: zoom });
  const layer = new Layer();
  stage.add(layer);
  if (align === 'cap-middle') {
    // O mesmo caminho do desenho: o nó da cena com cap-middle, pelo renderScene.
    const component = {
      format: 'mapping-component', formatVersion: 4, id: 'k', name: 'K', size: { width: W, height: H },
      template: { type: 'frame', layout: { type: 'none' }, children: [{
        type: 'text', name: 't', anchors: { left: 0, top: 0 }, width: W, height: H, text: 'HHHH',
        font: { size: 13, lineHeight: 1.2, family: 'sans-serif', verticalAlign: 'cap-middle' }, color: '#000000',
      }] },
    };
    const { root } = instantiate(component, {}, { x: 0, y: 0, width: W, height: H }, { measure: konvaMeasurer });
    layer.add(renderScene({ root, warnings: [] }).root);
  } else {
    layer.add(new Text({ text: 'HHHH', width: W, height: H, verticalAlign: 'middle', fontFamily: 'sans-serif', fontSize: 13, lineHeight: 1.2, fill: '#000' }));
  }
  layer.draw();
  const canvas = layer.getCanvas()._canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let top = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    let ink = false;
    for (let x = 0; x < canvas.width && !ink; x++) ink = data[(y * canvas.width + x) * 4 + 3] > 128;
    if (ink) { if (top < 0) top = y; bottom = y; }
  }
  stage.destroy();
  return (top + bottom + 1) / 2 / zoom - H / 2;
};
`;

interface Metrics {
  width: number;
  height: number;
  lines: string[];
}
type Measure = (text: string, font: object, maxWidth?: number) => Metrics;
type MeasureRich = (
  which: 'konva' | 'approx',
  runs: object[],
  base: object,
  width: number,
) => Metrics;
interface DrawnShape {
  kind: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
type DrawRich = (
  runs: object[],
  width: number,
  height: number,
) => { layout: { height: number; lines: unknown[] }; shapes: DrawnShape[] };

let bundle = '';

async function load(page: Page): Promise<void> {
  if (bundle === '') {
    const result = await build({
      stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
    });
    bundle = result.outputFiles[0]!.text;
  }
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: bundle });
}

const FONT = {
  family: 'sans-serif',
  size: 13,
  weight: 400,
  italic: false,
  letterSpacing: 0,
};

/** Altura do mesmo texto num `<div>` do DOM com `line-height` dado. */
async function domHeight(page: Page, lineHeight: string, text: string): Promise<number> {
  return page.evaluate(
    ([lh, t]) => {
      const div = document.body.appendChild(document.createElement('div'));
      div.style.cssText = `font:13px sans-serif;line-height:${lh};width:300px;white-space:pre-line;position:absolute`;
      div.textContent = t ?? '';
      return div.getBoundingClientRect().height;
    },
    [lineHeight, text],
  );
}

const measure = (page: Page, lineHeight: number, text: string, maxWidth?: number) =>
  page.evaluate(
    ([f, t, w]) => (window as never as { measure: Measure }).measure(t, f, w),
    [{ ...FONT, lineHeight }, text, maxWidth] as const,
  ) as Promise<{ width: number; height: number; lines: string[] }>;

test.describe('texto no Chromium', () => {
  test('C4: parágrafo de 2 linhas com lineHeight em px mede 37, como o DOM', async ({
    page,
  }) => {
    await load(page);
    const text = 'Primeira linha\nSegunda linha';
    expect(await domHeight(page, '18.5px', text)).toBe(37);
    expect((await measure(page, 18.5, text)).height).toBe(37);
  });

  test('C4: multiplicador 1,4 × 13 não arredonda antes de multiplicar (2 linhas = 36,4)', async ({
    page,
  }) => {
    await load(page);
    const text = 'Primeira linha\nSegunda linha';
    const measured = (await measure(page, 1.4 * 13, text)).height;
    expect(measured).toBeCloseTo(36.4, 6);
    // O DOM guarda a altura em 1/64 px: a diferença para o canvas é menor que 0,1 px.
    expect(Math.abs((await domHeight(page, '1.4', text)) - measured)).toBeLessThan(0.1);
  });

  test('C5: o texto escalado a 420% fica no mesmo centro vertical do 100% (≤ 1 px na escala)', async ({
    page,
  }) => {
    await load(page);
    const at = (zoom: number) =>
      page.evaluate(
        (z) => (window as never as { inkCenter: (z: number) => number }).inkCenter(z),
        zoom,
      );
    const base = await at(1);
    const zoomed = await at(4.2);
    // A causa conhecida da diferença está no ascent/descent que o navegador entrega ao Konva
    // (medidas em px inteiros na fonte sem escala, multiplicadas pelo zoom): não vem de
    // arredondamento do `renderScene`. Aqui o limite documentado é 1 px (na escala do 100%).
    expect(Math.abs(zoomed - base)).toBeLessThanOrEqual(1);
  });

  test('FX1: cap-middle centra o texto pela maiúscula a ≤ 0,5 px do centro da caixa, a 100% e a 420%', async ({
    page,
  }) => {
    await load(page);
    const at = (zoom: number) =>
      page.evaluate(
        (z) =>
          (window as never as { inkCenter: (z: number, a: string) => number }).inkCenter(
            z,
            'cap-middle',
          ),
        zoom,
      );
    expect(Math.abs(await at(1))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(await at(4.2))).toBeLessThanOrEqual(0.5);
  });

  test('MC1: a firstBaseline do konvaMeasurer fica a ≤ 0,5 px da linha de base do DOM (sans-serif 13 px, lineHeight 1,2)', async ({
    page,
  }) => {
    await load(page);
    const measured = await measure(page, 1.2 * 13, 'Hxg');
    const dom = await page.evaluate(() => {
      const div = document.body.appendChild(document.createElement('div'));
      div.style.cssText =
        'font:13px sans-serif;line-height:1.2;position:absolute;top:0;left:0;width:300px';
      div.textContent = 'Hxg';
      // Uma caixa inline-block vazia assenta o fundo dela na linha de base.
      const probe = div.appendChild(document.createElement('span'));
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      return probe.getBoundingClientRect().bottom - div.getBoundingClientRect().top;
    });
    const first = (measured as { firstBaseline?: number }).firstBaseline;
    expect(first).toBeDefined();
    expect(Math.abs((first ?? 0) - dom)).toBeLessThanOrEqual(0.5);
    expect((measured as { lineCount?: number }).lineCount).toBe(1);
  });

  test('MC1: baselinePadding.top 30 põe o pé do "H" a ≤ 0,5 px de 30 do topo, a 100% e a 420%', async ({
    page,
  }) => {
    await load(page);
    const at = (zoom: number) =>
      page.evaluate(
        (z) =>
          (window as never as { baselineFoot: (z: number) => number }).baselineFoot(z),
        zoom,
      );
    expect(Math.abs((await at(1)) - 30)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((await at(4.2)) - 30)).toBeLessThanOrEqual(0.5);
  });

  test('#941: com maxWidth a largura é a natural do texto, não o limite', async ({
    page,
  }) => {
    await load(page);
    const natural = await measure(page, 16, 'OK');
    const bounded = await measure(page, 16, 'OK', 400);
    expect(bounded.width).toBeLessThan(100);
    expect(Math.abs(bounded.width - natural.width)).toBeLessThanOrEqual(1);
    // Quebrado em várias linhas: a largura é a da linha mais larga, e cabe no limite.
    const wrapped = await measure(page, 16, 'Texto longo demais para a caixa', 80);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.width).toBeLessThanOrEqual(80);
    expect(wrapped.width).toBeGreaterThan(0);
  });

  test('FX4: um parágrafo com a largura medida do DOM quebra nas mesmas palavras (folga de 0,5 px)', async ({
    page,
  }) => {
    await load(page);
    const text = 'Pagar fatura do cartão de crédito com vencimento amanhã cedo';
    const words = text.split(' ');
    // Para cada prefixo de palavras, a largura do DOM (sem quebra) vira a largura da caixa: o
    // DOM mantém tudo numa linha, e o medidor do Konva tem de fazer o mesmo (sem tirar a palavra
    // por uma fração de pixel). Depois, a mesma caixa 3 px menor quebra igual nos dois.
    const domLines = (width: number) =>
      page.evaluate(
        ([t, w]) => {
          const div = document.body.appendChild(document.createElement('div'));
          div.style.cssText = `font:13px sans-serif;width:${w}px;position:absolute;left:0;top:0`;
          div.textContent = String(t);
          const node = div.firstChild as Text;
          const lines: string[][] = [];
          let top = -1;
          let start = 0;
          for (const word of String(t).split(' ')) {
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + word.length);
            const y = Math.round(range.getBoundingClientRect().top);
            if (y !== top) lines.push([]);
            top = y;
            lines[lines.length - 1]!.push(word);
            start += word.length + 1;
          }
          div.remove();
          return lines.map((l) => l.join(' '));
        },
        [text, width] as const,
      );
    const domWidth = (prefix: string) =>
      page.evaluate((t) => {
        const span = document.body.appendChild(document.createElement('span'));
        span.style.cssText = 'font:13px sans-serif;white-space:nowrap;position:absolute';
        span.textContent = t;
        const w = span.getBoundingClientRect().width;
        span.remove();
        return w;
      }, prefix);
    for (let n = 2; n <= words.length; n++) {
      const prefix = words.slice(0, n).join(' ');
      const width = await domWidth(prefix);
      const konva = await measure(page, 16, text, width);
      const dom = await domLines(width);
      expect(konva.lines, `largura ${width} (${n} palavras)`).toEqual(dom);
      // Uma fração de pixel a menos (a soma das larguras das palavras difere do DOM na ponta
      // do float) não tira a última palavra da linha: é a folga de 0,5 px.
      const slack = await measure(page, 16, text, width - 0.3);
      expect(slack.lines, `largura ${width} − 0,3 (${n} palavras)`).toEqual(dom);
    }
  });

  test('C1: wrap none é uma linha só; com ellipsis termina em … e cabe na largura', async ({
    page,
  }) => {
    await load(page);
    const text = 'Texto longo demais para a caixa';
    const wrapped = await measure(page, 16, text, 80);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    const measureWith = (extra: Record<string, unknown>) =>
      page.evaluate(
        ([f, t]) => (window as never as { measure: Measure }).measure(t, f, 80),
        [{ ...FONT, lineHeight: 16, ...extra }, text] as const,
      ) as Promise<{ width: number; height: number; lines: string[] }>;
    const none = await measureWith({ wrap: 'none' });
    expect(none.height).toBe(16);
    const dots = await measureWith({ wrap: 'none', ellipsis: true });
    expect(dots.height).toBe(16);
    expect(dots.lines).toHaveLength(1);
    expect(dots.lines[0]!.endsWith('…')).toBe(true);
    const cut = await measureWith({ maxLines: 2 });
    expect(cut.height).toBe(32);
    expect(cut.lines).toHaveLength(2);
    expect(cut.lines.some((l) => l.endsWith('…'))).toBe(false);
    const both = await measureWith({ maxLines: 2, ellipsis: true });
    expect(both.lines).toHaveLength(2);
    expect(both.lines[1]!.endsWith('…')).toBe(true);
  });

  test('CF4: konvaMeasurer e approximateMeasurer concordam em ±1 linha num texto rico de 3 trechos', async ({
    page,
  }) => {
    await load(page);
    const base = { size: 13, lineHeight: 18 };
    const font = { ...FONT, lineHeight: 18 };
    const runs = [
      { text: 'Vence em ', font },
      { text: '3 dias úteis ', font: { ...font, weight: 700 } },
      { text: 'para pagar a fatura do cartão', font },
    ];
    for (const width of [120, 200, 320]) {
      const rich = (which: 'konva' | 'approx') =>
        page.evaluate(
          ([w, r, b, mw]) =>
            (window as never as { measureRich: MeasureRich }).measureRich(w, r, b, mw),
          [which, runs, base, width] as const,
        );
      const konva = await rich('konva');
      const approx = await rich('approx');
      expect(
        Math.abs(konva.lines.length - approx.lines.length),
        `largura ${width}`,
      ).toBeLessThanOrEqual(1);
      expect(konva.height).toBe(konva.lines.length * 18);
    }
  });

  test('CF4: a medida por trechos dá a altura do desenho, e o espaço inicial de " novo" conta', async ({
    page,
  }) => {
    await load(page);
    const chip = { background: '#ffeecc', radius: 4, padding: [2, 4] };
    const runs = [
      { text: 'Pagamento recebido com sucesso em ' },
      { text: ' novo', ...chip },
      { text: ' e conferido', weight: 700 },
    ];
    const drawn = await page.evaluate(
      ([r]) => (window as never as { drawRich: DrawRich }).drawRich(r, 140, 120),
      [runs] as const,
    );
    // A medida do modelo com o medidor do Konva é a mesma que o desenho usa.
    const base = { size: 13, lineHeight: 18 };
    const font = { ...FONT, lineHeight: 18 };
    const measured = await page.evaluate(
      ([r, b, f]) =>
        (window as never as { measureRich: MeasureRich }).measureRich(
          'konva',
          [
            { text: r[0]!.text, font: f },
            { text: r[1]!.text, font: f, chip: { padding: [2, 4] as [number, number] } },
            { text: r[2]!.text, font: { ...f, weight: 700 } },
          ],
          b,
          140,
        ),
      [runs, base, font] as const,
    );
    expect(drawn.layout.height).toBeCloseTo(measured.height, 6);
    expect(drawn.layout.lines.length).toBe(measured.lines.length);
    expect(drawn.layout.lines.length).toBeGreaterThan(1);
    // O fundo mais baixo do desenho termina onde o layout termina.
    const bottom = Math.max(...drawn.shapes.map((s) => s.y + s.height));
    expect(bottom).toBeLessThanOrEqual(drawn.layout.height + 1e-6);
    expect(bottom).toBeGreaterThan(drawn.layout.height - 18);
    // O texto do chip é desenhado com o espaço inicial.
    expect(drawn.shapes.some((s) => s.kind === 'Text' && s.text === ' novo')).toBe(true);
    // O espaço conta: " novo" mede mais que "novo" no medidor do Konva.
    const spaced = await measure(page, 18, ' novo');
    const bare = await measure(page, 18, 'novo');
    expect(spaced.width).toBeGreaterThan(bare.width);
  });
});
