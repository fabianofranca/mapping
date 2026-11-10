// Visualizador (L1): createViewer monta um Stage no contêiner, desenha uma tela, enquadra e
// avisa hover/clique; seleção e hover viram retângulos no overlay.
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../viewer/samples/samples';
import { type SourceResult, screenFromSource } from '../../src/model/components/origin';
import settings from '../../viewer/samples/settings.sdui.json';
import { M3_FILES, M3_SCREEN } from '../../viewer/samples/samplesMaterial3';
import type { Screen } from '../../src/model/components/screen';
import { type Viewer, type ViewerOptions, createViewer } from '../../viewer';
import { tokenValue } from '../../src/theme/tokens';

beforeAll(() => installFakeCanvas());

const library = loadLibrary(SAMPLE_FILES);
const mounted: Viewer[] = [];

/** Contêiner no jsdom, com o tamanho que o layout daria. */
function container(width = 800, height = 600): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  return el;
}

function make(el: HTMLElement, options: ViewerOptions = {}): Viewer {
  const viewer = createViewer(el, { measure: approximateMeasurer, ...options });
  mounted.push(viewer);
  return viewer;
}

function stageOf(el: HTMLElement): Konva.Stage {
  const stage = Konva.stages.find((s) => s.container() === el);
  if (!stage) throw new Error('stage não encontrado');
  return stage;
}

/** Os retângulos do overlay (a camada que não escuta eventos). */
function overlayRects(stage: Konva.Stage): Konva.Rect[] {
  const layer = stage.getLayers()[1];
  return layer ? layer.find<Konva.Rect>('Rect') : [];
}

function instanceNode(stage: Konva.Stage, id: string): Konva.Group {
  const node = stage.findOne<Konva.Group>(
    (n: Konva.Node) => n.getAttr('instanceId') === id,
  );
  if (!node) throw new Error(`instância ${id} não encontrada`);
  return node;
}

afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('createViewer', () => {
  it('cria o stage no contêiner com o tamanho dele (mínimo 1)', () => {
    const el = container(640, 480);
    make(el);
    const stage = stageOf(el);
    expect(stage.width()).toBe(640);
    expect(stage.height()).toBe(480);
    expect(el.querySelector('canvas')).not.toBeNull();
    const empty = container(0, 0);
    make(empty);
    expect(stageOf(empty).size()).toEqual({ width: 1, height: 1 });
  });

  it('update desenha a tela: artboard com o fundo e um grupo por instância', () => {
    const el = container();
    const viewer = make(el);
    viewer.update({ library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    const artboard = stage.getLayers()[0]?.findOne<Konva.Rect>('Rect');
    expect(artboard?.fill()).toBe(SAMPLE_SCREEN.background);
    expect(artboard?.size()).toEqual({
      width: SAMPLE_SCREEN.width,
      height: SAMPLE_SCREEN.height,
    });
    const group = stage.getLayers()[0]?.getChildren()[0] as Konva.Group;
    // O artboard é o índice 0; as instâncias vêm depois, na ordem de desenho.
    expect(group.getChildren()[0]).toBe(artboard);
    expect(group.getChildren()).toHaveLength(1 + SAMPLE_SCREEN.instances.length);
    expect(
      (group.getChildren()[1] as Konva.Node | undefined)?.getAttr('instanceId'),
    ).toBe('i-bar');
    expect(viewer.warnings().size).toBe(0);
  });

  it('opções library/screen na criação já desenham', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    expect(viewer.boxOf('i-enter')).toEqual(
      SAMPLE_SCREEN.instances.find((i) => i.id === 'i-enter')?.box,
    );
  });

  it('enquadramento contain: escala e centro para o contêiner', () => {
    const el = container(800, 600);
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    // 390x844 em 800x600 com 16 de margem: manda a altura.
    const expected = (600 - 32) / SAMPLE_SCREEN.height;
    expect(viewer.scale()).toBeCloseTo(expected, 6);
    const stage = stageOf(el);
    expect(stage.x()).toBeCloseTo((800 - SAMPLE_SCREEN.width * expected) / 2, 6);
    expect(stage.y()).toBeCloseTo((600 - SAMPLE_SCREEN.height * expected) / 2, 6);

    // Sem margem e com um contêiner largo e baixo.
    const wide = container(1000, 422);
    const flat = make(wide, { library, screen: SAMPLE_SCREEN, padding: 0 });
    expect(flat.scale()).toBeCloseTo(422 / SAMPLE_SCREEN.height, 6);
  });

  it('escala fixa centraliza; fit() relê o tamanho do contêiner', () => {
    const el = container(800, 600);
    const viewer = make(el, { library, screen: SAMPLE_SCREEN, fit: 0.5 });
    expect(viewer.scale()).toBe(0.5);
    const stage = stageOf(el);
    expect(stage.x()).toBeCloseTo((800 - SAMPLE_SCREEN.width * 0.5) / 2, 6);

    const other = container(800, 600);
    const contain = make(other, { library, screen: SAMPLE_SCREEN });
    const before = contain.scale();
    Object.defineProperty(other, 'clientHeight', { value: 1200, configurable: true });
    contain.fit();
    expect(stageOf(other).height()).toBe(1200);
    expect(contain.scale()).toBeGreaterThan(before);
    expect(contain.scale()).toBeCloseTo((1200 - 32) / SAMPLE_SCREEN.height, 6);
  });

  it('reenquadra quando o ResizeObserver avisa e quando a tela muda de tamanho', () => {
    let notify: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe(): void {}
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 1;
    });
    const el = container(800, 600);
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const before = viewer.scale();
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
    notify?.();
    expect(stageOf(el).height()).toBe(300);
    expect(viewer.scale()).toBeLessThan(before);

    const small: Screen = { ...SAMPLE_SCREEN, width: 100, height: 100, instances: [] };
    viewer.update({ screen: small });
    expect(viewer.scale()).toBeCloseTo((300 - 32) / 100, 6);

    viewer.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('a tela que some e volta com o mesmo tamanho depois de o contêiner mudar é reenquadrada', () => {
    let notify: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 1;
    });
    const el = container(800, 600);
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const before = viewer.scale();
    viewer.update({ screen: undefined });
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
    notify?.();
    viewer.update({ screen: SAMPLE_SCREEN });
    expect(viewer.scale()).toBeLessThan(before);
    expect(viewer.scale()).toBeCloseTo((300 - 32) / SAMPLE_SCREEN.height, 6);
  });

  it('o tamanho do stage desconta padding e borda do contêiner', () => {
    const el = container(800, 600);
    el.style.padding = '10px 20px';
    el.style.border = '5px solid black';
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    // clientWidth/Height incluem o padding e não incluem a borda.
    expect(stage.size()).toEqual({ width: 800 - 40, height: 600 - 20 });
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      x: 100,
      y: 50,
      width: 810,
      height: 610,
      toJSON: () => ({}),
    });
    // A origem do stage fica depois da borda (5) e do padding (20 e 10).
    const origin = viewer.clientToScreen({
      x: 100 + 5 + 20 + stage.x(),
      y: 50 + 5 + 10 + stage.y(),
    });
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.y).toBeCloseTo(0, 6);
  });

  it('o redimensionamento redesenha uma vez por quadro, não de forma síncrona', () => {
    let notify: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    });
    const el = container(800, 600);
    make(el, { library, screen: SAMPLE_SCREEN });
    frames.splice(0).forEach((frame) => frame());
    const draw = vi.spyOn(stageOf(el).getLayers()[0] as Konva.Layer, 'draw');
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true });
    notify?.();
    notify?.();
    expect(draw).not.toHaveBeenCalled();
    frames.splice(0).forEach((frame) => frame());
    expect(stageOf(el).size()).toEqual({ width: 500, height: 300 });
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('setSelection e setHover criam retângulos no overlay, nas caixas certas', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    const overlay = stage.getLayers()[1];
    expect(overlay?.listening()).toBe(false);
    const boxOf = (id: string) => SAMPLE_SCREEN.instances.find((i) => i.id === id)?.box;

    viewer.setSelection(['i-email', 'i-enter']);
    const selected = overlayRects(stage).filter((r) => r.strokeWidth() === 2);
    expect(selected).toHaveLength(2);
    for (const [index, id] of ['i-email', 'i-enter'].entries()) {
      const box = boxOf(id);
      expect(selected[index]?.getAttrs()).toMatchObject({
        x: box?.x,
        y: box?.y,
        width: box?.width,
        height: box?.height,
        stroke: '#1a63cc',
        strokeScaleEnabled: false,
      });
    }

    viewer.setHover('i-card');
    const hover = overlayRects(stage).find((r) => r.strokeWidth() === 1);
    expect(hover?.visible()).toBe(true);
    expect(hover?.getAttrs()).toMatchObject({ ...boxOf('i-card') });

    // Hover numa instância selecionada não duplica o realce.
    viewer.setHover('i-email');
    expect(
      overlayRects(stage)
        .find((r) => r.strokeWidth() === 1)
        ?.visible(),
    ).toBe(false);

    viewer.setHover(undefined);
    expect(
      overlayRects(stage)
        .find((r) => r.strokeWidth() === 1)
        ?.visible(),
    ).toBe(false);
    viewer.setSelection([]);
    expect(overlayRects(stage).filter((r) => r.strokeWidth() === 2)).toHaveLength(0);
    // Id desconhecido: sem retângulo.
    viewer.setSelection(['nada']);
    expect(overlayRects(stage).filter((r) => r.strokeWidth() === 2)).toHaveLength(0);
  });

  it('a seleção acompanha a caixa quando a tela muda e some com a instância', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    viewer.setSelection(['i-enter']);
    const moved: Screen = {
      ...SAMPLE_SCREEN,
      instances: SAMPLE_SCREEN.instances.map((i) =>
        i.id === 'i-enter' ? { ...i, box: { ...i.box, x: 10, y: 20 } } : i,
      ),
    };
    viewer.update({ screen: moved });
    const rect = () => overlayRects(stageOf(el)).filter((r) => r.strokeWidth() === 2);
    expect(rect()[0]?.position()).toEqual({ x: 10, y: 20 });
    expect(viewer.boxOf('i-enter')).toMatchObject({ x: 10, y: 20 });
    viewer.update({
      screen: { ...moved, instances: moved.instances.filter((i) => i.id !== 'i-enter') },
    });
    expect(rect()).toHaveLength(0);
    expect(viewer.boxOf('i-enter')).toBeUndefined();
  });

  it('onHover dispara só quando muda e onClick informa a instância e o ponto na tela', () => {
    const el = container();
    const onHover = vi.fn();
    const onClick = vi.fn();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN, onHover, onClick });
    const stage = stageOf(el);
    const target = instanceNode(stage, 'i-enter').findOne('.hit');
    expect(target).toBeDefined();

    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenLastCalledWith('i-enter');
    // O realce de hover acompanha o ponteiro.
    expect(
      overlayRects(stage)
        .find((r) => r.strokeWidth() === 1)
        ?.visible(),
    ).toBe(true);

    const artboard = stage.getLayers()[0]?.findOne('Rect');
    stage.fire('mousemove', { target: artboard, evt: new MouseEvent('mousemove') });
    expect(onHover).toHaveBeenLastCalledWith(undefined);
    expect(onHover).toHaveBeenCalledTimes(2);
    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    stage.fire('mouseleave', { target: stage, evt: new MouseEvent('mouseleave') });
    expect(onHover).toHaveBeenLastCalledWith(undefined);
    expect(onHover).toHaveBeenCalledTimes(4);

    const scale = viewer.scale();
    const client = { x: stage.x() + 50 * scale, y: stage.y() + 100 * scale };
    stage.fire('click', {
      target,
      evt: new MouseEvent('click', { button: 0, clientX: client.x, clientY: client.y }),
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toBe('i-enter');
    expect(onClick.mock.calls[0]?.[1].x).toBeCloseTo(50, 6);
    expect(onClick.mock.calls[0]?.[1].y).toBeCloseTo(100, 6);

    // Fundo: id indefinido. Botão != 0 é ignorado.
    stage.fire('click', {
      target: artboard,
      evt: new MouseEvent('click', { button: 0 }),
    });
    expect(onClick).toHaveBeenLastCalledWith(undefined, {
      x: expect.any(Number),
      y: expect.any(Number),
    });
    stage.fire('click', { target, evt: new MouseEvent('click', { button: 2 }) });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('interactive: false ignora o ponteiro; seleção e hover do hospedeiro continuam', () => {
    const el = container();
    const onHover = vi.fn();
    const onClick = vi.fn();
    const viewer = make(el, {
      library,
      screen: SAMPLE_SCREEN,
      onHover,
      onClick,
      interactive: false,
    });
    const stage = stageOf(el);
    expect(stage.listening()).toBe(false);
    const target = instanceNode(stage, 'i-enter').findOne('.hit');

    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    stage.fire('mouseleave', { target: stage, evt: new MouseEvent('mouseleave') });
    stage.fire('click', { target, evt: new MouseEvent('click', { button: 0 }) });
    stage.fire('tap', { target, evt: new Event('tap') });
    expect(onHover).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    // A seleção e o hover vindos do hospedeiro ainda aparecem.
    viewer.setSelection(['i-enter']);
    expect(overlayRects(stage).filter((r) => r.strokeWidth() === 2)).toHaveLength(1);
    viewer.setHover('i-bar');
    expect(
      overlayRects(stage)
        .find((r) => r.strokeWidth() === 1)
        ?.visible(),
    ).toBe(true);
    // As consultas seguem valendo.
    expect(viewer.boxOf('i-enter')).toBeDefined();
    expect(viewer.instanceAt({ x: 1, y: 1 })).toBeDefined();
    expect(viewer.clientToScreen({ x: 0, y: 0 })).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });

    // Ligar de novo devolve os callbacks.
    viewer.setInteractive(true);
    expect(stage.listening()).toBe(true);
    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    expect(onHover).toHaveBeenLastCalledWith('i-enter');
    stage.fire('click', { target, evt: new MouseEvent('click', { button: 0 }) });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toBe('i-enter');
  });

  it('setInteractive(false) com hover do ponteiro ativo avisa onHover(undefined) uma vez', () => {
    const el = container();
    const onHover = vi.fn();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN, onHover });
    const stage = stageOf(el);
    const target = instanceNode(stage, 'i-enter').findOne('.hit');

    stage.fire('mousemove', { target, evt: new MouseEvent('mousemove') });
    expect(onHover).toHaveBeenCalledTimes(1);
    viewer.setInteractive(false);
    expect(onHover).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenLastCalledWith(undefined);
    expect(
      overlayRects(stage)
        .find((r) => r.strokeWidth() === 1)
        ?.visible(),
    ).toBe(false);
    // Repetir não avisa de novo; sem hover ativo, desligar não avisa nada.
    viewer.setInteractive(false);
    expect(onHover).toHaveBeenCalledTimes(2);
    const quiet = vi.fn();
    const other = make(container(), { library, screen: SAMPLE_SCREEN, onHover: quiet });
    other.setInteractive(false);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('clientToScreen inverte a escala e o deslocamento', () => {
    const el = container(800, 600);
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    const scale = viewer.scale();
    expect(viewer.clientToScreen({ x: stage.x(), y: stage.y() })).toEqual({ x: 0, y: 0 });
    const point = viewer.clientToScreen({
      x: stage.x() + 195 * scale,
      y: stage.y() + 422 * scale,
    });
    expect(point.x).toBeCloseTo(195, 6);
    expect(point.y).toBeCloseTo(422, 6);
    // Considera o deslocamento do contêiner na página.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      x: 100,
      y: 50,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    const shifted = viewer.clientToScreen({ x: 100 + stage.x(), y: 50 + stage.y() });
    expect(shifted.x).toBeCloseTo(0, 6);
    expect(shifted.y).toBeCloseTo(0, 6);
  });

  it('boxOf e instanceAt usam coordenadas da tela', () => {
    const viewer = make(container(), { library, screen: SAMPLE_SCREEN });
    expect(viewer.boxOf('i-avatar')).toEqual({ x: 155, y: 96, width: 80, height: 80 });
    expect(viewer.boxOf('nada')).toBeUndefined();
    expect(viewer.instanceAt({ x: 190, y: 130 })).toBe('i-avatar');
    expect(viewer.instanceAt({ x: 1, y: 843 })).toBeUndefined();
  });

  it('warnings() e onWarnings reportam tipos desconhecidos', () => {
    const onWarnings = vi.fn();
    const viewer = make(container(), { onWarnings });
    const screen: Screen = {
      ...SAMPLE_SCREEN,
      instances: [
        {
          id: 'x',
          typeId: 'nao-existe',
          box: { x: 0, y: 0, width: 80, height: 40 },
          values: {},
        },
      ],
    };
    viewer.update({ library, screen });
    expect(viewer.warnings().get('x')).toEqual(['tipo não existe na especialização']);
    expect(onWarnings).toHaveBeenCalledTimes(1);
    const reported = onWarnings.mock.calls[0]?.[0] as ReadonlyMap<string, unknown>;
    expect(reported.has('x')).toBe(true);
    // Mesma tela: nada mudou, nenhum aviso novo.
    viewer.update({ library, screen });
    expect(onWarnings).toHaveBeenCalledTimes(1);
  });

  it('update com tela undefined esvazia; campos omitidos ficam', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    viewer.update({});
    expect(viewer.boxOf('i-bar')).toBeDefined();
    viewer.update({ screen: undefined });
    expect(viewer.boxOf('i-bar')).toBeUndefined();
    const group = stageOf(el).getLayers()[0]?.getChildren()[0] as Konva.Group;
    expect(group.getChildren()).toHaveLength(1);
    expect(group.getChildren()[0]?.visible()).toBe(false);
    expect(viewer.toDataURL()).toBe('');
    viewer.update({ screen: SAMPLE_SCREEN });
    expect(viewer.boxOf('i-bar')).toBeDefined();
  });

  it('update com a mesma tela mantém os nós; redraw os recria', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    const node = instanceNode(stage, 'i-enter');
    const inner = node.getChildren()[0];
    viewer.update({ screen: SAMPLE_SCREEN });
    expect(instanceNode(stage, 'i-enter').getChildren()[0]).toBe(inner);
    viewer.redraw();
    expect(instanceNode(stage, 'i-enter')).toBe(node);
    expect(node.getChildren()[0]).not.toBe(inner);
  });

  it('toDataURL devolve uma string e restaura o overlay', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AA',
    );
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const url = viewer.toDataURL(1);
    expect(url).toBe('data:image/png;base64,AA');
    expect(stageOf(el).getLayers()[1]?.visible()).toBe(true);
  });

  it('dispose não lança, destrói o stage e ignora updates depois', () => {
    const el = container();
    const viewer = make(el, { library, screen: SAMPLE_SCREEN });
    const stage = stageOf(el);
    viewer.dispose();
    expect(() => viewer.dispose()).not.toThrow();
    expect(el.querySelector('canvas')).toBeNull();
    expect(Konva.stages).not.toContain(stage);
    expect(() => {
      viewer.update({ screen: { ...SAMPLE_SCREEN, name: 'outra' } });
      viewer.redraw();
      viewer.setSelection(['i-bar']);
      viewer.setHover('i-bar');
      viewer.fit();
    }).not.toThrow();
    expect(viewer.boxOf('i-bar')).toBeUndefined();
    expect(viewer.warnings().size).toBe(0);
    expect(viewer.toDataURL()).toBe('');
  });

  it('funciona sem requestAnimationFrame (batchDraw direto)', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const viewer = make(container(), { library, screen: SAMPLE_SCREEN });
    expect(() => viewer.setSelection(['i-bar'])).not.toThrow();
  });
  // O custo de atualizar uma instância e de montar a cena deixou de ser só impresso aqui: o teste de
  // crescimento (n e 4n instâncias, razão < 6×) está em tests/scale/app/viewerGrowth.scale.ts (npm run test:scale).
});

describe('createViewer com source (JSON externo)', () => {
  const m3 = loadLibrary(M3_FILES);
  const expected = screenFromSource(m3, settings, { measure: approximateMeasurer });

  function instanceIds(stage: Konva.Stage): string[] {
    return stage
      .find((n: Konva.Node) => n.getAttr('instanceId') !== undefined)
      .map((n: Konva.Node) => String(n.getAttr('instanceId')));
  }

  it('desenha a tela calculada e screen() a devolve; source vence screen', () => {
    const el = container();
    const viewer = make(el, { library: m3, source: settings, screen: M3_SCREEN });
    const calculated = expected.screen!;
    expect(viewer.screen()).toEqual(calculated);
    expect(instanceIds(stageOf(el))).toHaveLength(calculated.instances.length);
    const first = calculated.instances[0]!;
    expect(viewer.boxOf(first.id)).toEqual(first.box);
  });

  it('screen() devolve a tela passada quando não há source', () => {
    const viewer = make(container(), { library, screen: SAMPLE_SCREEN });
    expect(viewer.screen()).toBe(SAMPLE_SCREEN);
  });

  it('sem biblioteca nada é desenhado e onSource não é chamado', () => {
    const onSource = vi.fn();
    const el = container();
    const viewer = make(el, { source: settings, onSource });
    expect(viewer.screen()).toBeUndefined();
    expect(instanceIds(stageOf(el))).toHaveLength(0);
    expect(onSource).not.toHaveBeenCalled();
    viewer.update({ library: m3 });
    expect(onSource).toHaveBeenCalledTimes(1);
    expect(viewer.screen()?.instances.length).toBeGreaterThan(0);
  });

  it('onSource recebe os avisos (propriedade desconhecida)', () => {
    const json = structuredClone(settings) as unknown as {
      content: { children: { props: Record<string, unknown> }[] };
    };
    json.content.children[0]!.props.foo = 'x';
    const results: SourceResult[] = [];
    make(container(), { library: m3, source: json, onSource: (r) => results.push(r) });
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toBeUndefined();
    expect(results[0]?.warnings.join('\n')).toContain('foo');
  });

  it('redraw() recalcula; update com o mesmo objeto não, com objeto novo sim', () => {
    const onSource = vi.fn();
    const viewer = make(container(), { library: m3, source: settings, onSource });
    expect(onSource).toHaveBeenCalledTimes(1);
    viewer.update({ source: settings });
    expect(onSource).toHaveBeenCalledTimes(1);
    viewer.redraw();
    expect(onSource).toHaveBeenCalledTimes(2);
    viewer.update({ source: structuredClone(settings) });
    expect(onSource).toHaveBeenCalledTimes(3);
    viewer.update({ screen: SAMPLE_SCREEN });
    expect(onSource).toHaveBeenCalledTimes(3);
    expect(viewer.screen()?.id).toBe('settings');
  });

  it('source com error não desenha instâncias; limpar o source volta ao screen', () => {
    const onSource = vi.fn();
    const el = container();
    const viewer = make(el, {
      library: m3,
      screen: M3_SCREEN,
      source: { screen: {} },
      onSource,
    });
    const result = onSource.mock.calls[0]?.[0] as SourceResult;
    expect(result.error).toBeDefined();
    expect(viewer.screen()).toBeUndefined();
    expect(instanceIds(stageOf(el))).toHaveLength(0);
    viewer.update({ source: undefined });
    expect(viewer.screen()).toBe(M3_SCREEN);
    expect(instanceIds(stageOf(el))).toHaveLength(M3_SCREEN.instances.length);
  });
});

describe('fonte padrão do visualizador (CF5)', () => {
  /** As famílias que o medidor recebeu ao desenhar a tela de exemplo (textos sem `family`). */
  function families(options: ViewerOptions = {}): Set<string> {
    const seen = new Set<string>();
    const measure: typeof approximateMeasurer = (text, font, maxWidth) => {
      seen.add(font.family);
      return approximateMeasurer(text, font, maxWidth);
    };
    make(container(), { library, screen: SAMPLE_SCREEN, measure, ...options });
    return seen;
  }

  it('sem opção usa a pilha do --font-sans dos tokens da app, não uma fonte fixa', () => {
    const seen = families();
    expect(seen.has(tokenValue('font-sans', 'light'))).toBe(true);
    expect(seen.has('Inter')).toBe(false);
  });

  it('a opção fonts do hospedeiro vence', () => {
    const seen = families({ fonts: { sans: 'Hospedeiro Sans' } });
    expect(seen.has('Hospedeiro Sans')).toBe(true);
    expect(seen.has(tokenValue('font-sans', 'light'))).toBe(false);
  });
});

describe('drawingMode (modo dos tokens)', () => {
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'tk',
    name: 'Tk',
    version: 1,
    tokens: {
      modes: ['light', 'dark'],
      values: { primary: { light: '#1a73e8', dark: '#8ab4f8' } },
    },
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/tk.json', fields: [] },
        ],
      },
    ],
  };
  const component = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'tk',
    name: 'Tk',
    size: { width: 100, height: 50 },
    template: { type: 'frame', fill: { $token: 'primary' } },
  };
  const tokenLibrary = loadLibrary([
    { path: 'tk.spec.json', text: JSON.stringify(spec) },
    { path: 'components/tk.json', text: JSON.stringify(component) },
  ]);
  const tokenScreen: Screen = {
    id: 's',
    name: 'S',
    width: 100,
    height: 50,
    background: '#FFFFFF',
    instances: [
      { id: 'i1', typeId: 't', box: { x: 0, y: 0, width: 100, height: 50 }, values: {} },
    ],
  };

  /** Os preenchimentos dos retângulos da instância (o fundo da tela fica de fora). */
  function fills(el: HTMLElement): unknown[] {
    return instanceNode(stageOf(el), 'i1')
      .find<Konva.Rect>('Rect')
      .map((r) => r.fill());
  }

  it('sem a opção usa o primeiro modo; drawingMode "dark" desenha com os tokens do modo dark', () => {
    expect(tokenLibrary.problems).toEqual([]);
    const light = container();
    make(light, { library: tokenLibrary, screen: tokenScreen });
    expect(fills(light)).toContain('#1a73e8');

    const dark = container();
    make(dark, { library: tokenLibrary, screen: tokenScreen, drawingMode: 'dark' });
    expect(fills(dark)).toContain('#8ab4f8');
    expect(fills(dark)).not.toContain('#1a73e8');
  });

  it('trocar o modo em tempo de execução redesenha sem recarregar o projeto', () => {
    const el = container();
    const viewer = make(el, { library: tokenLibrary, screen: tokenScreen });
    expect(fills(el)).toContain('#1a73e8');

    viewer.update({ drawingMode: 'dark' });
    expect(fills(el)).toContain('#8ab4f8');
    expect(fills(el)).not.toContain('#1a73e8');
    expect(viewer.screen()).toBe(tokenScreen); // a tela e a biblioteca não foram recarregadas

    viewer.update({ drawingMode: undefined });
    expect(fills(el)).toContain('#1a73e8');
  });
});

describe('rotation (EX3)', () => {
  const spinnerSpec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'turn',
    name: 'Giro',
    version: 1,
    layers: [
      {
        id: 'c',
        name: 'C',
        color: '#1E88E5',
        annotationTypes: [
          {
            id: 'bar',
            name: 'Barra',
            component: 'components/bar.json',
            fields: [{ key: 'angle', label: 'Ângulo', type: 'number' }],
          },
        ],
      },
    ],
  };
  const barComponent = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'bar',
    name: 'Barra',
    size: { width: 100, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'row', align: 'center', justify: 'center' },
      children: [
        {
          type: 'rect',
          name: 'turning',
          width: 40,
          height: 10,
          fill: '#ff0000',
          rotation: { $field: 'angle' },
        },
      ],
    },
  };
  const turnLibrary = loadLibrary([
    { path: 'turn.spec.json', text: JSON.stringify(spinnerSpec) },
    { path: 'components/bar.json', text: JSON.stringify(barComponent) },
  ]);

  it('desenha o nó girado em volta do centro da caixa, igual à app', () => {
    const el = container();
    const viewer = make(el);
    const screen: Screen = {
      id: 's',
      name: 'S',
      width: 200,
      height: 200,
      background: '#ffffff',
      instances: [
        {
          id: 'i1',
          typeId: 'bar',
          box: { x: 10, y: 20, width: 100, height: 100 },
          values: { angle: '90' },
        },
      ],
    };
    viewer.update({ library: turnLibrary, screen });
    const stage = stageOf(el);
    const node = stage.findOne<Konva.Group>((n: Konva.Node) => n.name() === 'turning');
    expect(node).toBeDefined();
    const abs = node!.getAbsoluteTransform().copy();
    // a 90° em torno do centro, a barra 40×10 vira 10×40 em volta do mesmo ponto
    const local = (x: number, y: number) => abs.point({ x, y });
    const [a, b] = [local(0, 0), local(40, 10)];
    expect(Math.abs(a.x - b.x)).toBeCloseTo(10 * stage.getAbsoluteScale().x, 6);
    expect(Math.abs(a.y - b.y)).toBeCloseTo(40 * stage.getAbsoluteScale().y, 6);
  });
});
