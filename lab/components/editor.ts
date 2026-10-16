/**
 * Laboratório "Componentes": o palco da tela. Imperativo (como o `CanvasController` da app);
 * a página Preact chama métodos e recebe callbacks.
 *
 * - a tela é um retângulo branco sobre o fundo; cada instância é um `Konva.Group` na posição
 *   do retângulo dela, com o componente instanciado dentro (`instantiate` → `renderScene`);
 * - arrastar move; o `Transformer` redimensiona e, a cada movimento, o componente é
 *   **re-instanciado** no novo tamanho (o template se adapta; nada é esticado);
 * - roda do mouse: zoom em torno do ponteiro; arrastar o fundo: pan; hover mostra o nome.
 */
import Konva from 'konva';
import { renderScene } from '../scene/renderScene';
import { attachPinchZoom, capPixelRatio, freezeGroup, thawGroup } from '../shared/pinch';
import type { FieldValues } from './componentFormat';
import { type TextMeasurer, instantiate } from './instantiate';
import { isContainer } from './arrange';
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
  readonly onHover?: (id: string | undefined) => void;
  /** Fim de um redimensionamento. */
  readonly onBoxChange?: (id: string, box: Box) => void;
  /**
   * Fim de um arrasto: a caixa nova, o container sob o centro da instância (ou nenhum, nível
   * da tela) e o ponto do centro, para a página decidir a posição entre os irmãos.
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
const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

interface Mounted {
  instance: Instance;
  readonly wrapper: Konva.Group;
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
  private readonly board = new Konva.Layer();
  private readonly content = new Konva.Layer();
  /** Todas as instâncias; congelado como bitmap durante pan, pinça e arrasto. */
  private readonly world = new Konva.Group();
  /** A instância em arrasto ou redimensionamento, fora do bitmap congelado. */
  private readonly dragLayer = new Konva.Layer();
  private readonly overlay = new Konva.Layer({ listening: true });
  private readonly artboard = new Konva.Rect({
    fill: '#FFFFFF',
    // Contorno em vez de sombra: a sombra de um retângulo do tamanho da tela custa um
    // desfoque inteiro por quadro durante o pan.
    stroke: 'rgba(0, 0, 0, 0.18)',
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
  });
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
  private readonly mounted = new Map<string, Mounted>();
  private readonly warnings = new Map<string, readonly string[]>();
  private library: Library | undefined;
  private screen: Screen | undefined;
  private selectedId: string | undefined;
  private hoverId: string | undefined;
  private frame = 0;

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
    this.board.add(this.artboard);
    this.board.listening(false);
    this.content.add(this.world);
    this.label.add(new Konva.Tag({ fill: HOVER_COLOR, cornerRadius: 2 }), this.labelText);
    this.overlay.add(this.dropTarget, this.hoverRect, this.label, this.transformer);
    this.stage.add(this.board, this.content, this.dragLayer, this.overlay);

    this.stage.on('wheel', (e) => this.onWheel(e.evt));
    this.stage.on('click tap', (e) => {
      if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
      const id = this.instanceIdOf(e.target);
      this.select(id);
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
    this.transformer.on('transformstart', () => this.lift(this.selectedWrapper()));
    this.transformer.on('transform', () => this.onTransform());
    this.transformer.on('transformend', () => {
      this.drop(this.selectedWrapper());
      this.commitBox();
    });
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
    if (this.screen) this.setScreen(this.screen, true);
  }

  /** Atualiza a tela: só as instâncias cujo objeto mudou são re-instanciadas. */
  setScreen(screen: Screen, force = false): void {
    this.thaw();
    const previous = this.screen;
    this.screen = screen;
    if (
      !previous ||
      previous.width !== screen.width ||
      previous.height !== screen.height
    ) {
      this.artboard.size({ width: screen.width, height: screen.height });
      if (!previous) this.fit();
    }
    this.artboard.fill(screen.background);
    const seen = new Set<string>();
    renderOrder(screen).forEach((instance, index) => {
      seen.add(instance.id);
      const current = this.mounted.get(instance.id);
      if (current && current.instance === instance && !force) {
        current.wrapper.zIndex(index);
        return;
      }
      if (current) {
        this.renderInto(current.wrapper, instance);
        current.instance = instance;
        current.wrapper.zIndex(index);
      } else {
        const wrapper = new Konva.Group({ draggable: true });
        wrapper.setAttr('instanceId', instance.id);
        wrapper.on('dragend', () => {
          this.drop(wrapper);
          this.dropTarget.visible(false);
          const box = { ...this.boxOfWrapper(wrapper), x: wrapper.x(), y: wrapper.y() };
          const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          const target = this.containerAt(center, instance.id);
          this.callbacks.onDrop?.(instance.id, box, target, center);
        });
        wrapper.on('dragmove', () => {
          const box = { ...this.boxOfWrapper(wrapper), x: wrapper.x(), y: wrapper.y() };
          const target = this.containerAt(
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
            instance.id,
          );
          const targetBox = target ? this.mounted.get(target)?.instance.box : undefined;
          if (targetBox) this.dropTarget.setAttrs({ ...targetBox, visible: true });
          else this.dropTarget.visible(false);
          this.draw();
        });
        wrapper.on('dragstart', () => {
          this.select(instance.id);
          this.lift(wrapper);
        });
        this.world.add(wrapper);
        this.renderInto(wrapper, instance);
        this.mounted.set(instance.id, { instance, wrapper });
        wrapper.zIndex(index);
      }
    });
    for (const [id, { wrapper }] of this.mounted) {
      if (!seen.has(id)) {
        wrapper.destroy();
        this.mounted.delete(id);
        this.warnings.delete(id);
        if (this.selectedId === id) this.select(undefined);
      }
    }
    this.callbacks.onWarnings?.(new Map(this.warnings));
    this.syncOverlay();
  }

  select(id: string | undefined): void {
    if (id !== undefined && !this.mounted.has(id)) id = undefined;
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

  fit(): void {
    const screen = this.screen;
    if (!screen) return;
    const margin = 32;
    const scale = clamp(
      Math.min(
        (this.stage.width() - margin * 2) / screen.width,
        (this.stage.height() - margin * 2) / screen.height,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: (this.stage.width() - screen.width * scale) / 2,
      y: (this.stage.height() - screen.height * scale) / 2,
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

  /** PNG da tela inteira (para conferir o desenho sem a interface). */
  toDataURL(): string {
    const screen = this.screen;
    if (!screen) return '';
    this.thaw();
    const previousSelection = this.selectedId;
    this.transformer.nodes([]);
    this.hoverRect.visible(false);
    this.label.visible(false);
    const scale = this.stage.scaleX();
    const url = this.stage.toDataURL({
      x: this.stage.x(),
      y: this.stage.y(),
      width: screen.width * scale,
      height: screen.height * scale,
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

  private selectedWrapper(): Konva.Group | undefined {
    return this.selectedId ? this.mounted.get(this.selectedId)?.wrapper : undefined;
  }

  /** Congela as instâncias como um bitmap na resolução atual (pan, pinça, arrasto). */
  private freeze(): void {
    freezeGroup(this.world, this.stage.scaleX());
  }

  private thaw(): void {
    if (!this.world.isCached()) return;
    thawGroup(this.world);
    this.draw();
  }

  /** Tira a instância do bitmap congelado para ela se mover sozinha, numa camada à parte. */
  private lift(wrapper: Konva.Group | undefined): void {
    if (!wrapper || wrapper.getLayer() === this.dragLayer) return;
    this.thaw();
    wrapper.moveTo(this.dragLayer);
    this.freeze();
  }

  private drop(wrapper: Konva.Group | undefined): void {
    if (!wrapper || wrapper.getLayer() !== this.dragLayer) return;
    this.thaw();
    wrapper.moveTo(this.world);
    const id: unknown = wrapper.getAttr('instanceId');
    const index = this.screen?.instances.findIndex((i) => i.id === id) ?? -1;
    if (index >= 0) wrapper.zIndex(index);
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
   * O container mais acima (último na ordem de desenho) cujo retângulo contém o ponto e que
   * aceita o tipo da instância arrastada; nunca a própria instância nem um descendente dela.
   */
  private containerAt(
    point: { x: number; y: number },
    draggedId: string,
  ): string | undefined {
    const screen = this.screen;
    const library = this.library;
    if (!screen || !library) return undefined;
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

  private syncOverlay(): void {
    const hover =
      this.hoverId && this.hoverId !== this.selectedId
        ? this.mounted.get(this.hoverId)
        : undefined;
    if (hover) {
      const box = hover.instance.box;
      this.hoverRect.setAttrs({ ...box, visible: true });
      const scale = this.stage.scaleX();
      this.labelText.text(
        String(hover.wrapper.getAttr('label') ?? hover.instance.typeId),
      );
      this.label.setAttrs({
        x: box.x,
        y: box.y,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
