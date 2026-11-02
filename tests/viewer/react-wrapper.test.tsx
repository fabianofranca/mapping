/** @jsxImportSource react */
/**
 * Invólucro React do visualizador (projeto `viewer-react`: React 19 de verdade, jsdom e canvas
 * falso). Observa efeitos reais no Stage do Konva em vez de espionar o `createViewer`.
 */
import Konva from 'konva';
import * as React from 'react';
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../canvas/harness';
import { SAMPLE_FILES, SAMPLE_SCREEN } from '../../../lab/components/samples';
import settings from '../../../lab/components/sdui/settings.sdui.json';
import { M3_FILES, M3_SCREEN } from '../../../lab/components/samplesMaterial3';
import {
  MappingViewer,
  type MappingViewerProps,
  type SourceResult,
  loadLibrary,
} from '../../../lab/viewer/react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => installFakeCanvas());

const library = loadLibrary(SAMPLE_FILES);
const m3Library = loadLibrary(M3_FILES);

let host: HTMLDivElement | undefined;
let root: Root | undefined;

/** Monta o invólucro num contêiner com tamanho (o layout do jsdom é zero). */
async function mount(props: MappingViewerProps, strict = true): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render(props, strict);
  return host;
}

async function render(props: MappingViewerProps, strict = true): Promise<void> {
  const node = <MappingViewer {...props} />;
  await act(async () => {
    root?.render(strict ? <StrictMode>{node}</StrictMode> : node);
  });
}

/** O `<div>` do invólucro, com `clientWidth/Height` (o jsdom não calcula layout). */
function viewerDiv(): HTMLDivElement {
  const div = host?.firstElementChild;
  if (!(div instanceof HTMLDivElement))
    throw new Error('div do invólucro não encontrado');
  return div;
}

function stageOf(div: HTMLElement): Konva.Stage {
  const stage = Konva.stages.find((s) => s.container() === div);
  if (!stage) throw new Error('stage não encontrado');
  return stage;
}

function instanceCount(stage: Konva.Stage): number {
  return stage.find((n: Konva.Node) => n.getAttr('instanceId') !== undefined).length;
}

/** Retângulos da cor de seleção na camada de overlay (a segunda; a de conteúdo tem os componentes). */
function selectionRects(stage: Konva.Stage): Konva.Rect[] {
  const overlay = stage.getLayers()[1];
  return (overlay?.find<Konva.Rect>('Rect') ?? []).filter(
    (r) => r.stroke() === '#1A63CC',
  );
}

/** Ids internos de todos os nós da camada de conteúdo (mudam quando o desenho é refeito). */
function contentIds(stage: Konva.Stage): number[] {
  return (stage.getLayers()[0]?.find(() => true) ?? []).map((n: Konva.Node) => n._id);
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('<MappingViewer/>', () => {
  it('roda no React 19 de verdade', () => {
    expect(React.version.startsWith('19')).toBe(true);
  });

  it('cria o stage no contêiner (StrictMode) e o esvazia ao desmontar', async () => {
    const el = await mount({ library, screen: SAMPLE_SCREEN });
    const div = viewerDiv();
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('100%');
    expect(el.querySelectorAll('canvas').length).toBe(2);
    // O monta-desmonta-monta do StrictMode não deixa stage sobrando.
    expect(Konva.stages.filter((s) => s.container() === div).length).toBe(1);
    expect(instanceCount(stageOf(div))).toBe(SAMPLE_SCREEN.instances.length);
    await act(async () => root?.unmount());
    root = undefined;
    expect(el.childElementCount).toBe(0);
    expect(Konva.stages.filter((s) => s.container() === div).length).toBe(0);
  });

  it('mescla className e style do hospedeiro sobre o padrão', async () => {
    await mount({
      library,
      screen: SAMPLE_SCREEN,
      className: 'meu',
      style: { height: '50%', background: 'red' },
    });
    const div = viewerDiv();
    expect(div.className).toBe('meu');
    expect(div.style.width).toBe('100%');
    expect(div.style.height).toBe('50%');
    expect(div.style.background).toBe('red');
  });

  it('trocar screen e library atualiza o desenho e os avisos', async () => {
    const onWarnings = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onWarnings });
    const div = viewerDiv();
    const stage = stageOf(div);
    expect(instanceCount(stage)).toBe(SAMPLE_SCREEN.instances.length);
    const calls = onWarnings.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    await render({ library: m3Library, screen: M3_SCREEN, onWarnings });
    expect(instanceCount(stageOf(div))).toBe(M3_SCREEN.instances.length);
    expect(onWarnings.mock.calls.length).toBeGreaterThan(calls);
    // Continua o mesmo stage: atualizou, não recriou.
    expect(stageOf(div)).toBe(stage);
  });

  it('tela sem uma instância desenha uma a menos', async () => {
    await mount({ library, screen: SAMPLE_SCREEN });
    const less = {
      ...SAMPLE_SCREEN,
      instances: SAMPLE_SCREEN.instances.slice(0, -1),
    };
    await render({ library, screen: less });
    expect(instanceCount(stageOf(viewerDiv()))).toBe(less.instances.length);
  });

  it('selection cria o retângulo de seleção e limpar o remove', async () => {
    const id = SAMPLE_SCREEN.instances[0]?.id ?? '';
    await mount({ library, screen: SAMPLE_SCREEN });
    const stage = stageOf(viewerDiv());
    expect(selectionRects(stage).length).toBe(0);

    await render({ library, screen: SAMPLE_SCREEN, selection: [id] });
    const rects = selectionRects(stage);
    expect(rects.length).toBe(1);
    const box = SAMPLE_SCREEN.instances[0]?.box;
    expect(rects[0]?.size()).toEqual({ width: box?.width, height: box?.height });

    await render({ library, screen: SAMPLE_SCREEN, selection: [] });
    expect(selectionRects(stage).length).toBe(0);
  });

  it('hover mostra o realce de hover (sem disparar onHover)', async () => {
    const id = SAMPLE_SCREEN.instances[0]?.id ?? '';
    const onHover = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onHover });
    const stage = stageOf(viewerDiv());
    const hoverRects = (): Konva.Rect[] =>
      (stage.getLayers()[1]?.find<Konva.Rect>('Rect') ?? []).filter(
        (r) => r.stroke() === 'rgba(26, 99, 204, 0.8)' && r.visible(),
      );
    expect(hoverRects().length).toBe(0);
    await render({ library, screen: SAMPLE_SCREEN, onHover, hover: id });
    expect(hoverRects().length).toBe(1);
    expect(onHover).not.toHaveBeenCalled();
  });

  it('trocar o callback não recria o viewer; o novo callback é o que recebe os eventos', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onClick: first });
    const div = viewerDiv();
    const canvas = div.querySelector('canvas');
    const stage = stageOf(div);
    expect(canvas).not.toBeNull();

    await render({ library, screen: SAMPLE_SCREEN, onClick: second });
    expect(div.querySelector('canvas')).toBe(canvas);
    expect(stageOf(div)).toBe(stage);

    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0]?.[0]).toBeUndefined();
  });

  it('interactive liga e desliga o ponteiro do stage sem recriá-lo', async () => {
    const onClick = vi.fn();
    await mount({ library, screen: SAMPLE_SCREEN, onClick, interactive: false });
    const div = viewerDiv();
    const stage = stageOf(div);
    expect(stage.listening()).toBe(false);
    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(onClick).not.toHaveBeenCalled();

    await render({ library, screen: SAMPLE_SCREEN, onClick, interactive: true });
    expect(stageOf(div)).toBe(stage);
    expect(stage.listening()).toBe(true);
    await act(async () => {
      stage.fire('click', { evt: new MouseEvent('click', { button: 0 }), target: stage });
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    await render({ library, screen: SAMPLE_SCREEN, onClick });
    expect(stage.listening()).toBe(true);
    await render({ library, screen: SAMPLE_SCREEN, onClick, interactive: false });
    expect(stageOf(div)).toBe(stage);
    expect(stage.listening()).toBe(false);
  });

  it('fontsVersion refaz o desenho sem recriar o stage', async () => {
    await mount({ library, screen: SAMPLE_SCREEN, fontsVersion: 0 });
    const div = viewerDiv();
    const stage = stageOf(div);
    const before = contentIds(stage);
    expect(before.length).toBeGreaterThan(0);
    await render({ library, screen: SAMPLE_SCREEN, fontsVersion: 1 });
    expect(stageOf(div)).toBe(stage);
    // `redraw` re-instancia o conteúdo das instâncias: aparecem nós novos.
    const after = contentIds(stage);
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((id) => !before.includes(id))).toBe(true);
  });

  it('source desenha a tela calculada e onSource recebe o resultado; novo objeto recalcula', async () => {
    const onSource = vi.fn();
    await mount({ library: m3Library, screen: undefined, source: settings, onSource });
    const stage = stageOf(viewerDiv());
    const first = onSource.mock.calls.at(-1)?.[0] as SourceResult;
    expect(first.error).toBeUndefined();
    expect(first.screen).toBeDefined();
    expect(instanceCount(stage)).toBe(first.screen?.instances.length);
    const calls = onSource.mock.calls.length;

    // Re-render com o mesmo source: nada a recalcular.
    await render({ library: m3Library, screen: undefined, source: settings, onSource });
    expect(onSource.mock.calls.length).toBe(calls);

    const next = structuredClone(settings);
    await render({ library: m3Library, screen: undefined, source: next, onSource });
    expect(onSource.mock.calls.length).toBeGreaterThan(calls);
    expect(stageOf(viewerDiv())).toBe(stage);
  });

  it('source com erro não desenha e o erro chega em onSource', async () => {
    const onSource = vi.fn();
    await mount({ library: m3Library, screen: M3_SCREEN, source: {}, onSource });
    expect((onSource.mock.calls.at(-1)?.[0] as SourceResult).error).toBeDefined();
    expect(instanceCount(stageOf(viewerDiv()))).toBe(0);
  });
});
