/**
 * Laboratório "Componentes": o palco do quadro de telas. Imperativo (como o `CanvasController`
 * da app); a página Preact chama métodos e recebe callbacks.
 *
 * - o canvas é um **quadro** com várias telas; cada tela é um `Konva.Group` arrastável (como
 *   um todo) na posição dela no quadro, com o retângulo branco da tela (`artboard`) e, por
 *   cima, um `Konva.Group` por instância na posição do retângulo (coordenadas da tela), com o
 *   componente instanciado dentro (`instantiate` → `renderScene`);
 * - o que arrasta o quê: sobre uma instância arrastável, a instância; sobre o fundo da tela
 *   (ou sobre uma instância no modo "posições fixas", que não arrasta), a tela inteira; no
 *   vazio, o palco (pan). O `Transformer` redimensiona a instância e, a cada movimento, o
 *   componente é **re-instanciado** no novo tamanho (o template se adapta; nada é esticado);
 * - roda do mouse: zoom em torno do ponteiro; hover mostra o nome da instância; cada tela
 *   leva o nome acima do canto, e a tela ativa (a do último clique) fica em destaque.
 */
import Konva from 'konva';
import { renderScene } from '../scene/renderScene';
import { attachPinchZoom, capPixelRatio, freezeGroup, thawGroup } from '../shared/pinch';
import type { FieldValues } from './componentFormat';
import { type TextMeasurer, instantiate } from './instantiate';
import { isContainer } from './arrange';
import { type Board, boardBounds, findScreen } from './board';
import { type Library, type TypeDef, instanceLabel } from './library';
import {
  type Box,
  type Instance,
  type Screen,
  descendantsOf,
  renderOrder,
} from './screen';

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
const MISSING_COLOR = '#D81B60';
const ARTBOARD_STROKE = 'rgba(0, 0, 0, 0.18)';
const SCREEN_LABEL_COLOR = '#5F6368';
const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

interface Mounted {
  instance: Instance;
  readonly wrapper: Konva.Group;
  readonly screenId: string;
}

/** Uma tela no palco: o grupo arrastável, o retângulo branco e o rótulo (no overlay). */
interface MountedScreen {
  readonly group: Konva.Group;
  readonly artboard: Konva.Rect;
  readonly label: Konva.Text;
}

/** Mede texto com o próprio Konva, para o layout bater com o desenho. */
export const konvaMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const probe = new Konva.Text({
    text,
    fontFamily: `"${font.family}", sans-serif`,
    fontSize: font.size,
    fontStyle: `${font.italic ? 'italic ' : ''}${font.weight === 400 ? 'normal' : String(font.weight)}`,
    lineHeight: font.lineHeight / font.size,
    letterSpacing: font.letterSpacing,
    wrap: 'word',
    ...(maxWidth !== undefined ? { width: maxWidth } : {}),
  });
  const metrics = { width: probe.width(), height: probe.height() };
  probe.destroy();
  return metrics;
};

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
  private readonly mounted = new Map<string, Mounted>();
  private readonly warnings = new Map<string, readonly string[]>();
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
      if (instanceId) {
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
    this.stage.destroy();
  }

  setLibrary(library: Library | undefined): void {
    this.library = library;
    // Tudo depende da biblioteca: remonta as instâncias.
    for (const { wrapper } of this.mounted.values()) wrapper.destroy();
    this.mounted.clear();
    this.warnings.clear();
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
      this.syncInstances(mountedScreen.group, screen, force);
    });
    for (const [id, mountedScreen] of this.screens) {
      if (seen.has(id)) continue;
      for (const [instanceId, m] of this.mounted) {
        if (m.screenId !== id) continue;
        this.mounted.delete(instanceId);
        this.warnings.delete(instanceId);
        if (this.selectedId === instanceId) this.select(undefined);
      }
      mountedScreen.group.destroy();
      mountedScreen.label.destroy();
      this.screens.delete(id);
    }
    if (first) this.fit();
    this.callbacks.onWarnings?.(new Map(this.warnings));
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
    for (const { wrapper } of this.mounted.values()) wrapper.draggable(!fixed);
    this.transformer.resizeEnabled(!fixed);
    this.draw();
  }

  select(id: string | undefined): void {
    if (id !== undefined && !this.mounted.has(id)) id = undefined;
    const screenId = id ? this.mounted.get(id)?.screenId : undefined;
    if (screenId) this.activate(screenId);
    if (id === this.selectedId) return;
    this.selectedId = id;
    const wrapper = id ? this.mounted.get(id)?.wrapper : undefined;
    this.transformer.nodes(wrapper ? [wrapper] : []);
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
      const wrapper = this.mounted.get(previousSelection)?.wrapper;
      if (wrapper) this.transformer.nodes([wrapper]);
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
    const mountedScreen = { group, artboard, label };
    this.screens.set(screenId, mountedScreen);
    return mountedScreen;
  }

  /** Diff das instâncias de uma tela: só as que mudaram de objeto são re-instanciadas. */
  private syncInstances(group: Konva.Group, screen: Screen, force: boolean): void {
    const seen = new Set<string>();
    renderOrder(screen).forEach((instance, index) => {
      seen.add(instance.id);
      const current = this.mounted.get(instance.id);
      // O artboard é o índice 0 do grupo.
      const z = index + 1;
      if (current && current.instance === instance && !force) {
        current.wrapper.zIndex(z);
        return;
      }
      if (current) {
        this.renderInto(current.wrapper, instance);
        current.instance = instance;
        current.wrapper.zIndex(z);
      } else {
        const wrapper = this.createWrapper(instance, screen.id);
        group.add(wrapper);
        this.renderInto(wrapper, instance);
        this.mounted.set(instance.id, { instance, wrapper, screenId: screen.id });
        wrapper.zIndex(z);
      }
    });
    for (const [id, m] of this.mounted) {
      if (m.screenId !== screen.id || seen.has(id)) continue;
      m.wrapper.destroy();
      this.mounted.delete(id);
      this.warnings.delete(id);
      if (this.selectedId === id) this.select(undefined);
    }
  }

  private createWrapper(instance: Instance, screenId: string): Konva.Group {
    const wrapper = new Konva.Group({ draggable: !this.fixed });
    wrapper.setAttr('instanceId', instance.id);
    wrapper.on('dragstart', (e) => {
      if (!isTarget(e, wrapper)) return;
      this.select(instance.id);
    });
    wrapper.on('dragmove', (e) => {
      if (!isTarget(e, wrapper)) return;
      const group = this.screens.get(screenId)?.group;
      const screen = this.screenById(screenId);
      const box = { ...this.boxOfWrapper(wrapper), x: wrapper.x(), y: wrapper.y() };
      const target = screen
        ? this.containerAt(
            screen,
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            instance.id,
          )
        : undefined;
      const targetBox = target ? this.mounted.get(target)?.instance.box : undefined;
      if (targetBox && group)
        this.dropTarget.setAttrs({
          ...targetBox,
          x: group.x() + targetBox.x,
          y: group.y() + targetBox.y,
          visible: true,
        });
      else this.dropTarget.visible(false);
      this.draw();
    });
    wrapper.on('dragend', (e) => {
      if (!isTarget(e, wrapper)) return;
      this.dropTarget.visible(false);
      const box = { ...this.boxOfWrapper(wrapper), x: wrapper.x(), y: wrapper.y() };
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const screen = this.screenById(screenId);
      const target = screen ? this.containerAt(screen, center, instance.id) : undefined;
      this.callbacks.onDrop?.(instance.id, box, target, center);
    });
    return wrapper;
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

  private renderInto(wrapper: Konva.Group, instance: Instance): void {
    wrapper.destroyChildren();
    wrapper.position({ x: instance.box.x, y: instance.box.y });
    wrapper.scale({ x: 1, y: 1 });
    wrapper.setAttr('boxSize', {
      width: instance.box.width,
      height: instance.box.height,
    });
    const type = this.typeOf(instance);
    const local = { x: 0, y: 0, width: instance.box.width, height: instance.box.height };
    if (!type?.component) {
      // Tipo sem componente (ou biblioteca sem o tipo): a caixa tracejada com o nome.
      wrapper.add(
        new Konva.Rect({
          ...local,
          stroke: MISSING_COLOR,
          strokeWidth: 1,
          dash: [6, 4],
          strokeScaleEnabled: false,
          fill: 'rgba(216, 27, 96, 0.06)',
        }),
        new Konva.Text({
          ...local,
          text: type
            ? `${type.name}\n(sem componente)`
            : `${instance.typeId}\n(tipo desconhecido)`,
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          fill: MISSING_COLOR,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        }),
      );
      this.warnings.set(instance.id, [
        type
          ? 'tipo sem componente na especialização'
          : 'tipo não existe na especialização',
      ]);
      return;
    }
    const result = instantiate(type.component, instance.values as FieldValues, local, {
      measure: konvaMeasurer,
      idPrefix: instance.id,
    });
    const rendered = renderScene({
      root: result.root,
      warnings: [],
    });
    rendered.root.listening(true);
    wrapper.add(rendered.root);
    // Área de clique inteira (mesmo com fundo transparente).
    wrapper.add(
      new Konva.Rect({ ...local, fill: 'rgba(0,0,0,0)', name: 'hit', listening: true }),
    );
    const all = [...result.warnings, ...rendered.warnings];
    if (all.length > 0) this.warnings.set(instance.id, all);
    else this.warnings.delete(instance.id);
    wrapper.setAttr('label', instanceLabel(type, instance.values));
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
    const mounted = this.selectedId ? this.mounted.get(this.selectedId) : undefined;
    const type = mounted ? this.typeOf(mounted.instance) : undefined;
    return type?.component?.minSize ?? { width: 8, height: 8 };
  }

  /** Durante o redimensionar: converte a escala do Transformer em caixa nova e re-instancia. */
  private onTransform(): void {
    const mounted = this.selectedId ? this.mounted.get(this.selectedId) : undefined;
    if (!mounted) return;
    const { wrapper } = mounted;
    const size = this.boxOfWrapper(wrapper);
    const box: Box = {
      x: wrapper.x(),
      y: wrapper.y(),
      width: Math.max(1, size.width * wrapper.scaleX()),
      height: Math.max(1, size.height * wrapper.scaleY()),
    };
    mounted.instance = { ...mounted.instance, box };
    this.renderInto(wrapper, mounted.instance);
    this.transformer.forceUpdate();
    this.draw();
  }

  private commitBox(): void {
    const mounted = this.selectedId ? this.mounted.get(this.selectedId) : undefined;
    if (!mounted) return;
    this.callbacks.onBoxChange?.(mounted.instance.id, mounted.instance.box);
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

  private instanceIdOf(target: Konva.Node | null): string | undefined {
    let node: Konva.Node | null = target;
    while (node) {
      const id: unknown = node.getAttr('instanceId');
      if (typeof id === 'string') return id;
      node = node.getParent();
    }
    return undefined;
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
    const hover =
      this.hoverId && this.hoverId !== this.selectedId
        ? this.mounted.get(this.hoverId)
        : undefined;
    const origin = hover ? this.screens.get(hover.screenId)?.group : undefined;
    if (hover && origin) {
      const box = hover.instance.box;
      const x = origin.x() + box.x;
      const y = origin.y() + box.y;
      this.hoverRect.setAttrs({ ...box, x, y, visible: true });
      this.labelText.text(
        String(hover.wrapper.getAttr('label') ?? hover.instance.typeId),
      );
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
