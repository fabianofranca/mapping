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

/** Em que grupo `place` mexeu: o da imagem (a camada de sempre) ou o do arrasto. */
const TOUCHED_GROUP = 1;
const TOUCHED_MIRROR = 2;

/**
 * Desenha os desenhos de componentes dentro de um grupo (ou camada) do Konva. Cada espaço tem um
 * grupo próprio, posicionado pelo `placement` dele (pixels da imagem → canvas; o canvas, com
 * `containerId` nulo, usa a identidade); dentro dele, um nó por marcação. Não ouve eventos
 * (`listening: false`) e não recorta o conteúdo.
 */
export class ComponentLayerRenderer {
  private readonly imageGroups = new Map<string | null, Konva.Group>();
  private readonly mounted = new Map<string, Mounted>();
  /** As marcações cujo desenho se move num gesto e o grupo em que ficam até soltar (decisões 5 e 6). */
  private dragIds: ReadonlySet<string> | null = null;
  private dragTarget: Konva.Container | null = null;
  /**
   * Um grupo por container no grupo de arrasto, com a mesma posição e escala do grupo da imagem: o
   * desenho que se move fica nele, e o grupo da imagem (que o desenho de fora continua usando) não
   * é tocado.
   */
  private readonly mirrors = new Map<string | null, Konva.Group>();
  private dragChanged = false;
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
   * Leva os desenhos das marcações de `ids` para o grupo de arrasto no próximo `render` (os nós são
   * os mesmos, movidos com `moveTo`, nunca refeitos), ou os devolve ao grupo da imagem com `null`.
   */
  setDragged(ids: ReadonlySet<string> | null, target: Konva.Container): void {
    this.dragIds = ids && ids.size > 0 ? ids : null;
    this.dragTarget = target;
  }

  /** `true` se algum desenho do grupo de arrasto mudou desde a última chamada (e zera). */
  takeDragChanged(): boolean {
    const changed = this.dragChanged;
    this.dragChanged = false;
    return changed;
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

    const usedMirrors = new Set<string | null>();
    for (const [containerId, list] of wanted) {
      const placement = placementOf(placements, containerId);
      if (!placement) continue;
      const { group, created } = this.groupOf(containerId);
      if (created) changed = true;
      if (placeGroup(group, placement)) changed = true;
      const moving = this.dragIds
        ? list.filter((d) => this.dragIds?.has(d.markingId))
        : [];
      const mirror = moving.length > 0 ? this.mirrorOf(containerId, placement) : null;
      if (mirror) usedMirrors.add(containerId);
      for (const drawing of list) {
        const home = this.dragIds?.has(drawing.markingId) && mirror ? mirror : group;
        const touched = this.place(drawing, home, group);
        if ((touched & TOUCHED_GROUP) !== 0) changed = true;
        if ((touched & TOUCHED_MIRROR) !== 0) this.dragChanged = true;
      }
      for (const drawing of list) {
        const entry = this.mounted.get(drawing.markingId);
        if (entry && placeScreen(entry.node, drawing, placement.scale, zoom)) {
          if (this.inMirror(entry.node)) this.dragChanged = true;
          else changed = true;
        }
      }
      const rest = moving.length > 0 ? list.filter((d) => !moving.includes(d)) : list;
      if (sortChildren(group, rest, this.mounted)) changed = true;
      if (mirror && sortChildren(mirror, moving, this.mounted)) this.dragChanged = true;
    }
    if (this.dropMirrors(usedMirrors)) this.dragChanged = true;
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
        if (this.inMirror(entry.node)) this.dragChanged = true;
        else changed = true;
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
      if (parent && this.isMirror(parent)) this.dragChanged = true;
      else changed = true;
    }
    return changed;
  }

  /** Destrói tudo o que o renderer criou (o grupo recebido fica a cargo de quem o criou). */
  destroy(): void {
    for (const group of this.imageGroups.values()) group.destroy();
    for (const mirror of this.mirrors.values()) mirror.destroy();
    this.imageGroups.clear();
    this.mirrors.clear();
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

  /** O grupo do container no grupo de arrasto, com a posição e a escala do grupo da imagem. */
  private mirrorOf(containerId: string | null, placement: Placement): Konva.Group {
    let mirror = this.mirrors.get(containerId);
    if (!mirror) {
      mirror = new Konva.Group({ listening: false, name: 'component-layer-drag' });
      this.dragTarget?.add(mirror);
      this.mirrors.set(containerId, mirror);
      this.dragChanged = true;
    }
    if (placeGroup(mirror, placement)) this.dragChanged = true;
    return mirror;
  }

  /** Destrói os grupos de arrasto dos containers que não têm mais desenho se movendo. */
  private dropMirrors(used: ReadonlySet<string | null>): boolean {
    let dropped = false;
    for (const [containerId, mirror] of this.mirrors) {
      if (used.has(containerId)) continue;
      mirror.destroy();
      this.mirrors.delete(containerId);
      dropped = true;
    }
    return dropped;
  }

  private isMirror(parent: Konva.Container): boolean {
    for (const mirror of this.mirrors.values()) if (mirror === parent) return true;
    return false;
  }

  private inMirror(node: Konva.Node): boolean {
    const parent = node.getParent();
    return parent !== null && this.isMirror(parent);
  }

  /**
   * Põe o desenho de `drawing` em `home` (o grupo da imagem ou o do arrasto): o nó que já existe e
   * está certo só muda de grupo (`moveTo`, o mesmo nó); o de objeto novo é refeito. Devolve em que
   * grupo mexeu (`TOUCHED_*`), para o quadro redesenhar a camada certa.
   */
  private place(drawing: LayerDrawing, home: Konva.Group, group: Konva.Group): number {
    const current = this.mounted.get(drawing.markingId);
    const parent = current?.node.getParent() ?? null;
    const into = this.touchedBy(home, group);
    const reused = current ? this.reuse(current, drawing, home, group) : null;
    if (reused !== null) return reused;
    current?.node.destroy();
    const { node, imageUrls, images } = this.draw(drawing);
    home.add(node);
    this.mounted.set(drawing.markingId, { drawing, node, imageUrls, images });
    return parent === null ? into : this.touchedBy(parent, group) | into;
  }

  /**
   * O nó montado serve se é do mesmo objeto de desenho e está num dos grupos deste renderizador:
   * só muda de grupo. `null` se precisa ser refeito.
   */
  private reuse(
    current: Mounted,
    drawing: LayerDrawing,
    home: Konva.Group,
    group: Konva.Group,
  ): number | null {
    const parent = current.node.getParent();
    if (current.drawing !== drawing || parent === null) return null;
    if (parent === home) return 0;
    if (parent !== group && !this.isMirror(parent)) return null;
    current.node.moveTo(home);
    return this.touchedBy(parent, group) | this.touchedBy(home, group);
  }

  private touchedBy(parent: Konva.Container, group: Konva.Group): number {
    return parent === group ? TOUCHED_GROUP : TOUCHED_MIRROR;
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
