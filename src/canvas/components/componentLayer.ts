// A camada de componentes do canvas: o desenho de cada marcação que tem componente.
// Konva imperativo (como os outros renderers de `src/canvas/`); o desenho em si vem pronto
// do modelo (cena instanciada na caixa da marcação, em pixels da imagem).
import Konva from 'konva/lib/Core';
import type { Placement } from '../../model';
import type { FrameNode } from '../../model/components/scene';
import { type RenderPalette, renderScene } from './renderScene';

/** O que o renderer desenha de cada marcação (o `ComponentDrawing` do modelo tem esta forma). */
export interface LayerDrawing {
  readonly markingId: string;
  readonly containerId: string;
  /** Cena instanciada no retângulo da marcação, em pixels da imagem. */
  readonly root: FrameNode;
}

export interface ComponentLayerOptions {
  /** Cores do reservado de imagem e do nó desconhecido (vêm dos tokens do tema). */
  readonly placeholder?: Partial<RenderPalette>;
  /** Uma imagem embutida (`data:`) terminou de carregar: o chamador pede um quadro. */
  readonly onImageLoaded?: () => void;
}

interface Mounted {
  readonly drawing: LayerDrawing;
  readonly node: Konva.Group;
}

type Parent = Konva.Group | Konva.Layer;

/**
 * Desenha os desenhos de componentes dentro de um grupo (ou camada) do Konva. Cada imagem tem
 * um grupo próprio, posicionado pelo `placement` dela (pixels da imagem → canvas); dentro dele,
 * um nó por marcação. Não ouve eventos (`listening: false`) e não recorta o conteúdo.
 */
export class ComponentLayerRenderer {
  private readonly imageGroups = new Map<string, Konva.Group>();
  private readonly mounted = new Map<string, Mounted>();

  constructor(
    private readonly parent: Parent,
    private readonly options: ComponentLayerOptions = {},
  ) {}

  /** Quantos desenhos estão montados (publicado no container para os testes e2e). */
  get size(): number {
    return this.mounted.size;
  }

  /**
   * Desenha os desenhos de `drawings` (a ordem do Map é a ordem de desenho, de baixo para cima)
   * que passam em `visible` e cuja imagem tem `placement`. Diff por identidade: só o desenho
   * cujo objeto mudou é refeito (`renderScene`); o que sumiu é destruído; a ordem é refeita só
   * quando muda. Devolve `true` se algo mudou (criado, refeito, removido, movido ou reordenado).
   */
  render(
    drawings: ReadonlyMap<string, LayerDrawing>,
    visible: (drawing: LayerDrawing) => boolean,
    placements: ReadonlyMap<string, Placement>,
  ): boolean {
    let changed = false;
    // Ordem de desenho por imagem, só do que aparece.
    const wanted = new Map<string, LayerDrawing[]>();
    for (const drawing of drawings.values()) {
      if (!placements.has(drawing.containerId) || !visible(drawing)) continue;
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
      const placement = placements.get(containerId);
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
        const node = this.draw(drawing);
        group.add(node);
        this.mounted.set(drawing.markingId, { drawing, node });
        changed = true;
      }
      if (sortChildren(group, list, this.mounted)) changed = true;
    }
    return changed;
  }

  /** Destrói tudo o que o renderer criou (o grupo recebido fica a cargo de quem o criou). */
  destroy(): void {
    for (const group of this.imageGroups.values()) group.destroy();
    this.imageGroups.clear();
    this.mounted.clear();
  }

  private groupOf(containerId: string): { group: Konva.Group; created: boolean } {
    const existing = this.imageGroups.get(containerId);
    if (existing) return { group: existing, created: false };
    const group = new Konva.Group({ listening: false, name: 'component-layer-image' });
    group.setAttr('containerId', containerId);
    this.parent.add(group);
    this.imageGroups.set(containerId, group);
    return { group, created: true };
  }

  private draw(drawing: LayerDrawing): Konva.Group {
    const { root } = renderScene(
      { root: drawing.root, warnings: [] },
      {
        palette: this.options.placeholder,
        showSlots: false,
        onImageLoaded: this.options.onImageLoaded,
      },
    );
    root.listening(false);
    root.setAttr('markingId', drawing.markingId);
    return root;
  }
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
