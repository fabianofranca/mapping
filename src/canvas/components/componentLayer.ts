// A camada de componentes do canvas: o desenho de cada marcação que tem componente.
// Konva imperativo (como os outros renderers de `src/canvas/`); o desenho em si vem pronto
// do modelo (cena instanciada na caixa da marcação, em pixels da imagem).
import Konva from 'konva/lib/Core';
import { IDENTITY_PLACEMENT, type Placement, type Rect } from '../../model';
import type { ScreenAnchor } from '../../model/components/componentFormat';
import type { FrameNode } from '../../model/components/scene';
import { type RemoteImageResult, type RenderPalette, renderScene } from './renderScene';

/** O que o renderer desenha de cada marcação (o `ComponentDrawing` do modelo tem esta forma). */
export interface LayerDrawing {
  readonly markingId: string;
  /** Container da marcação; `null` = marcação do canvas (espaço de `placement` identidade). */
  readonly containerId: string | null;
  /** Cena instanciada no retângulo da marcação, em pixels da imagem. */
  readonly root: FrameNode;
  /**
   * Desenho em pixels de tela: `root` mede o `size` do componente na origem e é ancorado em
   * `anchor` no `rect` da marcação (pixels do espaço), com tamanho fixo em qualquer zoom.
   */
  readonly screen?: { readonly anchor: ScreenAnchor; readonly rect: Rect };
}

/** Fração (da largura e da altura) do ponto de cada âncora. */
const ANCHOR_FRACTION: Record<ScreenAnchor, readonly [number, number]> = {
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
};

export interface ComponentLayerOptions {
  /** Cores do reservado de imagem e do nó desconhecido (vêm dos tokens do tema). */
  readonly placeholder?: Partial<RenderPalette>;
  /** Uma imagem embutida (`data:`) terminou de carregar: o chamador pede um quadro. */
  readonly onImageLoaded?: () => void;
  /** Resolve a URL do nó `image` do componente (portas da app + carregador); ver `renderScene`. */
  readonly remoteImage?: (url: string) => RemoteImageResult;
}

interface Mounted {
  readonly drawing: LayerDrawing;
  readonly node: Konva.Group;
  /** URLs remotas que o desenho usa (para refazer só ele quando a imagem muda). */
  readonly imageUrls: readonly string[];
  /** Quantas imagens (`Konva.Image`) o desenho tem de fato (o reservado não conta). */
  readonly images: number;
}

type Parent = Konva.Group | Konva.Layer;

/**
 * Desenha os desenhos de componentes dentro de um grupo (ou camada) do Konva. Cada espaço tem um
 * grupo próprio, posicionado pelo `placement` dele (pixels da imagem → canvas; o canvas, com
 * `containerId` nulo, usa a identidade); dentro dele, um nó por marcação. Não ouve eventos
 * (`listening: false`) e não recorta o conteúdo.
 */
export class ComponentLayerRenderer {
  private readonly imageGroups = new Map<string | null, Konva.Group>();
  private readonly mounted = new Map<string, Mounted>();
  /** Zoom do stage: o desenho em pixels de tela se contrai por ele (e pela escala da imagem). */
  private zoom = 1;
  private placements: ReadonlyMap<string, Placement> = new Map();

  constructor(
    private readonly parent: Parent,
    private readonly options: ComponentLayerOptions = {},
  ) {}

  /** Quantos desenhos estão montados (publicado no container para os testes e2e). */
  get size(): number {
    return this.mounted.size;
  }

  /** Quantas imagens estão desenhadas de fato nos componentes (gancho de teste e2e). */
  get imageCount(): number {
    let total = 0;
    for (const entry of this.mounted.values()) total += entry.images;
    return total;
  }

  /**
   * Desenha os desenhos de `drawings` (a ordem do Map é a ordem de desenho, de baixo para cima)
   * que passam em `visible` e cuja imagem tem `placement`. Diff por identidade: só o desenho
   * cujo objeto mudou é refeito (`renderScene`); o que sumiu é destruído; a ordem é refeita só
   * quando muda. Devolve `true` se algo mudou (criado, refeito, removido, movido ou reordenado).
   * `zoom` (padrão: o último) é a escala do stage, para os desenhos em pixels de tela.
   */
  render(
    drawings: ReadonlyMap<string, LayerDrawing>,
    visible: (drawing: LayerDrawing) => boolean,
    placements: ReadonlyMap<string, Placement>,
    zoom: number = this.zoom,
  ): boolean {
    let changed = false;
    this.zoom = zoom;
    this.placements = placements;
    // Ordem de desenho por espaço, só do que aparece.
    const wanted = new Map<string | null, LayerDrawing[]>();
    for (const drawing of drawings.values()) {
      if (
        placementOf(placements, drawing.containerId) === undefined ||
        !visible(drawing)
      ) {
        continue;
      }
      const list = wanted.get(drawing.containerId);
      if (list) list.push(drawing);
      else wanted.set(drawing.containerId, [drawing]);
    }

    // Some o que não está mais na lista (ou trocou de imagem).
    const keep = new Set<string>();
    for (const list of wanted.values()) for (const d of list) keep.add(d.markingId);
    for (const [markingId, entry] of this.mounted) {
      if (keep.has(markingId)) continue;
      entry.node.destroy();
      this.mounted.delete(markingId);
      changed = true;
    }
    for (const [containerId, group] of this.imageGroups) {
      if (wanted.has(containerId)) continue;
      group.destroy();
      this.imageGroups.delete(containerId);
      changed = true;
    }

    for (const [containerId, list] of wanted) {
      const placement = placementOf(placements, containerId);
      if (!placement) continue;
      const { group, created } = this.groupOf(containerId);
      if (created) changed = true;
      if (placeGroup(group, placement)) changed = true;
      for (const drawing of list) {
        const current = this.mounted.get(drawing.markingId);
        if (
          current &&
          current.drawing === drawing &&
          current.node.getParent() === group
        ) {
          continue;
        }
        current?.node.destroy();
        const { node, imageUrls, images } = this.draw(drawing);
        group.add(node);
        this.mounted.set(drawing.markingId, { drawing, node, imageUrls, images });
        changed = true;
      }
      for (const drawing of list) {
        const node = this.mounted.get(drawing.markingId)?.node;
        if (node && placeScreen(node, drawing, placement.scale, zoom)) changed = true;
      }
      if (sortChildren(group, list, this.mounted)) changed = true;
    }
    return changed;
  }

  /**
   * O zoom do stage mudou: refaz só a posição e a escala dos desenhos em pixels de tela (nada é
   * redesenhado). Devolve `true` se algum nó mudou.
   */
  setZoom(zoom: number): boolean {
    if (zoom === this.zoom) return false;
    this.zoom = zoom;
    let changed = false;
    for (const entry of this.mounted.values()) {
      const placement = placementOf(this.placements, entry.drawing.containerId);
      if (placement && placeScreen(entry.node, entry.drawing, placement.scale, zoom)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Refaz só os desenhos que usam alguma das `urls` (a imagem terminou de carregar, falhou ou
   * saiu do cache), ou todos os que usam alguma imagem remota quando `urls` é `null` (o
   * consentimento ou um interruptor mudou). O nó novo ocupa o lugar do antigo na ordem.
   * Devolve `true` se algum foi refeito.
   */
  refreshImages(urls: ReadonlySet<string> | null): boolean {
    let changed = false;
    for (const [markingId, entry] of this.mounted) {
      if (entry.imageUrls.length === 0) continue;
      if (urls !== null && !entry.imageUrls.some((url) => urls.has(url))) continue;
      const parent = entry.node.getParent();
      const index = entry.node.zIndex();
      entry.node.destroy();
      const { node, imageUrls, images } = this.draw(entry.drawing);
      if (parent) {
        parent.add(node);
        node.zIndex(index);
        const placement = placementOf(this.placements, entry.drawing.containerId);
        if (placement) placeScreen(node, entry.drawing, placement.scale, this.zoom);
      }
      this.mounted.set(markingId, { drawing: entry.drawing, node, imageUrls, images });
      changed = true;
    }
    return changed;
  }

  /** Destrói tudo o que o renderer criou (o grupo recebido fica a cargo de quem o criou). */
  destroy(): void {
    for (const group of this.imageGroups.values()) group.destroy();
    this.imageGroups.clear();
    this.mounted.clear();
  }

  private groupOf(containerId: string | null): { group: Konva.Group; created: boolean } {
    const existing = this.imageGroups.get(containerId);
    if (existing) return { group: existing, created: false };
    const group = new Konva.Group({ listening: false, name: 'component-layer-image' });
    group.setAttr('containerId', containerId ?? '');
    this.parent.add(group);
    this.imageGroups.set(containerId, group);
    return { group, created: true };
  }

  private draw(drawing: LayerDrawing): {
    node: Konva.Group;
    imageUrls: readonly string[];
    images: number;
  } {
    const { root, imageUrls } = renderScene(
      { root: drawing.root, warnings: [] },
      {
        palette: this.options.placeholder,
        showSlots: false,
        onImageLoaded: this.options.onImageLoaded,
        // O canvas principal não lê pixels: imagem `opaque` (sem CORS) aparece.
        pixelSafe: false,
        ...(this.options.remoteImage ? { remoteImage: this.options.remoteImage } : {}),
      },
    );
    root.listening(false);
    root.setAttr('markingId', drawing.markingId);
    return { node: root, imageUrls, images: root.find('Image').length };
  }
}

/** Posição do espaço: a do container ou, no canvas (`null`), a identidade. */
function placementOf(
  placements: ReadonlyMap<string, Placement>,
  containerId: string | null,
): Placement | undefined {
  return containerId === null ? IDENTITY_PLACEMENT : placements.get(containerId);
}

/**
 * Desenho em pixels de tela: contrai o nó pela escala da imagem e pelo zoom (tamanho fixo na
 * tela) e o põe de modo que o ponto da âncora do desenho caia no mesmo ponto do retângulo da
 * marcação. Devolve `true` se algo mudou; desenho sem `screen` não é tocado.
 */
function placeScreen(
  node: Konva.Group,
  { screen, root }: LayerDrawing,
  imageScale: number,
  zoom: number,
): boolean {
  if (!screen) return false;
  const k = 1 / (zoom * imageScale);
  const [fx, fy] = ANCHOR_FRACTION[screen.anchor];
  const x = screen.rect.x + fx * (screen.rect.width - root.width * k);
  const y = screen.rect.y + fy * (screen.rect.height - root.height * k);
  if (node.x() === x && node.y() === y && node.scaleX() === k && node.scaleY() === k) {
    return false;
  }
  node.setAttrs({ x, y, scaleX: k, scaleY: k });
  return true;
}

/** Posiciona o grupo da imagem; `true` se algo mudou. */
function placeGroup(group: Konva.Group, { x, y, scale }: Placement): boolean {
  if (group.x() === x && group.y() === y && group.scaleX() === scale) return false;
  group.position({ x, y });
  group.scale({ x: scale, y: scale });
  return true;
}

/** Deixa os filhos do grupo na ordem de `list`; `true` se foi preciso mexer. */
function sortChildren(
  group: Konva.Group,
  list: readonly LayerDrawing[],
  mounted: ReadonlyMap<string, Mounted>,
): boolean {
  const children = group.getChildren();
  const sameOrder = list.every(
    (drawing, index) => children[index] === mounted.get(drawing.markingId)?.node,
  );
  if (sameOrder) return false;
  list.forEach((drawing, index) => {
    mounted.get(drawing.markingId)?.node.zIndex(index);
  });
  return true;
}
