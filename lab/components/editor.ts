/**
 * Laboratório "Componentes": o palco do quadro de telas. Imperativo (como o `CanvasController`
 * da app); a página Preact chama métodos e recebe callbacks.
 *
 * - o canvas é um **quadro** com várias telas; cada tela é um `Konva.Group` arrastável (como
 *   um todo) na posição dela no quadro, com o retângulo branco da tela (`artboard`, índice 0)
 *   e, por cima, o desenho das instâncias, que é do `ScreenRenderer` (`lab/viewer`, o mesmo
 *   núcleo do visualizador embutível): um grupo por instância na posição do retângulo
 *   (coordenadas da tela). O editor só liga a edição por cima do que o núcleo desenha;
 * - o que arrasta o quê: sobre uma instância arrastável, a instância; sobre o fundo da tela
 *   (ou sobre uma instância no modo "posições fixas", que não arrasta), a tela inteira; no
 *   vazio, o palco (pan). O `Transformer` redimensiona a instância e, a cada movimento, o
 *   componente é **re-instanciado** no novo tamanho (o template se adapta; nada é esticado);
 * - roda do mouse: zoom em torno do ponteiro; hover mostra o nome da instância; cada tela
 *   leva o nome acima do canto, e a tela ativa (a do último clique) fica em destaque.
 */
import Konva from 'konva';
import { attachPinchZoom, capPixelRatio, freezeGroup, thawGroup } from '../shared/pinch';
import { ScreenRenderer } from '../viewer/screenRenderer';
import { isContainer } from '../../src/model/components/arrange';
import { type Board, boardBounds, findScreen } from './board';
import type { Library, TypeDef } from '../../src/model/components/library';
import {
  type Box,
  type Instance,
  type Screen,
  descendantsOf,
  renderOrder,
} from '../../src/model/components/screen';

export interface EditorCallbacks {
  readonly onSelect?: (id: string | undefined) => void;
  /** A tela ativa mudou por clique ou arrasto no palco. */
  readonly onActiveScreen?: (id: string | undefined) => void;
  /** Fim do arrasto de uma tela: a posição nova no quadro. */
  readonly onScreenMove?: (id: string, x: number, y: number) => void;
  readonly onHover?: (id: string | undefined) => void;
  /** Fim de um redimensionamento (caixa em coordenadas da tela). */
  readonly onBoxChange?: (id: string, box: Box) => void;
  /**
   * Fim de um arrasto: a caixa nova, o container sob o centro da instância (ou nenhum, nível
   * da tela) e o ponto do centro, para a página decidir a posição entre os irmãos. Tudo em
   * coordenadas da tela da instância.
   */
  readonly onDrop?: (
    id: string,
    box: Box,
    parentId: string | undefined,
    center: { x: number; y: number },
  ) => void;
  readonly onZoom?: (scale: number) => void;
  /** Avisos da instanciação, por instância (vazio = nenhum). */
  readonly onWarnings?: (byInstance: ReadonlyMap<string, readonly string[]>) => void;
}

capPixelRatio(Konva);

const SELECT_COLOR = '#1A63CC';
const HOVER_COLOR = 'rgba(26, 99, 204, 0.8)';
const ARTBOARD_STROKE = 'rgba(0, 0, 0, 0.18)';
const SCREEN_LABEL_COLOR = '#5F6368';
const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

/** Uma tela no palco: o grupo arrastável, o retângulo branco, o desenho e o rótulo (no overlay). */
interface MountedScreen {
  readonly group: Konva.Group;
  readonly artboard: Konva.Rect;
  readonly label: Konva.Text;
  /** Desenha as instâncias dentro de `group` (o artboard fica no índice 0). */
  readonly renderer: ScreenRenderer;
}

export class ScreenEditor {
  private readonly stage: Konva.Stage;
  private readonly content = new Konva.Layer();
  /** Todas as telas; congelado como bitmap durante pan e pinça. */
  private readonly world = new Konva.Group();
  private readonly overlay = new Konva.Layer({ listening: true });
  private readonly transformer = new Konva.Transformer({
    rotateEnabled: false,
    keepRatio: false,
    ignoreStroke: true,
    borderStroke: SELECT_COLOR,
    anchorStroke: SELECT_COLOR,
    anchorSize: 8,
    anchorCornerRadius: 2,
    flipEnabled: false,
  });
  /** Container que receberia a instância arrastada (realce durante o arrasto). */
  private readonly dropTarget = new Konva.Rect({
    stroke: SELECT_COLOR,
    strokeWidth: 2,
    dash: [6, 4],
    strokeScaleEnabled: false,
    fill: 'rgba(26, 99, 204, 0.08)',
    listening: false,
    visible: false,
  });
  private readonly hoverRect = new Konva.Rect({
    stroke: HOVER_COLOR,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
    visible: false,
  });
  private readonly label = new Konva.Label({ visible: false, listening: false });
  private readonly labelText = new Konva.Text({
    fontSize: 11,
    fontFamily: 'system-ui, sans-serif',
    fill: '#FFFFFF',
    padding: 3,
  });
  private readonly resize: ResizeObserver;
  private readonly screens = new Map<string, MountedScreen>();
  private library: Library | undefined;
  private board: Board | undefined;
  private activeScreenId: string | undefined;
  private selectedId: string | undefined;
  private hoverId: string | undefined;
  private frame = 0;
  /** Modo "posições fixas": as instâncias não arrastam nem redimensionam (só as propriedades mudam). */
  private fixed = false;

  constructor(
    container: HTMLDivElement,
    private readonly callbacks: EditorCallbacks = {},
  ) {
    this.stage = new Konva.Stage({
      container,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      draggable: true,
    });
    this.content.add(this.world);
    this.label.add(new Konva.Tag({ fill: HOVER_COLOR, cornerRadius: 2 }), this.labelText);
    this.overlay.add(this.dropTarget, this.hoverRect, this.label, this.transformer);
    this.stage.add(this.content, this.overlay);

    this.stage.on('wheel', (e) => this.onWheel(e.evt));
    this.stage.on('click tap', (e) => {
      if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
      const instanceId = this.instanceIdOf(e.target);
      if (instanceId !== undefined) {
        // `select` ativa a tela da instância.
        this.select(instanceId);
        return;
      }
      this.select(undefined);
      const screenId = this.screenIdOf(e.target);
      if (screenId) this.activate(screenId);
    });
    this.stage.on('mousemove', (e) => this.setHover(this.instanceIdOf(e.target)));
    this.stage.on('mouseleave', () => this.setHover(undefined));
    // Pan do palco: o conteúdo vira um bitmap até soltar.
    this.stage.on('dragstart', (e) => {
      if (e.target === this.stage) this.freeze();
    });
    this.stage.on('dragend', (e) => {
      if (e.target === this.stage) this.thaw();
    });
    attachPinchZoom(
      this.stage,
      { min: MIN_SCALE, max: MAX_SCALE },
      {
        onStart: () => this.freeze(),
        onEnd: () => this.thaw(),
        onZoom: (scale) => this.callbacks.onZoom?.(scale),
      },
    );
    this.transformer.on('transform', () => this.onTransform());
    this.transformer.on('transformend', () => this.commitBox());
    this.transformer.boundBoxFunc((oldBox, newBox) => {
      const min = this.minSizeOfSelected();
      const scale = this.stage.scaleX();
      if (newBox.width < min.width * scale || newBox.height < min.height * scale)
        return oldBox;
      return newBox;
    });
    this.resize = new ResizeObserver(() => {
      this.stage.size({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
      });
      this.draw();
    });
    this.resize.observe(container);
  }

  dispose(): void {
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    for (const { renderer } of this.screens.values()) renderer.dispose();
    this.screens.clear();
    this.stage.destroy();
  }

  setLibrary(library: Library | undefined): void {
    this.library = library;
    // Tudo depende da biblioteca: o renderer re-instancia (biblioteca nova equivale a `force`).
    if (this.board) this.setBoard(this.board, true);
  }

  /**
   * Atualiza o quadro: cria, remove e reposiciona as telas pelo id; em cada tela só as
   * instâncias cujo objeto mudou são re-instanciadas. O primeiro quadro é enquadrado.
   */
  setBoard(board: Board, force = false): void {
    this.thaw();
    const first = this.board === undefined;
    this.board = board;
    const seen = new Set<string>();
    board.screens.forEach((placed, index) => {
      const { screen } = placed;
      seen.add(screen.id);
      const mountedScreen = this.screens.get(screen.id) ?? this.createScreen(screen.id);
      mountedScreen.group.position({ x: placed.x, y: placed.y });
      mountedScreen.group.zIndex(index);
      mountedScreen.artboard.size({ width: screen.width, height: screen.height });
      mountedScreen.artboard.fill(screen.background);
      mountedScreen.label.text(screen.name);
      // O artboard é o índice 0 do grupo; as instâncias começam em 1.
      mountedScreen.renderer.update(this.library, screen, { force, zBase: 1 });
    });
    for (const [id, mountedScreen] of this.screens) {
      if (seen.has(id)) continue;
      if (this.selectedId !== undefined && mountedScreen.renderer.nodeOf(this.selectedId))
        this.select(undefined);
      mountedScreen.renderer.dispose();
      mountedScreen.group.destroy();
      mountedScreen.label.destroy();
      this.screens.delete(id);
    }
    // A instância selecionada pode ter saído da tela.
    if (this.selectedId !== undefined && !this.findInstance(this.selectedId))
      this.select(undefined);
    if (first) this.fit();
    this.callbacks.onWarnings?.(this.allWarnings());
    this.transformer.forceUpdate();
    this.syncOverlay();
  }

  /** Realça a tela ativa (sem avisar a página: ela é quem manda). */
  setActiveScreen(id: string | undefined): void {
    if (id === this.activeScreenId) return;
    this.activeScreenId = id;
    this.syncOverlay();
  }

  /**
   * Posições fixas: as instâncias não arrastam e o Transformer perde as alças (a borda da
   * seleção continua). As telas continuam arrastáveis. É um modo da visualização, não um
   * dado da tela.
   */
  setFixed(fixed: boolean): void {
    this.fixed = fixed;
    for (const { renderer } of this.screens.values())
      for (const id of renderer.ids()) renderer.nodeOf(id)?.draggable(!fixed);
    this.transformer.resizeEnabled(!fixed);
    this.draw();
  }

  select(id: string | undefined): void {
    const found = id !== undefined ? this.findInstance(id) : undefined;
    if (!found) id = undefined;
    if (found) this.activate(found.screenId);
    if (id === this.selectedId) return;
    this.selectedId = id;
    const node = found && id !== undefined ? found.renderer.nodeOf(id) : undefined;
    this.transformer.nodes(node ? [node] : []);
    this.callbacks.onSelect?.(id);
    this.syncOverlay();
  }

  setHover(id: string | undefined): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.callbacks.onHover?.(id);
    this.syncOverlay();
  }

  /** Enquadra o quadro inteiro (todas as telas). */
  fit(): void {
    if (!this.board) return;
    const bounds = boardBounds(this.board);
    const margin = 32;
    const scale = clamp(
      Math.min(
        (this.stage.width() - margin * 2) / bounds.width,
        (this.stage.height() - margin * 2) / bounds.height,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: (this.stage.width() - bounds.width * scale) / 2 - bounds.x * scale,
      y: (this.stage.height() - bounds.height * scale) / 2 - bounds.y * scale,
    });
    this.callbacks.onZoom?.(scale);
    this.syncOverlay();
  }

  zoomTo(scale: number): void {
    this.zoomAround(
      { x: this.stage.width() / 2, y: this.stage.height() / 2 },
      clamp(scale, MIN_SCALE, MAX_SCALE),
    );
  }

  scale(): number {
    return this.stage.scaleX();
  }

  /** PNG de uma tela (para conferir o desenho sem a interface). */
  toDataURL(screenId: string): string {
    const placed = this.board ? findScreen(this.board, screenId) : undefined;
    if (!placed) return '';
    this.thaw();
    const previousSelection = this.selectedId;
    this.transformer.nodes([]);
    this.hoverRect.visible(false);
    this.label.visible(false);
    for (const { label, artboard } of this.screens.values()) {
      label.visible(false);
      artboard.stroke(ARTBOARD_STROKE);
    }
    const scale = this.stage.scaleX();
    const url = this.stage.toDataURL({
      x: this.stage.x() + placed.x * scale,
      y: this.stage.y() + placed.y * scale,
      width: placed.screen.width * scale,
      height: placed.screen.height * scale,
      pixelRatio: 2 / scale,
    });
    if (previousSelection) {
      const node =
        this.findInstance(previousSelection)?.renderer.nodeOf(previousSelection);
      if (node) this.transformer.nodes([node]);
    }
    this.syncOverlay();
    return url;
  }

  // -----------------------------------------------------------------------------------

  /** Ativa uma tela (clique ou arrasto no palco) e avisa a página. */
  private activate(id: string): void {
    if (id === this.activeScreenId) return;
    this.thaw();
    this.activeScreenId = id;
    this.callbacks.onActiveScreen?.(id);
    this.syncOverlay();
  }

  private createScreen(screenId: string): MountedScreen {
    const group = new Konva.Group({ draggable: true });
    group.setAttr('screenId', screenId);
    const artboard = new Konva.Rect({
      fill: '#FFFFFF',
      // Contorno em vez de sombra: a sombra de um retângulo do tamanho da tela custa um
      // desfoque inteiro por quadro durante o pan.
      stroke: ARTBOARD_STROKE,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      listening: true,
    });
    artboard.setAttr('screenId', screenId);
    group.add(artboard);
    // Os eventos de arrasto das instâncias também sobem até aqui: só vale o da própria tela.
    group.on('dragstart', (e) => {
      if (!isTarget(e, group)) return;
      this.activate(screenId);
      this.thaw();
    });
    group.on('dragmove', (e) => {
      if (!isTarget(e, group)) return;
      this.transformer.forceUpdate();
      this.syncOverlay();
    });
    group.on('dragend', (e) => {
      if (!isTarget(e, group)) return;
      this.callbacks.onScreenMove?.(screenId, group.x(), group.y());
    });
    const label = new Konva.Text({
      fontSize: 12,
      fontFamily: 'system-ui, sans-serif',
      fill: SCREEN_LABEL_COLOR,
      listening: false,
    });
    this.world.add(group);
    this.overlay.add(label);
    const renderer = new ScreenRenderer(group, {
      onInstanceCreated: (id, node) => this.attachDrag(node, id, screenId),
    });
    const mountedScreen = { group, artboard, label, renderer };
    this.screens.set(screenId, mountedScreen);
    return mountedScreen;
  }

  /** Liga o arrasto (mover a instância, realçar o container de destino) ao grupo criado pelo renderer. */
  private attachDrag(node: Konva.Group, id: string, screenId: string): void {
    node.draggable(!this.fixed);
    node.on('dragstart', (e) => {
      if (!isTarget(e, node)) return;
      this.select(id);
    });
    node.on('dragmove', (e) => {
      if (!isTarget(e, node)) return;
      const mountedScreen = this.screens.get(screenId);
      const screen = this.screenById(screenId);
      const box = { ...this.boxOfWrapper(node), x: node.x(), y: node.y() };
      const target = screen
        ? this.containerAt(
            screen,
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            id,
          )
        : undefined;
      const targetBox = target
        ? mountedScreen?.renderer.instanceOf(target)?.box
        : undefined;
      if (targetBox && mountedScreen)
        this.dropTarget.setAttrs({
          ...targetBox,
          x: mountedScreen.group.x() + targetBox.x,
          y: mountedScreen.group.y() + targetBox.y,
          visible: true,
        });
      else this.dropTarget.visible(false);
      this.draw();
    });
    node.on('dragend', (e) => {
      if (!isTarget(e, node)) return;
      this.dropTarget.visible(false);
      const box = { ...this.boxOfWrapper(node), x: node.x(), y: node.y() };
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const screen = this.screenById(screenId);
      const target = screen ? this.containerAt(screen, center, id) : undefined;
      this.callbacks.onDrop?.(id, box, target, center);
    });
  }

  /** A tela (e o renderer dela) que desenha a instância. */
  private findInstance(
    id: string,
  ): { screenId: string; renderer: ScreenRenderer } | undefined {
    for (const [screenId, { renderer }] of this.screens)
      if (renderer.nodeOf(id)) return { screenId, renderer };
    return undefined;
  }

  /** Avisos de todas as telas, por instância (só as que têm aviso). */
  private allWarnings(): ReadonlyMap<string, readonly string[]> {
    const all = new Map<string, readonly string[]>();
    for (const { renderer } of this.screens.values())
      for (const [id, list] of renderer.warnings()) all.set(id, list);
    return all;
  }

  private screenById(id: string): Screen | undefined {
    return this.board ? findScreen(this.board, id)?.screen : undefined;
  }

  /** Congela as telas como um bitmap na resolução atual (pan e pinça do palco). */
  private freeze(): void {
    freezeGroup(this.world, this.stage.scaleX());
  }

  private thaw(): void {
    if (!this.world.isCached()) return;
    thawGroup(this.world);
    this.draw();
  }

  private typeOf(instance: Instance): TypeDef | undefined {
    return this.library?.types.find((t) => t.id === instance.typeId);
  }

  private boxOfWrapper(wrapper: Konva.Group): Box {
    const size = wrapper.getAttr('boxSize') as
      { width: number; height: number } | undefined;
    return {
      x: wrapper.x(),
      y: wrapper.y(),
      width: size?.width ?? 0,
      height: size?.height ?? 0,
    };
  }

  private minSizeOfSelected(): { width: number; height: number } {
    const id = this.selectedId;
    const instance = id ? this.findInstance(id)?.renderer.instanceOf(id) : undefined;
    const type = instance ? this.typeOf(instance) : undefined;
    return type?.component?.minSize ?? { width: 8, height: 8 };
  }

  /** Durante o redimensionar: converte a escala do Transformer em caixa nova e re-instancia. */
  private onTransform(): void {
    const id = this.selectedId;
    const found = id ? this.findInstance(id) : undefined;
    const instance = id ? found?.renderer.instanceOf(id) : undefined;
    const node = id ? found?.renderer.nodeOf(id) : undefined;
    if (!found || !instance || !node) return;
    const size = this.boxOfWrapper(node);
    const box: Box = {
      x: node.x(),
      y: node.y(),
      width: Math.max(1, size.width * node.scaleX()),
      height: Math.max(1, size.height * node.scaleY()),
    };
    // Instância temporária: o próximo `setBoard` com a tela original desfaz.
    found.renderer.render({ ...instance, box });
    this.transformer.forceUpdate();
    this.draw();
  }

  private commitBox(): void {
    const id = this.selectedId;
    const box = id ? this.findInstance(id)?.renderer.instanceOf(id)?.box : undefined;
    if (id && box) this.callbacks.onBoxChange?.(id, box);
  }

  /**
   * O container mais acima (último na ordem de desenho) da tela cujo retângulo contém o ponto
   * e que aceita o tipo da instância arrastada; nunca a própria instância nem um descendente.
   */
  private containerAt(
    screen: Screen,
    point: { x: number; y: number },
    draggedId: string,
  ): string | undefined {
    const library = this.library;
    if (!library) return undefined;
    const dragged = screen.instances.find((i) => i.id === draggedId);
    if (!dragged) return undefined;
    const excluded = new Set([draggedId, ...descendantsOf(screen, draggedId)]);
    let found: string | undefined;
    for (const candidate of renderOrder(screen)) {
      if (excluded.has(candidate.id)) continue;
      const type = library.types.find((t) => t.id === candidate.typeId);
      if (!isContainer(type)) continue;
      if (type?.allowedChildren && !type.allowedChildren.includes(dragged.typeId))
        continue;
      const b = candidate.box;
      if (
        point.x >= b.x &&
        point.x <= b.x + b.width &&
        point.y >= b.y &&
        point.y <= b.y + b.height
      ) {
        found = candidate.id;
      }
    }
    return found;
  }

  /** A instância sob um nó do palco (procurada no renderer da tela dona). */
  private instanceIdOf(target: Konva.Node | null): string | undefined {
    const screenId = this.screenIdOf(target);
    return screenId
      ? this.screens.get(screenId)?.renderer.instanceIdOf(target)
      : undefined;
  }

  private screenIdOf(target: Konva.Node | null): string | undefined {
    let node: Konva.Node | null = target;
    while (node) {
      const id: unknown = node.getAttr('screenId');
      if (typeof id === 'string') return id;
      node = node.getParent();
    }
    return undefined;
  }

  private onWheel(evt: WheelEvent): void {
    evt.preventDefault();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const factor = Math.exp(-evt.deltaY * (evt.deltaMode === 1 ? 0.05 : 0.0015));
    this.zoomAround(pointer, clamp(this.stage.scaleX() * factor, MIN_SCALE, MAX_SCALE));
  }

  private zoomAround(point: { x: number; y: number }, scale: number): void {
    const old = this.stage.scaleX();
    const local = {
      x: (point.x - this.stage.x()) / old,
      y: (point.y - this.stage.y()) / old,
    };
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({ x: point.x - local.x * scale, y: point.y - local.y * scale });
    this.callbacks.onZoom?.(scale);
    this.syncOverlay();
  }

  /** Hover, rótulos das telas e realce da tela ativa, tudo em coordenadas do quadro. */
  private syncOverlay(): void {
    const scale = this.stage.scaleX();
    for (const [id, { group, artboard, label }] of this.screens) {
      const active = id === this.activeScreenId;
      artboard.stroke(active ? SELECT_COLOR : ARTBOARD_STROKE);
      label.setAttrs({
        x: group.x(),
        y: group.y(),
        scaleX: 1 / scale,
        scaleY: 1 / scale,
        offsetY: label.height() + 4,
        fill: active ? SELECT_COLOR : SCREEN_LABEL_COLOR,
        visible: true,
      });
    }
    const hoverId = this.hoverId !== this.selectedId ? this.hoverId : undefined;
    const hover = hoverId ? this.findInstance(hoverId) : undefined;
    const hoverInstance = hoverId ? hover?.renderer.instanceOf(hoverId) : undefined;
    const origin = hover ? this.screens.get(hover.screenId)?.group : undefined;
    if (hoverId && hover && hoverInstance && origin) {
      const box = hoverInstance.box;
      const x = origin.x() + box.x;
      const y = origin.y() + box.y;
      this.hoverRect.setAttrs({ ...box, x, y, visible: true });
      this.labelText.text(hover.renderer.labelOf(hoverId) ?? hoverInstance.typeId);
      this.label.setAttrs({
        x,
        y,
        scaleX: 1 / scale,
        scaleY: 1 / scale,
        offsetY: this.labelText.height() + 2,
        visible: true,
      });
    } else {
      this.hoverRect.visible(false);
      this.label.visible(false);
    }
    this.draw();
  }

  private draw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.stage.batchDraw();
    });
  }
}

/** O evento é do próprio nó (e não de um descendente, cujos eventos de arrasto também sobem). */
function isTarget(e: { target: Konva.Node }, node: Konva.Node): boolean {
  return e.target === node;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
