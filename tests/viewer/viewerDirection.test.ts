// R1 (#1096): `direction` ('ltr' | 'rtl') em createViewer/ViewerInput, repassada ao
// screenFromSource/layoutScreen da tela calculada de `source`.
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
  it('a direção do visualizador é a do screenFromSource; o padrão é ltr', () => {
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

describe('createViewer: direction no interior dos componentes', () => {
  /** A direção que o visualizador entregou ao motor dos componentes na última atualização. */
  function lastDirection(spy: { mock: { calls: unknown[][] } }): unknown {
    const options = spy.mock.calls.at(-1)?.[2] as { direction?: string } | undefined;
    return options?.direction;
  }

  it('a direção chega ao ScreenRenderer (interior espelhado), no início e por update', () => {
    const spy = vi.spyOn(ScreenRenderer.prototype, 'update');
    const viewer = make({ library: m3, source: settings, direction: 'rtl' });
    expect(lastDirection(spy)).toBe('rtl');
    viewer.update({ direction: 'ltr' });
    expect(lastDirection(spy)).toBe('ltr');
    viewer.update({ direction: 'rtl' });
    expect(lastDirection(spy)).toBe('rtl');
    spy.mockRestore();
  });

  it('sem a opção o padrão é ltr (nada é passado ao motor)', () => {
    const spy = vi.spyOn(ScreenRenderer.prototype, 'update');
    make({ library: m3, source: settings });
    expect(lastDirection(spy)).toBeUndefined();
    spy.mockRestore();
  });
});
