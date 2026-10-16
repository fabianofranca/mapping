/**
 * Visualizador embutível: mostra UMA tela da biblioteca de componentes num contêiner do
 * hospedeiro, sem framework. Cria o próprio `Konva.Stage` com duas camadas: a de conteúdo (o
 * `artboard` com o fundo da tela no índice 0 do grupo e, por cima, o `ScreenRenderer`) e a de
 * overlay (retângulos de hover e de seleção, `listening: false`).
 *
 * A escala e a posição (enquadramento) ficam no STAGE, não nos grupos: as duas camadas
 * compartilham a mesma transformação e o overlay acompanha o conteúdo, com as caixas em
 * coordenadas da tela. Não há pan nem zoom pela roda: o hospedeiro dimensiona o contêiner e o
 * `ResizeObserver` (quando existe) reenquadra. O desenho acontece no máximo uma vez por quadro.
 *
 * Interação: por padrão o ponteiro avisa `onHover`/`onClick`. Com `interactive: false` (ou
 * `setInteractive(false)`) o canvas vira só imagem: o ponteiro não faz nada, mas `setSelection`
 * e `setHover` continuam valendo (seleção e hover vindos do hospedeiro, ex.: uma árvore), assim
 * como `clientToScreen`, `instanceAt` e `boxOf`.
 *
 * As fontes são do hospedeiro: depois que uma fonte carregar, chame `redraw()` para remedir os
 * textos. O módulo não faz requisição de rede nem registra fonte.
 */
import Konva from 'konva';
import type { Library } from '../components/library';
import type { TextMeasurer } from '../components/instantiate';
import type { Box, Screen } from '../components/screen';
import { capPixelRatio } from '../shared/pinch';
import { konvaMeasurer } from './measure';
import { type InstanceWarnings, ScreenRenderer } from './screenRenderer';

export type { InstanceWarnings } from './screenRenderer';

export interface ViewerInput {
  readonly library: Library | undefined;
  readonly screen: Screen | undefined;
}

export interface ViewerOptions {
  readonly library?: Library;
  readonly screen?: Screen;
  /** O ponteiro entrou/saiu de uma instância (`undefined` = nenhuma). */
  readonly onHover?: (id: string | undefined) => void;
  /** Clique (botão principal) numa instância ou no fundo (`undefined`); x,y em px da tela. */
  readonly onClick?: (id: string | undefined, event: { x: number; y: number }) => void;
  /** Avisos da instanciação por instância, a cada atualização que redesenhou algo. */
  readonly onWarnings?: (byInstance: InstanceWarnings) => void;
  readonly measure?: TextMeasurer;
  /** Como a tela cabe no contêiner: `'contain'` (padrão, com margem `padding`) ou uma escala fixa. */
  readonly fit?: 'contain' | number;
  /** Margem, em px do contêiner, do enquadramento `'contain'` (padrão 16). */
  readonly padding?: number;
  /**
   * O ponteiro seleciona/realça (padrão `true`). Com `false` o canvas é só imagem: nenhum
   * `onHover`/`onClick`; `setSelection` e `setHover` do hospedeiro seguem funcionando.
   */
  readonly interactive?: boolean;
  /** Cores do realce (CSS); padrões: seleção '#1A63CC', hover 'rgba(26, 99, 204, 0.8)'. */
  readonly selectionColor?: string;
  readonly hoverColor?: string;
}

export interface Viewer {
  /** Redesenha só o que mudou (identidade de biblioteca, tela e instâncias). Campos omitidos ficam. */
  update(input: Partial<ViewerInput>): void;
  /** Re-instancia tudo (ex.: as fontes do hospedeiro carregaram). */
  redraw(): void;
  /** Realce de seleção (borda sólida); vazio = nenhuma. */
  setSelection(ids: readonly string[]): void;
  /** Realce de hover vindo do hospedeiro (ex.: a lista ao lado); não dispara `onHover`. */
  setHover(id: string | undefined): void;
  /**
   * Liga/desliga a interação do ponteiro (ver `ViewerOptions.interactive`). Ao desligar com
   * hover do ponteiro ativo, `onHover(undefined)` é chamado uma vez.
   */
  setInteractive(on: boolean): void;
  /** Reaplica o enquadramento (também automático ao redimensionar o contêiner). */
  fit(): void;
  scale(): number;
  /** Retângulo da instância na tela (px da tela). */
  boxOf(id: string): Box | undefined;
  instanceAt(point: { x: number; y: number }): string | undefined;
  /** Converte um ponto do DOM (`clientX/clientY`) em px da tela. */
  clientToScreen(client: { x: number; y: number }): { x: number; y: number };
  warnings(): InstanceWarnings;
  /** PNG da tela (sem os realces). */
  toDataURL(pixelRatio?: number): string;
  dispose(): void;
}

capPixelRatio(Konva);

const SELECT_COLOR = '#1A63CC';
const HOVER_COLOR = 'rgba(26, 99, 204, 0.8)';
const DEFAULT_PADDING = 16;
const MIN_SCALE = 0.01;
/** Tela "vazia" entregue ao renderer quando o hospedeiro limpa a tela. */
const EMPTY_SCREEN: Screen = {
  id: '',
  name: '',
  width: 1,
  height: 1,
  background: 'transparent',
  instances: [],
};

export function createViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
): Viewer {
  const selectionColor = options.selectionColor ?? SELECT_COLOR;
  const hoverColor = options.hoverColor ?? HOVER_COLOR;
  const padding = options.padding ?? DEFAULT_PADDING;
  const fitMode = options.fit ?? 'contain';

  let interactive = options.interactive ?? true;

  const stage = new Konva.Stage({
    container: container as HTMLDivElement,
    width: Math.max(1, container.clientWidth),
    height: Math.max(1, container.clientHeight),
  });
  const content = new Konva.Layer();
  const overlay = new Konva.Layer({ listening: false });
  const screenGroup = new Konva.Group();
  const artboard = new Konva.Rect({ fill: '#FFFFFF', visible: false });
  screenGroup.add(artboard);
  content.add(screenGroup);
  const hoverRect = new Konva.Rect({
    stroke: hoverColor,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
    visible: false,
  });
  overlay.add(hoverRect);
  stage.add(content, overlay);

  const renderer = new ScreenRenderer(screenGroup, {
    measure: options.measure ?? konvaMeasurer,
  });
  const selectionRects = new Map<string, Konva.Rect>();

  let library: Library | undefined = options.library;
  let screen: Screen | undefined = options.screen;
  let selection: readonly string[] = [];
  let hoverId: string | undefined;
  /** O que o ponteiro está sobre (para só avisar `onHover` quando muda). */
  let pointerId: string | undefined;
  let fittedKey: string | undefined;
  let frame = 0;
  let disposed = false;

  const draw = (): void => {
    if (disposed || frame) return;
    if (typeof requestAnimationFrame !== 'function') {
      stage.batchDraw();
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      stage.batchDraw();
    });
  };

  const syncSize = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (stage.width() !== width || stage.height() !== height)
      stage.size({ width, height });
  };

  const applyFit = (): void => {
    syncSize();
    if (!screen) return;
    const scale =
      fitMode === 'contain'
        ? Math.max(
            MIN_SCALE,
            Math.min(
              (stage.width() - padding * 2) / screen.width,
              (stage.height() - padding * 2) / screen.height,
            ),
          )
        : Math.max(MIN_SCALE, fitMode);
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - screen.width * scale) / 2,
      y: (stage.height() - screen.height * scale) / 2,
    });
    fittedKey = `${screen.width}x${screen.height}`;
    draw();
  };

  const boxOf = (id: string): Box | undefined => renderer.instanceOf(id)?.box;

  /** Hover e seleção seguem as caixas atuais (a tela pode ter mudado). */
  const syncOverlay = (): void => {
    const selected = new Set(selection);
    for (const [id, rect] of selectionRects) {
      if (selected.has(id) && boxOf(id)) continue;
      rect.destroy();
      selectionRects.delete(id);
    }
    for (const id of selected) {
      const box = boxOf(id);
      if (!box) continue;
      let rect = selectionRects.get(id);
      if (!rect) {
        rect = new Konva.Rect({
          stroke: selectionColor,
          strokeWidth: 2,
          strokeScaleEnabled: false,
          listening: false,
        });
        overlay.add(rect);
        selectionRects.set(id, rect);
      }
      rect.setAttrs({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
    const hoverBox =
      hoverId !== undefined && !selected.has(hoverId) ? boxOf(hoverId) : undefined;
    if (hoverBox) hoverRect.setAttrs({ ...hoverBox, visible: true });
    else hoverRect.visible(false);
    draw();
  };

  const emitWarnings = (): void => options.onWarnings?.(renderer.warnings());

  const sync = (force: boolean): void => {
    const current = screen ?? EMPTY_SCREEN;
    artboard.setAttrs({
      width: current.width,
      height: current.height,
      fill: current.background,
      visible: screen !== undefined,
    });
    const changed = renderer.update(library, current, { force, zBase: 1 });
    if (screen && fittedKey !== `${screen.width}x${screen.height}`) applyFit();
    syncOverlay();
    if (changed || force) emitWarnings();
  };

  const toScreen = (local: { x: number; y: number }): { x: number; y: number } => {
    const scale = stage.scaleX();
    return { x: (local.x - stage.x()) / scale, y: (local.y - stage.y()) / scale };
  };

  const clientToScreen = (client: { x: number; y: number }): { x: number; y: number } => {
    const rect = container.getBoundingClientRect();
    return toScreen({ x: client.x - rect.left, y: client.y - rect.top });
  };

  const setPointer = (id: string | undefined): void => {
    if (id === pointerId) return;
    pointerId = id;
    options.onHover?.(id);
    hoverId = id;
    syncOverlay();
  };

  /** Liga/desliga o ponteiro; ao desligar, o hover que veio dele é limpo (o hospedeiro é avisado). */
  const applyInteractive = (on: boolean): void => {
    interactive = on;
    stage.listening(on);
    if (!on) setPointer(undefined);
  };
  stage.listening(interactive);

  stage.on('mousemove', (e) => {
    if (interactive) setPointer(renderer.instanceIdOf(e.target));
  });
  stage.on('mouseleave', () => {
    if (interactive) setPointer(undefined);
  });
  stage.on('click tap', (e) => {
    if (!interactive) return;
    if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
    const pointer = stage.getPointerPosition();
    const point = pointer
      ? toScreen(pointer)
      : e.evt instanceof MouseEvent
        ? clientToScreen({ x: e.evt.clientX, y: e.evt.clientY })
        : { x: 0, y: 0 };
    options.onClick?.(renderer.instanceIdOf(e.target), point);
  });

  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (disposed) return;
      applyFit();
    });
    observer.observe(container);
  }

  if (library !== undefined || screen !== undefined) sync(false);

  return {
    update(input) {
      if (disposed) return;
      if ('library' in input) library = input.library;
      if ('screen' in input) screen = input.screen;
      sync(false);
    },
    redraw() {
      if (disposed) return;
      sync(true);
    },
    setSelection(ids) {
      if (disposed) return;
      selection = [...ids];
      syncOverlay();
    },
    setHover(id) {
      if (disposed) return;
      hoverId = id;
      syncOverlay();
    },
    setInteractive(on) {
      if (disposed || on === interactive) return;
      applyInteractive(on);
    },
    fit() {
      if (!disposed) applyFit();
    },
    scale: () => stage.scaleX(),
    boxOf: (id) => (disposed ? undefined : boxOf(id)),
    instanceAt: (point) => (disposed ? undefined : renderer.instanceAt(point)),
    clientToScreen: (client) => clientToScreen(client),
    warnings: () => (disposed ? new Map() : renderer.warnings()),
    toDataURL(pixelRatio = 2) {
      if (disposed || !screen) return '';
      const scale = stage.scaleX();
      overlay.visible(false);
      try {
        const url: string | null = stage.toDataURL({
          x: stage.x(),
          y: stage.y(),
          width: screen.width * scale,
          height: screen.height * scale,
          pixelRatio: pixelRatio / scale,
        });
        return url ?? '';
      } finally {
        overlay.visible(true);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (frame && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(frame);
      frame = 0;
      renderer.dispose();
      selectionRects.clear();
      stage.destroy();
    },
  };
}
