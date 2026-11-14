// R1 (#1096): `direction` ('ltr' | 'rtl') em createViewer/ViewerInput, repassada ao
// screenFromSource/layoutScreen da tela calculada de `source`.
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';
import settings from '../../viewer/samples/settings.sdui.json';
import { M3_FILES } from '../../viewer/samples/samplesMaterial3';
import { ScreenRenderer } from '../../src/canvas/components/screenRenderer';
import { type Viewer, type ViewerOptions, createViewer } from '../../viewer';

beforeAll(() => installFakeCanvas());

const m3 = loadLibrary(M3_FILES);
const mounted: Viewer[] = [];

function make(options: ViewerOptions): Viewer {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  const viewer = createViewer(el, { measure: approximateMeasurer, ...options });
  mounted.push(viewer);
  return viewer;
}

afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const direct = (direction?: 'ltr' | 'rtl') =>
  screenFromSource(m3, settings, {
    measure: approximateMeasurer,
    ...(direction ? { direction } : {}),
  }).screen!;

describe('createViewer: direction', () => {
  it('the viewer direction is the one of screenFromSource; the default is ltr', () => {
    const rtl = make({ library: m3, source: settings, direction: 'rtl' }).screen();
    expect(rtl).toEqual(direct('rtl'));
    expect(rtl).not.toEqual(direct('ltr'));
    expect(make({ library: m3, source: settings }).screen()).toEqual(direct());
    expect(make({ library: m3, source: settings, direction: 'ltr' }).screen()).toEqual(
      direct('ltr'),
    );
  });

  it('update({ direction }) recalcula a tela de source e avisa onSource', () => {
    const onSource = vi.fn();
    const viewer = make({ library: m3, source: settings, onSource });
    expect(onSource).toHaveBeenCalledTimes(1);
    viewer.update({ direction: 'rtl' });
    expect(onSource).toHaveBeenCalledTimes(2);
    expect(viewer.screen()).toEqual(direct('rtl'));
    viewer.update({ direction: 'rtl' });
    expect(onSource).toHaveBeenCalledTimes(2);
    viewer.update({ direction: 'ltr' });
    expect(viewer.screen()).toEqual(direct('ltr'));
  });
});

describe('createViewer: direction inside the components', () => {
  /** The direction the viewer handed to the components engine in the last update. */
  function lastDirection(spy: { mock: { calls: unknown[][] } }): unknown {
    const options = spy.mock.calls.at(-1)?.[2] as { direction?: string } | undefined;
    return options?.direction;
  }

  it('the direction reaches the ScreenRenderer (mirrored interior), at the start and by update', () => {
    const spy = vi.spyOn(ScreenRenderer.prototype, 'update');
    const viewer = make({ library: m3, source: settings, direction: 'rtl' });
    expect(lastDirection(spy)).toBe('rtl');
    viewer.update({ direction: 'ltr' });
    expect(lastDirection(spy)).toBe('ltr');
    viewer.update({ direction: 'rtl' });
    expect(lastDirection(spy)).toBe('rtl');
    spy.mockRestore();
  });

  it('without the option the default is ltr (nothing is passed to the engine)', () => {
    const spy = vi.spyOn(ScreenRenderer.prototype, 'update');
    make({ library: m3, source: settings });
    expect(lastDirection(spy)).toBeUndefined();
    spy.mockRestore();
  });
});

describe('createViewer: direction da tela e interior espelhado (R2, #1107)', () => {
  /** Um `row` de 100x40 com dois filhos fixos (20 e 30 de largura), numa origem `sdui`. */
  const pair = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'pair',
    name: 'Par',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'row', align: 'start' },
      children: [
        { type: 'rect', width: 20, height: 10, fill: '#FF0000' },
        { type: 'rect', width: 30, height: 10, fill: '#0000FF' },
      ],
    },
  };
  const originOf = (direction?: string) => ({
    system: 'sdui',
    node: { type: 'type', props: 'props', children: 'children' },
    screen: {
      id: 'tela',
      width: { path: 'w' },
      height: { path: 'h' },
      roots: [{ path: 'content', anchor: 'top-start' }],
      ...(direction ? { direction } : {}),
    },
  });
  const library = (direction?: string) =>
    loadLibrary([
      {
        path: 'spec.json',
        text: JSON.stringify({
          format: 'mapping-spec',
          formatVersion: 4,
          id: 'mini',
          name: 'Mini',
          version: 1,
          origins: [originOf(direction)],
          layers: [
            {
              id: 'l',
              name: 'L',
              annotationTypes: [
                {
                  id: 'pair',
                  name: 'Par',
                  component: 'components/pair.json',
                  sources: [{ system: 'sdui', name: 'Pair' }],
                  fields: [],
                },
              ],
            },
          ],
        }),
      },
      { path: 'components/pair.json', text: JSON.stringify(pair) },
    ]);
  const DOC = { w: 300, h: 100, content: { type: 'Pair' } };

  /** x, on screen, of the red (width 20) and blue (30) rectangles drawn inside the instance. */
  function rectXs(): { red: number; blue: number } {
    const rects = Konva.stages.at(-1)!.find<Konva.Rect>('Rect');
    const xOf = (fill: string) =>
      rects
        .filter((r) => String(r.fill()).toLowerCase() === fill)
        .map((r) => r.getAbsolutePosition().x)[0]!;
    const scale = Konva.stages.at(-1)!.scaleX();
    const origin = Konva.stages.at(-1)!.x();
    const toScreen = (x: number) => (x - origin) / scale;
    return { red: toScreen(xOf('#ff0000')), blue: toScreen(xOf('#0000ff')) };
  }

  it("the origin's screen.direction mirrors the interior (x' = width - x - w), without the option", () => {
    // the root anchored at top-start goes to the right (x 200); inside it, 100 wide
    make({ library: library('rtl'), source: DOC });
    expect(rectXs()).toEqual({ red: 280, blue: 250 });
  });

  it('em ltr o interior segue como sempre', () => {
    make({ library: library(), source: DOC });
    expect(rectXs()).toEqual({ red: 0, blue: 20 });
  });

  it('the direction option beats the origin one, in both directions', () => {
    make({ library: library('rtl'), source: DOC, direction: 'ltr' });
    expect(rectXs()).toEqual({ red: 0, blue: 20 });
    document.body.replaceChildren();
    const viewer = make({ library: library(), source: DOC });
    viewer.update({ direction: 'rtl' });
    expect(rectXs()).toEqual({ red: 280, blue: 250 });
  });

  it('a ready screen carries the direction: the interior follows the screen, without the option', () => {
    const ready = screenFromSource(library('rtl'), DOC, {
      measure: approximateMeasurer,
    }).screen!;
    expect(ready.direction).toBe('rtl');
    make({ library: library('rtl'), screen: ready });
    expect(rectXs()).toEqual({ red: 280, blue: 250 });
  });
});
