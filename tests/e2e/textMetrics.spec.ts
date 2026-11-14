// Text measurement in Chromium: the canvas line height against the DOM one (C4), the vertical
// center of scaled text (C5), `wrap`/`ellipsis`/`maxLines` in the real Konva (C1) and rich
// text (`runs`, CF4): the per-run measurement against the drawing.
// It does not open the app: it mounts the measurer (`konvaMeasurer`) and Konva on a blank page.
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
// Mounts the rich text node with the Konva measurer and draws it: returns the layout and the shapes.
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
// The text 'H' with baselinePadding.top = 30 drawn by renderScene: the ink foot, in node px.
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
    // The same path as the drawing: the scene node with cap-middle, through renderScene.
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

/** Height of the same text in a DOM `<div>` with the given `line-height`. */
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

test.describe('text in Chromium', () => {
  test('C4: 2-line paragraph with lineHeight in px measures 37, like the DOM', async ({
    page,
  }) => {
    await load(page);
    const text = 'First line\nSecond line';
    expect(await domHeight(page, '18.5px', text)).toBe(37);
    expect((await measure(page, 18.5, text)).height).toBe(37);
  });

  test('C4: multiplier 1.4 × 13 does not round before multiplying (2 lines = 36.4)', async ({
    page,
  }) => {
    await load(page);
    const text = 'First line\nSecond line';
    const measured = (await measure(page, 1.4 * 13, text)).height;
    expect(measured).toBeCloseTo(36.4, 6);
    // The DOM keeps the height in 1/64 px: the difference from the canvas is under 0.1 px.
    expect(Math.abs((await domHeight(page, '1.4', text)) - measured)).toBeLessThan(0.1);
  });

  test('C5: text scaled at 420% stays at the same vertical center as at 100% (≤ 1 px at the scale)', async ({
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
    // The known cause of the difference is in the ascent/descent that the browser hands to Konva
    // (measured in whole px on the unscaled font, multiplied by the zoom): it does not come from
    // `renderScene` rounding. Here the documented limit is 1 px (at the 100% scale).
    expect(Math.abs(zoomed - base)).toBeLessThanOrEqual(1);
  });

  test('FX1: cap-middle centers the text by the capital letter within ≤ 0.5 px of the box center, at 100% and 420%', async ({
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

  test('MC1: the konvaMeasurer firstBaseline is within ≤ 0.5 px of the DOM baseline (sans-serif 13 px, lineHeight 1.2)', async ({
    page,
  }) => {
    await load(page);
    const measured = await measure(page, 1.2 * 13, 'Hxg');
    const dom = await page.evaluate(() => {
      const div = document.body.appendChild(document.createElement('div'));
      div.style.cssText =
        'font:13px sans-serif;line-height:1.2;position:absolute;top:0;left:0;width:300px';
      div.textContent = 'Hxg';
      // An empty inline-block box settles its bottom on the baseline.
      const probe = div.appendChild(document.createElement('span'));
      probe.style.cssText = 'display:inline-block;width:0;height:0';
      return probe.getBoundingClientRect().bottom - div.getBoundingClientRect().top;
    });
    const first = (measured as { firstBaseline?: number }).firstBaseline;
    expect(first).toBeDefined();
    expect(Math.abs((first ?? 0) - dom)).toBeLessThanOrEqual(0.5);
    expect((measured as { lineCount?: number }).lineCount).toBe(1);
  });

  test('MC1: baselinePadding.top 30 puts the foot of the "H" within ≤ 0.5 px of 30 from the top, at 100% and 420%', async ({
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

  test('#941: with maxWidth the width is the natural text width, not the limit', async ({
    page,
  }) => {
    await load(page);
    const natural = await measure(page, 16, 'OK');
    const bounded = await measure(page, 16, 'OK', 400);
    expect(bounded.width).toBeLessThan(100);
    expect(Math.abs(bounded.width - natural.width)).toBeLessThanOrEqual(1);
    // Broken into several lines: the width is that of the widest line, and it fits the limit.
    const wrapped = await measure(
      page,
      16,
      'Text far too long to fit inside the box',
      80,
    );
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.width).toBeLessThanOrEqual(80);
    expect(wrapped.width).toBeGreaterThan(0);
  });

  test('FX4: a paragraph with the DOM-measured width wraps at the same words (0.5 px slack)', async ({
    page,
  }) => {
    await load(page);
    const text = 'Pay the credit card bill due early tomorrow morning';
    const words = text.split(' ');
    // For each word prefix, the DOM width (without wrapping) becomes the box width: the
    // DOM keeps everything on one line, and the Konva measurer has to do the same (without dropping the word
    // by a fraction of a pixel). Then, the same box 3 px smaller wraps the same in both.
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
      // A fraction of a pixel less (the sum of the word widths differs from the DOM at the tip
      // of the float) does not take the last word off the line: that is the 0.5 px slack.
      const slack = await measure(page, 16, text, width - 0.3);
      expect(slack.lines, `largura ${width} − 0,3 (${n} palavras)`).toEqual(dom);
    }
  });

  test('C1: wrap none is a single line; with ellipsis it ends in … and fits the width', async ({
    page,
  }) => {
    await load(page);
    const text = 'Text far too long to fit inside the box';
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

  test('CF4: konvaMeasurer and approximateMeasurer agree within ±1 line on a rich text of 3 runs', async ({
    page,
  }) => {
    await load(page);
    const base = { size: 13, lineHeight: 18 };
    const font = { ...FONT, lineHeight: 18 };
    const runs = [
      { text: 'Due in ', font },
      { text: '3 business days ', font: { ...font, weight: 700 } },
      { text: 'to pay the card bill', font },
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
        `width ${width}`,
      ).toBeLessThanOrEqual(1);
      expect(konva.height).toBe(konva.lines.length * 18);
    }
  });

  test('CF4: the per-run measurement gives the drawing height, and the leading space of " new" counts', async ({
    page,
  }) => {
    await load(page);
    const chip = { background: '#ffeecc', radius: 4, padding: [2, 4] };
    const runs = [
      { text: 'Payment received successfully ' },
      { text: ' new', ...chip },
      { text: ' and verified', weight: 700 },
    ];
    const drawn = await page.evaluate(
      ([r]) => (window as never as { drawRich: DrawRich }).drawRich(r, 140, 120),
      [runs] as const,
    );
    // The model measurement with the Konva measurer is the same one the drawing uses.
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
    // The lowest bottom of the drawing ends where the layout ends.
    const bottom = Math.max(...drawn.shapes.map((s) => s.y + s.height));
    expect(bottom).toBeLessThanOrEqual(drawn.layout.height + 1e-6);
    expect(bottom).toBeGreaterThan(drawn.layout.height - 18);
    // The chip text is drawn with the leading space.
    expect(drawn.shapes.some((s) => s.kind === 'Text' && s.text === ' new')).toBe(true);
    // The space counts: " new" measures more than "new" in the Konva measurer.
    const spaced = await measure(page, 18, ' new');
    const bare = await measure(page, 18, 'new');
    expect(spaced.width).toBeGreaterThan(bare.width);
  });
});
