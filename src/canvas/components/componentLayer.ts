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
  /**
   * Filha de um slot com `clip` (v4): a caixa do slot da mãe, no espaço de `root.transform`. O
   * desenho só aparece dentro dela. O desenho em pixels de tela ignora o recorte.
   */
  readonly clip?: Rect;
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
  /** Os espaços do último `render`, com todos os desenhos que aparecem (montados ou ainda por montar). */
  private readonly spaces = new Map<
    string | null,
    { list: readonly LayerDrawing[]; placement: Placement }
  >();

  constructor(
    private readonly parent: Parent,
    private readonly options: ComponentLayerOptions = {},
  ) {}

  /**
   * Quantos desenhos aparecem no último quadro, montados ou não (publicado no container para os
   * testes e2e e os roteiros: não depende de onde está a vista).
   */
  get size(): number {
    let total = 0;
    for (const { list } of this.spaces.values()) total += list.length;
    return total;
  }

  /** Quantos desenhos estão montados de fato (`renderScene`): só os que já estiveram na tela. */
  get mountedCount(): number {
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
    area: Rect | null = null,
  ): boolean {
    this.zoom = zoom;
    this.placements = placements;
    this.spaces.clear();
    const wanted = wantedBySpace(drawings, visible, placements);
    let changed = this.prune(wanted);
    const usedMirrors = new Set<string | null>();
    for (const [containerId, list] of wanted) {
      const placement = placementOf(placements, containerId);
      if (!placement) continue;
      if (this.renderSpace(containerId, list, placement, area, usedMirrors))
        changed = true;
    }
    if (this.dropMirrors(usedMirrors)) this.dragChanged = true;
    return changed;
  }

  /** Some o que não está mais na lista (ou trocou de imagem); `true` se destruiu algo. */
  private prune(wanted: ReadonlyMap<string | null, readonly LayerDrawing[]>): boolean {
    let changed = false;
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
    return changed;
  }

  /**
   * Um espaço (container ou canvas): põe os desenhos de `list` no grupo dele. Sob demanda (decisão 3
   * da etapa canvas-desempenho): o desenho ainda não montado só nasce quando a caixa dele cruza
   * `area` (a parte visível do canvas; `null` = tudo); montado, fica, e só se esconde fora da área.
   */
  private renderSpace(
    containerId: string | null,
    list: readonly LayerDrawing[],
    placement: Placement,
    area: Rect | null,
    usedMirrors: Set<string | null>,
  ): boolean {
    const { group, created } = this.groupOf(containerId);
    let changed = created;
    if (placeGroup(group, placement)) changed = true;
    this.spaces.set(containerId, { list, placement });
    const moving = this.movingOf(list);
    const mirror = moving.length > 0 ? this.mirrorOf(containerId, placement) : null;
    if (mirror) usedMirrors.add(containerId);
    const present: LayerDrawing[] = [];
    for (const drawing of list) {
      const dragged = mirror !== null && this.isDragged(drawing);
      const on = dragged || onScreen(drawing, placement, this.zoom, area);
      if (!on && !this.mounted.has(drawing.markingId)) continue;
      present.push(drawing);
      const home = dragged && mirror ? mirror : group;
      if (this.mountOne(drawing, home, group, placement, on)) changed = true;
    }
    const rest = present.filter((d) => !moving.includes(d));
    if (sortChildren(group, rest, this.mounted)) changed = true;
    if (
      mirror &&
      sortChildren(
        mirror,
        present.filter((d) => moving.includes(d)),
        this.mounted,
      )
    ) {
      this.dragChanged = true;
    }
    return changed;
  }

  private isDragged(drawing: LayerDrawing): boolean {
    return this.dragIds !== null && this.dragIds.has(drawing.markingId);
  }

  private movingOf(list: readonly LayerDrawing[]): LayerDrawing[] {
    return this.dragIds === null ? [] : list.filter((d) => this.isDragged(d));
  }

  /**
   * Monta (ou reaproveita) o desenho em `home`, ajusta a posição em pixels de tela e a visibilidade.
   * Devolve `true` se mexeu na camada de sempre (o que mexe no grupo de arrasto vai em `dragChanged`).
   */
  private mountOne(
    drawing: LayerDrawing,
    home: Konva.Group,
    group: Konva.Group,
    placement: Placement,
    on: boolean,
  ): boolean {
    const touched = this.place(drawing, home, group);
    if ((touched & TOUCHED_MIRROR) !== 0) this.dragChanged = true;
    let changed = (touched & TOUCHED_GROUP) !== 0;
    const entry = this.mounted.get(drawing.markingId);
    if (!entry) return changed;
    const moved =
      placeScreen(entry.node, drawing, placement.scale, this.zoom) ||
      showNode(entry.node, on);
    if (moved && this.inMirror(entry.node)) this.dragChanged = true;
    else if (moved) changed = true;
    return changed;
  }

  /**
   * Pan ou zoom: monta o desenho que passou a cruzar a tela e esconde o montado que saiu dela
   * (nada é redesenhado nem reinstanciado). `area` é a parte visível do canvas e `zoom` a escala do
   * stage. Devolve `true` se algum nó mudou.
   */
  reveal(area: Rect | null, zoom: number): boolean {
    let changed = false;
    for (const [containerId, space] of this.spaces) {
      if (this.revealSpace(containerId, space, area, zoom)) changed = true;
    }
    return changed;
  }

  private revealSpace(
    containerId: string | null,
    { list, placement }: { list: readonly LayerDrawing[]; placement: Placement },
    area: Rect | null,
    zoom: number,
  ): boolean {
    const group = this.imageGroups.get(containerId);
    if (!group) return false;
    let changed = false;
    let mountedNow = false;
    for (const drawing of list) {
      if (this.isDragged(drawing)) continue;
      const on = onScreen(drawing, placement, zoom, area);
      const entry = this.mounted.get(drawing.markingId);
      if (entry) {
        if (showNode(entry.node, on)) changed = true;
      } else if (on) {
        this.mountOne(drawing, group, group, placement, true);
        mountedNow = true;
        changed = true;
      }
    }
    if (mountedNow) {
      const present = list.filter(
        (d) => !this.isDragged(d) && this.mounted.has(d.markingId),
      );
      sortChildren(group, present, this.mounted);
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
    const node = drawing.clip && !drawing.screen ? clipped(root, drawing.clip) : root;
    node.setAttr('markingId', drawing.markingId);
    return { node, imageUrls, images: root.find('Image').length };
  }
}

/**
 * Envolve a cena num grupo (sem transformação, no espaço do container) recortado pela caixa do
 * slot: a matriz do `root` não entra na conta, o recorte vale no espaço onde `clip` foi medido.
 */
function clipped(root: Konva.Group, { x, y, width, height }: Rect): Konva.Group {
  const wrapper = new Konva.Group({ listening: false, name: root.name() });
  wrapper.clipFunc((ctx) => {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.closePath();
  });
  wrapper.add(root);
  return wrapper;
}

/** Os desenhos que aparecem, por espaço, na ordem de desenho (só os que têm posição). */
function wantedBySpace(
  drawings: ReadonlyMap<string, LayerDrawing>,
  visible: (drawing: LayerDrawing) => boolean,
  placements: ReadonlyMap<string, Placement>,
): Map<string | null, LayerDrawing[]> {
  const wanted = new Map<string | null, LayerDrawing[]>();
  for (const drawing of drawings.values()) {
    if (placementOf(placements, drawing.containerId) === undefined || !visible(drawing)) {
      continue;
    }
    const list = wanted.get(drawing.containerId);
    if (list) list.push(drawing);
    else wanted.set(drawing.containerId, [drawing]);
  }
  return wanted;
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

/** Margem (px de tela) em volta da caixa do desenho: sombra, traço e o que passa da caixa. */
const ON_SCREEN_MARGIN = 64;

/**
 * A caixa do desenho cruza a parte visível do canvas? Só para decidir se o desenho nasce e se
 * aparece; `area` `null` = tudo à vista. A caixa vem da própria cena (matriz e medida do `root`) ou,
 * no desenho em pixels de tela, da âncora no retângulo da marcação.
 */
function onScreen(
  drawing: LayerDrawing,
  placement: Placement,
  zoom: number,
  area: Rect | null,
): boolean {
  if (area === null) return true;
  const { root, screen } = drawing;
  let box: Rect;
  if (screen) {
    const k = 1 / (zoom * placement.scale);
    const [fx, fy] = ANCHOR_FRACTION[screen.anchor];
    const width = root.width * k;
    const height = root.height * k;
    box = {
      x: screen.rect.x + fx * (screen.rect.width - width),
      y: screen.rect.y + fy * (screen.rect.height - height),
      width,
      height,
    };
  } else {
    const visible = cachedVisibleBox(drawing);
    // Filha toda fora da caixa do slot: não há nada para mostrar.
    if (visible === null) return false;
    box = visible;
  }
  const margin = ON_SCREEN_MARGIN / zoom;
  const x = placement.x + box.x * placement.scale;
  const y = placement.y + box.y * placement.scale;
  return (
    x + box.width * placement.scale + margin > area.x &&
    x - margin < area.x + area.width &&
    y + box.height * placement.scale + margin > area.y &&
    y - margin < area.y + area.height
  );
}

/** Caixa visível do desenho: a da cena, reduzida pelo `clip` da filha de um slot (se tiver). */
const visibleBoxes = new WeakMap<LayerDrawing, Rect | null>();

function cachedVisibleBox(drawing: LayerDrawing): Rect | null {
  const scene = cachedSceneBox(drawing.root);
  if (!drawing.clip) return scene;
  let box = visibleBoxes.get(drawing);
  if (box === undefined) {
    box = intersectRects(scene, drawing.clip);
    visibleBoxes.set(drawing, box);
  }
  return box;
}

/** Interseção de dois retângulos; `null` se não se tocam (encostar ainda conta). */
function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right < x || bottom < y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** A caixa só depende da cena (dado do projeto): pan e zoom não a recalculam. */
const sceneBoxes = new WeakMap<FrameNode, Rect>();

function cachedSceneBox(root: FrameNode): Rect {
  let box = sceneBoxes.get(root);
  if (!box) {
    box = sceneBox(root);
    sceneBoxes.set(root, box);
  }
  return box;
}

/** Caixa (espaço da marcação) de uma cena com matriz `[a, b, c, d, e, f]` e medida `width × height`. */
function sceneBox({ transform, width, height }: FrameNode): Rect {
  const [a, b, c, d, e, f] = transform;
  const xs = [e, a * width + e, c * height + e, a * width + c * height + e];
  const ys = [f, b * width + f, d * height + f, b * width + d * height + f];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Esconde ou mostra o nó; `true` se mudou. */
function showNode(node: Konva.Group, show: boolean): boolean {
  if (node.visible() === show) return false;
  node.visible(show);
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
