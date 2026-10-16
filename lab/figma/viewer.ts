/**
 * Laboratório "Figma somente leitura": o palco Konva da página. Imperativo, como o
 * `CanvasController` da app: a página Preact só chama métodos e recebe callbacks.
 *
 * - roda do mouse: zoom em torno do ponteiro; arrastar o fundo: pan;
 * - hover: contorno e etiqueta com o nome do nó; clique: seleção (contorno mais forte);
 * - "contornos": uma linha fina em volta de todos os nós, para enxergar a estrutura;
 * - "referência": o SVG original desenhado como imagem por cima, com opacidade ajustável,
 *   para comparar a fidelidade do desenho nativo com o do navegador.
 */
import Konva from 'konva';
import { type RenderResult, renderScene, sceneIdOf } from '../scene/renderScene';
import type { Scene } from '../scene/scene';

export interface ViewerCallbacks {
  readonly onHover?: (id: string | undefined) => void;
  readonly onSelect?: (id: string | undefined) => void;
  readonly onZoom?: (scale: number) => void;
  readonly onRenderWarnings?: (warnings: readonly string[]) => void;
}

const HOVER_COLOR = '#1a63cc';
const SELECT_COLOR = '#d81b60';
const OUTLINE_COLOR = 'rgba(26, 99, 204, 0.35)';
const LABEL_BG = 'rgba(26, 99, 204, 0.9)';
const MIN_SCALE = 0.05;
const MAX_SCALE = 32;

export class LabViewer {
  private readonly stage: Konva.Stage;
  private readonly content = new Konva.Layer();
  private readonly outlines = new Konva.Layer({ listening: false });
  private readonly overlay = new Konva.Layer({ listening: false });
  private readonly reference = new Konva.Layer({ listening: false, visible: false });
  private readonly hoverRect = new Konva.Rect({
    stroke: HOVER_COLOR,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    visible: false,
  });
  private readonly selectRect = new Konva.Rect({
    stroke: SELECT_COLOR,
    strokeWidth: 2,
    strokeScaleEnabled: false,
    visible: false,
  });
  private readonly label = new Konva.Label({ visible: false });
  private readonly labelText: Konva.Text;
  private readonly resize: ResizeObserver;
  private rendered: RenderResult | undefined;
  private scene: Scene | undefined;
  private hoverId: string | undefined;
  private selectedId: string | undefined;
  private showOutlines = false;
  private frame = 0;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly callbacks: ViewerCallbacks = {},
  ) {
    this.stage = new Konva.Stage({
      container,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      draggable: true,
    });
    this.labelText = new Konva.Text({
      text: '',
      fontSize: 11,
      fontFamily: 'system-ui, sans-serif',
      fill: '#ffffff',
      padding: 3,
    });
    this.label.add(new Konva.Tag({ fill: LABEL_BG, cornerRadius: 2 }));
    this.label.add(this.labelText);
    this.overlay.add(this.hoverRect, this.selectRect, this.label);
    this.stage.add(this.content, this.reference, this.outlines, this.overlay);

    this.stage.on('wheel', (e) => this.onWheel(e.evt));
    this.stage.on('mousemove', (e) => this.setHover(sceneIdOf(e.target)));
    this.stage.on('mouseleave', () => this.setHover(undefined));
    this.stage.on('click tap', (e) => {
      if (e.evt instanceof MouseEvent && e.evt.button !== 0) return;
      this.select(sceneIdOf(e.target));
    });
    this.stage.on('dragmove', () => this.syncOverlays());
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

  /** Troca a cena (ou limpa, com `undefined`) e enquadra. */
  setScene(scene: Scene | undefined): void {
    this.content.destroyChildren();
    this.outlines.destroyChildren();
    this.reference.destroyChildren();
    this.rendered = undefined;
    this.scene = scene;
    this.hoverId = undefined;
    this.selectedId = undefined;
    this.hoverRect.visible(false);
    this.selectRect.visible(false);
    this.label.visible(false);
    if (scene) {
      this.rendered = renderScene(scene, { onImageLoaded: () => this.draw() });
      this.content.add(this.rendered.root);
      this.callbacks.onRenderWarnings?.(this.rendered.warnings);
      this.buildOutlines();
      this.fit();
    } else {
      this.callbacks.onRenderWarnings?.([]);
      this.draw();
    }
  }

  /** Imagem de referência (o SVG rasterizado pelo navegador), ou nenhuma. */
  setReference(image: HTMLImageElement | undefined, opacity: number): void {
    this.reference.destroyChildren();
    if (image && this.scene) {
      this.reference.add(
        new Konva.Image({
          image,
          width: this.scene.root.width,
          height: this.scene.root.height,
          opacity,
        }),
      );
      this.reference.visible(true);
    } else {
      this.reference.visible(false);
    }
    this.draw();
  }

  setReferenceOpacity(opacity: number): void {
    this.reference.getChildren().forEach((child) => child.opacity(opacity));
    this.draw();
  }

  setOutlines(show: boolean): void {
    this.showOutlines = show;
    this.outlines.visible(show);
    this.draw();
  }

  /** Enquadra a cena inteira no palco, com uma margem. */
  fit(): void {
    const scene = this.scene;
    if (!scene) return;
    const margin = 24;
    const w = Math.max(1, scene.root.width);
    const h = Math.max(1, scene.root.height);
    const scale = clamp(
      Math.min(
        (this.stage.width() - margin * 2) / w,
        (this.stage.height() - margin * 2) / h,
      ),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: (this.stage.width() - w * scale) / 2,
      y: (this.stage.height() - h * scale) / 2,
    });
    this.callbacks.onZoom?.(scale);
    this.syncOverlays();
  }

  zoomTo(scale: number): void {
    const next = clamp(scale, MIN_SCALE, MAX_SCALE);
    const center = { x: this.stage.width() / 2, y: this.stage.height() / 2 };
    this.zoomAround(center, next);
  }

  scale(): number {
    return this.stage.scaleX();
  }

  select(id: string | undefined): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.callbacks.onSelect?.(id);
    this.syncOverlays();
  }

  setHover(id: string | undefined): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.callbacks.onHover?.(id);
    this.syncOverlays();
  }

  /** Retângulo do nó em coordenadas do design (px do Figma), ou nada se o nó não existir. */
  boxOf(id: string): { x: number; y: number; width: number; height: number } | undefined {
    const node = this.rendered?.byId.get(id);
    if (!node) return undefined;
    return node.getClientRect({
      relativeTo: this.content,
      skipShadow: true,
      skipStroke: false,
    });
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
    this.syncOverlays();
  }

  private buildOutlines(): void {
    const rendered = this.rendered;
    if (!rendered) return;
    for (const [, group] of rendered.byId) {
      const box = group.getClientRect({ relativeTo: this.content, skipShadow: true });
      if (box.width <= 0 && box.height <= 0) continue;
      this.outlines.add(
        new Konva.Rect({
          ...box,
          stroke: OUTLINE_COLOR,
          strokeWidth: 1,
          strokeScaleEnabled: false,
        }),
      );
    }
    this.outlines.visible(this.showOutlines);
  }

  private syncOverlays(): void {
    const hover = this.hoverId ? this.boxOf(this.hoverId) : undefined;
    const hoverNode = this.hoverId ? this.rendered?.byId.get(this.hoverId) : undefined;
    if (hover && hoverNode && this.hoverId !== this.selectedId) {
      this.hoverRect.setAttrs({ ...hover, visible: true });
      this.labelText.text(hoverNode.name() || this.hoverId || '');
      const scale = this.stage.scaleX();
      // A etiqueta tem tamanho de tela constante: compensa a escala do palco.
      this.label.setAttrs({
        x: hover.x,
        y: hover.y,
        scaleX: 1 / scale,
        scaleY: 1 / scale,
        offsetY: this.labelText.height() + 2,
        visible: true,
      });
    } else {
      this.hoverRect.visible(false);
      this.label.visible(false);
    }
    const selected = this.selectedId ? this.boxOf(this.selectedId) : undefined;
    if (selected) this.selectRect.setAttrs({ ...selected, visible: true });
    else this.selectRect.visible(false);
    this.draw();
  }

  /** No máximo um desenho por quadro, como na app. */
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
