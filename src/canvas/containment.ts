// Interação do pertencimento por geometria (etapa Marcações espaciais, ME1): o encaixe de uma
// marcação movida num container e a absorção de quem fica quase dentro de uma marcação
// desenhada ou redimensionada. O modelo só conhece "dentro = totalmente contido"; a tolerância
// vive aqui, na interação, com um limiar único e sem opção para a pessoa (PLAN.md, "Absorção").
// Funções puras, sem DOM nem Konva, testadas em `tests/canvas/containment.test.ts`.
import {
  bottom,
  containsRect,
  containsRectApprox,
  imageCanvasRect,
  rectsOverlap,
  right,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../model';

/**
 * Quanto uma parte de fora pode medir (px de tela) para ainda contar como "dentro": o encaixe
 * de uma marcação solta quase inteira num container e a absorção de um item que cruza a
 * marcação desenhada ou redimensionada. Convertida pelo zoom e pela escala do container no
 * momento de soltar (`spaceTolerance`). Sem opção para a pessoa. A ordem de `TAP_REPEAT_DISTANCE`.
 */
export const ABSORB_TOLERANCE = 12;

/** Folga de ponto flutuante ao arredondar para fora (coordenadas do canvas, decimais). */
const SLACK = 1e-6;

/** A tolerância em px de tela, em unidades do espaço (pixels do container ou do canvas). */
export function spaceTolerance(zoom: number, scale: number): number {
  return ABSORB_TOLERANCE / (zoom * scale);
}

// ---------------------------------------------------------------------------
// Encaixe

/** Onde a marcação movida vai ficar e quanto deslocar para ela caber nesse container. */
export interface SnapTarget {
  /** Container que vai ter a marcação (a contém ou a recebe pelo encaixe). */
  readonly containerId: string;
  /** Deslocamento extra, inteiro, no espaço de origem da marcação (zero se já está dentro). */
  readonly dx: number;
  readonly dy: number;
}

/**
 * Container que fica com a marcação ao soltar, e o deslocamento que a leva para dentro dele.
 * `canvas`: o retângulo dela em unidades do canvas, já com o deslocamento do ponteiro; `from`:
 * posição do espaço em que o `rect` está (container de origem ou identidade, onde o deslocamento
 * é medido); `tolerance`: `ABSORB_TOLERANCE` em unidades do canvas (px de tela / zoom).
 *
 * - Inteira dentro de um container: ele, sem deslocamento.
 * - Quase inteira (a parte de fora não passa de `tolerance` em nenhum lado) e cabendo nele: o
 *   deslocamento a leva para dentro. O deslocamento é calculado em unidades do canvas e
 *   convertido de volta ao espaço de origem arredondando **para dentro** (`ceil` a quem precisa
 *   ir para a direita/baixo, `floor` à esquerda/cima); se mesmo assim não ficar dentro (marcação
 *   quase do tamanho do container), não encaixa.
 * - Maior que o container, ou longe: nada.
 *
 * Com mais de um candidato (containers lado a lado), vence o de menor deslocamento.
 */
export function snapTarget(
  canvas: Rect,
  from: Placement,
  containers: readonly ProjectContainer[],
  tolerance: number,
): SnapTarget | null {
  let best: (SnapTarget & { readonly cost: number }) | null = null;
  for (const c of containers) {
    const box = imageCanvasRect(c, c.placement);
    if (containsRectApprox(box, canvas)) return { containerId: c.id, dx: 0, dy: 0 };
    if (canvas.width > box.width + SLACK || canvas.height > box.height + SLACK) continue;
    const outLeft = box.x - canvas.x;
    const outRight = right(canvas) - right(box);
    const outTop = box.y - canvas.y;
    const outBottom = bottom(canvas) - bottom(box);
    if (Math.max(outLeft, outRight, outTop, outBottom) > tolerance) continue;
    // Quanto deslocar (canvas) por eixo: para a direita se passa à esquerda, e vice-versa.
    const shiftX = outLeft > 0 ? outLeft : outRight > 0 ? -outRight : 0;
    const shiftY = outTop > 0 ? outTop : outBottom > 0 ? -outBottom : 0;
    const dx = toSpaceInside(shiftX, from.scale);
    const dy = toSpaceInside(shiftY, from.scale);
    const moved: Rect = {
      x: canvas.x + dx * from.scale,
      y: canvas.y + dy * from.scale,
      width: canvas.width,
      height: canvas.height,
    };
    if (!containsRectApprox(box, moved)) continue;
    const cost = Math.abs(dx) + Math.abs(dy);
    if (best === null || cost < best.cost) {
      best = { containerId: c.id, dx, dy, cost };
    }
  }
  return best && { containerId: best.containerId, dx: best.dx, dy: best.dy };
}

/** Deslocamento do canvas em unidades inteiras do espaço, arredondado para o lado que entra. */
function toSpaceInside(canvasShift: number, scale: number): number {
  const value = canvasShift / scale;
  return value > 0 ? Math.ceil(value - SLACK) : Math.floor(value + SLACK);
}

// ---------------------------------------------------------------------------
// Absorção

/** Item que uma marcação pode absorver: marcação do espaço ou, no canvas, um container. */
export interface AbsorbCandidate {
  readonly kind: 'marking' | 'container';
  readonly id: string;
  /** No espaço da marcação (pixels do container ou unidades do canvas). */
  readonly rect: Rect;
}

export interface Absorption {
  /** O retângulo depois de crescer para envolver o que absorveu (inteiro). */
  readonly rect: Rect;
  /** O que foi absorvido, na ordem (do menor excesso ao maior). */
  readonly absorbed: readonly AbsorbCandidate[];
}

/**
 * Itens que a marcação de um espaço pode absorver: as marcações do mesmo espaço (menos as
 * flutuantes e as de `exclude`: ela mesma e os ancestrais) e, no canvas (`containerId` nulo),
 * também os containers (retângulo no canvas). Os que já contêm o retângulo ficam de fora em
 * `absorbInto`, que os vê no momento.
 */
export function absorbCandidates(
  project: Project,
  containerId: string | null,
  exclude: ReadonlySet<string>,
): AbsorbCandidate[] {
  const out: AbsorbCandidate[] = [];
  for (const m of project.markings) {
    if (m.containerId !== containerId || m.floating || exclude.has(m.id)) continue;
    out.push({ kind: 'marking', id: m.id, rect: m.rect });
  }
  if (containerId === null) {
    for (const c of project.containers) {
      out.push({ kind: 'container', id: c.id, rect: imageCanvasRect(c, c.placement) });
    }
  }
  return out;
}

/** Quanto do item passa de cada lado da marcação (zero quando não passa). */
function overflowOf(rect: Rect, item: Rect) {
  return {
    left: Math.max(0, rect.x - item.x),
    right: Math.max(0, right(item) - right(rect)),
    top: Math.max(0, rect.y - item.y),
    bottom: Math.max(0, bottom(item) - bottom(rect)),
  };
}

/** O retângulo que envolve `rect` e `item`, em inteiros: `floor` à esquerda/em cima, `ceil` à direita/embaixo. */
function growToCover(rect: Rect, item: Rect): Rect {
  const x0 = Math.floor(Math.min(rect.x, item.x) + SLACK);
  const y0 = Math.floor(Math.min(rect.y, item.y) + SLACK);
  const x1 = Math.ceil(Math.max(right(rect), right(item)) - SLACK);
  const y1 = Math.ceil(Math.max(bottom(rect), bottom(item)) - SLACK);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Absorção: os itens que **cruzam** `rect` sem estar inteiros dentro nem conter o retângulo, e
 * cuja parte de fora não passa de `tolerance` (unidades do espaço) em nenhum lado, são
 * envolvidos: o retângulo cresce até cobri-los. Um a um, do menor excesso ao maior (o excesso
 * é o maior lado de fora; depois, a soma), reavaliando a cada crescimento. Com `limit` (o
 * container, numa marcação de container) o crescimento não sai dele: o item que não cabe não é
 * absorvido. Quem chama tira os ancestrais e as flutuantes de `candidates`; um item que **contém**
 * o retângulo (um pai possível) nunca é absorvido, nem no empate. Nunca falha.
 */
export function absorbInto(
  rect: Rect,
  candidates: readonly AbsorbCandidate[],
  tolerance: number,
  limit: Rect | null,
): Absorption {
  let current = rect;
  const absorbed: AbsorbCandidate[] = [];
  const remaining = [...candidates];
  for (;;) {
    let best: {
      readonly index: number;
      readonly excess: number;
      readonly sum: number;
      readonly grown: Rect;
    } | null = null;
    for (const [index, candidate] of remaining.entries()) {
      const item = candidate.rect;
      if (containsRectApprox(item, current) || containsRectApprox(current, item))
        continue;
      if (!rectsOverlap(current, item)) continue;
      const o = overflowOf(current, item);
      const excess = Math.max(o.left, o.right, o.top, o.bottom);
      if (excess > tolerance) continue;
      const grown = growToCover(current, item);
      if (limit !== null && !containsRect(limit, grown)) continue;
      const sum = o.left + o.right + o.top + o.bottom;
      if (
        best === null ||
        excess < best.excess ||
        (excess === best.excess && sum < best.sum)
      ) {
        best = { index, excess, sum, grown };
      }
    }
    if (best === null) break;
    current = best.grown;
    absorbed.push(remaining[best.index] as AbsorbCandidate);
    remaining.splice(best.index, 1);
  }
  return { rect: current, absorbed };
}
