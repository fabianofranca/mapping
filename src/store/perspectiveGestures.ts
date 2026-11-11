import * as model from '../model';
import type {
  ItemRef,
  Marking,
  Perspective,
  Placement,
  Project,
  ProjectContainer,
  Rect,
  RectOptions,
  RootMove,
  SettleOptions,
} from '../model';
import type { ArrivalInfo } from './perspectives';

// As actions do projeto com uma perspectiva aberta (etapa #659, PE2, decisão 5). O canvas desenha
// `perspectiveView(project, perspective)` e chama as MESMAS actions com coordenadas DA VISTA; aqui
// elas viram o que muda de fato: arrastar uma raiz muda só a posição dela na perspectiva (só
// `perspectives[].items`), o que está dentro de um container segue a geometria de sempre, e o que
// decide pertencimento (desenhar no canvas, rota de seta, arrumar, excluir raiz) só vale na
// Principal. Convenção das funções `…InView`: devolvem `null` quando a perspectiva é `null` (a
// Principal) ou quando vale a regra de sempre do modelo; quem chama cai na operação do modelo.

/** Comando recusado fora da Principal; `project.ts` o devolve como o código `principal-only`. */
export class PrincipalOnlyError extends Error {
  constructor() {
    super('principal-only');
    this.name = 'PrincipalOnlyError';
  }
}

function refusePrincipalOnly(): never {
  throw new PrincipalOnlyError();
}

/** Recusa (`principal-only`) o comando de rota de seta e de arrumar numa perspectiva. */
export function requirePrincipal(perspective: Perspective | null): void {
  if (perspective !== null) refusePrincipalOnly();
}

/** Recusa (`principal-only`) a exclusão de uma raiz numa perspectiva; as demais seguem. */
export function refuseRootDeletion(
  p: Project,
  perspective: Perspective | null,
  ids: readonly string[],
): void {
  if (perspective !== null && ids.some((id) => model.isRootId(p, id))) {
    refusePrincipalOnly();
  }
}

export type PrincipalOnlyCommand = 'draw-canvas' | 'arrow-route' | 'arrange' | 'delete';

/**
 * A interface desabilita o comando com a dica "só na Principal"? `true` quando há uma
 * perspectiva aberta em `p` e o comando só vale fora dela: desenhar marcação do canvas que não é
 * flutuante (`draw-canvas`), editar a rota de uma seta (`arrow-route`), arrumar (`arrange`) e
 * excluir uma raiz (`delete`, com os ids em `targets`: basta um ser raiz).
 */
export function principalOnly(
  p: Project,
  perspectiveId: string | null,
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  const open = perspectiveId === null ? undefined : findPerspective(p, perspectiveId);
  if (!open) return false;
  return command === 'delete' ? targets.some((id) => model.isRootId(p, id)) : true;
}

function findPerspective(p: Project, id: string): Perspective | undefined {
  return p.perspectives.find((x) => x.id === id);
}

function perspectiveIn(p: Project, id: string): Perspective {
  return findPerspective(p, id) ?? model.fail('not-found', id);
}

// ---------------------------------------------------------------------------
// Mover raízes na perspectiva

/**
 * Confere que os containers das raízes movidas não sobrepõem outros containers da vista (a vista
 * só tem os containers das raízes da perspectiva): `image-overlap`, como na Principal.
 */
function assertNoViewOverlap(
  p: Project,
  perspectiveId: string,
  roots: readonly string[],
): void {
  const members = model.projectIndex(p).rootMembers;
  const moved = new Set<string>();
  for (const root of roots) {
    for (const c of members.get(root)?.containers ?? []) moved.add(c.id);
  }
  if (moved.size === 0) return;
  const view = model.perspectiveView(p, perspectiveIn(p, perspectiveId));
  const footprints = view.containers.map((c) => ({
    container: c,
    rect: model.imageCanvasRect(c, c.placement),
  }));
  const fixed = footprints.filter((f) => !moved.has(f.container.id));
  for (const m of footprints) {
    if (!moved.has(m.container.id)) continue;
    const other = fixed.find((f) => model.rectsOverlap(m.rect, f.rect));
    if (other)
      model.fail('image-overlap', undefined, { containerId: other.container.id });
  }
}

/**
 * O deslocamento `dx`, `dy` das `roots` na vista, reduzido ao maior sem sobrepor um container da
 * vista que não anda (eixo a eixo: encosta e desliza). Com raiz que é marcação do canvas o
 * deslocamento é inteiro, como em `moveRootsInPerspective`. Deslocamento que cabe volta igual.
 */
function touchingViewDelta(
  p: Project,
  perspective: Perspective,
  roots: readonly string[],
  dx: number,
  dy: number,
): { readonly dx: number; readonly dy: number } {
  const members = model.projectIndex(p).rootMembers;
  const moved = new Set<string>();
  for (const root of roots) {
    for (const c of members.get(root)?.containers ?? []) moved.add(c.id);
  }
  const whole = roots.some((root) => model.isMarkingRoot(p, root));
  const shown = model.perspectiveView(p, perspective).containers;
  const footprint = (c: ProjectContainer) => model.imageCanvasRect(c, c.placement);
  return model.touchDelta(
    shown.filter((c) => moved.has(c.id)).map(footprint),
    shown.filter((c) => !moved.has(c.id)).map(footprint),
    dx,
    dy,
    whole,
  );
}

/** Anda as raízes na perspectiva (`moveRootsInPerspective`) e confere a sobreposição na vista. */
function moveRootsChecked(
  p: Project,
  perspectiveId: string,
  moves: readonly RootMove[],
): Project {
  const next = model.moveRootsInPerspective(p, perspectiveId, moves);
  if (next !== p)
    assertNoViewOverlap(
      next,
      perspectiveId,
      moves.map((m) => m.root),
    );
  return next;
}

/** A raiz de um container ou marcação (`not-found` se o id não existe). */
function rootOrFail(p: Project, id: string): string {
  return model.perspectiveRootOf(p, id) ?? model.fail('not-found', id);
}

/** Anda a raiz do item pelo deslocamento (inteiro se a raiz é uma marcação). */
function moveRootOf(
  p: Project,
  perspective: Perspective,
  id: string,
  dx: number,
  dy: number,
): Project {
  const root = rootOrFail(p, id);
  const whole = model.isMarkingRoot(p, root);
  const rdx = whole ? Math.round(dx) : dx;
  const rdy = whole ? Math.round(dy) : dy;
  if (rdx === 0 && rdy === 0) return p;
  return moveRootsChecked(p, perspective.id, [{ root, dx: rdx, dy: rdy }]);
}

function containerOrFail(p: Project, id: string): ProjectContainer {
  return model.projectIndex(p).containers.get(id) ?? model.fail('not-found', id);
}

function markingOrFail(p: Project, id: string): Marking {
  return model.projectIndex(p).markings.get(id) ?? model.fail('not-found', id);
}

// ---------------------------------------------------------------------------
// Container

/** A posição do container na vista (o que o canvas mostra), ou `undefined` se não está nela. */
export function viewPlacement(
  p: Project,
  perspectiveId: string,
  containerId: string,
): Placement | undefined {
  const perspective = findPerspective(p, perspectiveId);
  if (!perspective) return undefined;
  return model
    .projectIndex(model.perspectiveView(p, perspective))
    .containers.get(containerId)?.placement;
}

/**
 * Mover ou redimensionar o container com `placement` DA VISTA. Mover (mesma escala) anda a raiz
 * do container na perspectiva: o projeto não muda, e dentro de uma marcação do canvas arrasta a
 * raiz inteira. Mudar a escala é geometria: a raiz recebe só a escala (o x/y da Principal ficam) e
 * a posição pedida vai para o item dela; o container que não é raiz recebe a posição da
 * Principal que corresponde à pedida. A trava e a sobreposição na vista valem como na Principal.
 */
export function placementInView(
  p: Project,
  perspective: Perspective | null,
  containerId: string,
  placement: Placement,
  options: SettleOptions,
): Project | null {
  if (perspective === null) return null;
  const own = containerOrFail(p, containerId);
  const shown =
    viewPlacement(p, perspective.id, containerId) ?? model.fail('not-found', containerId);
  model.requireUnlocked(model.canEditImagePlacement(p, containerId));
  const isRoot = model.isRootId(p, containerId);
  const rescaled = placement.scale !== own.placement.scale;
  // Mover (mesma escala) encosta no container da vista que o ponteiro atravessaria.
  const wanted = { dx: placement.x - shown.x, dy: placement.y - shown.y };
  const { dx, dy } = rescaled
    ? wanted
    : touchingViewDelta(
        p,
        perspective,
        [rootOrFail(p, containerId)],
        wanted.dx,
        wanted.dy,
      );
  let next = p;
  if (rescaled) {
    const base = isRoot
      ? own.placement
      : {
          ...own.placement,
          x: model.snapCoordinate(placement.x - (shown.x - own.placement.x)),
          y: model.snapCoordinate(placement.y - (shown.y - own.placement.y)),
        };
    next = model.setContainerPlacement(
      p,
      containerId,
      { ...base, scale: placement.scale },
      options,
    );
  }
  if (isRoot || !rescaled) {
    // `moveRootOf` já confere a sobreposição quando anda; só o que não andou confere aqui.
    const moved = moveRootOf(next, perspective, containerId, dx, dy);
    if (moved !== next) return moved;
  }
  if (next !== p)
    assertNoViewOverlap(next, perspective.id, [rootOrFail(next, containerId)]);
  return next;
}

// ---------------------------------------------------------------------------
// Marcação do canvas

/** O retângulo da marcação como o canvas o mostra (da vista, se há perspectiva). */
export function shownRect(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
): Rect | undefined {
  const index = model.projectIndex(
    perspective === null ? p : model.perspectiveView(p, perspective),
  );
  return (index.markings.get(markingId) ?? model.projectIndex(p).markings.get(markingId))
    ?.rect;
}

/**
 * Mover a marcação do canvas (flutuante inclusive) pelo deslocamento inteiro `dx`, `dy`: anda a
 * raiz dela na perspectiva (a marcação filha de outra arrasta a raiz inteira). Marcação de
 * container: `null` (a regra de sempre).
 */
export function markingMoveInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  dx: number,
  dy: number,
): Project | null {
  if (perspective === null) return null;
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) model.fail('rect-not-integer');
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  if (dx === 0 && dy === 0) return p;
  model.requireUnlocked(model.canEditMarkingGeometry(p, markingId));
  return moveRootOf(p, perspective, markingId, dx, dy);
}

/**
 * Mudar o retângulo (DA VISTA) da marcação do canvas. A flutuante é raiz: o tamanho vai ao
 * projeto (o x/y da Principal ficam) e a posição pedida ao item da perspectiva. A que não é
 * flutuante decide pertencimento, então só se redimensiona na Principal (`principal-only`;
 * decisão do coordenador). Marcação de container: `null`.
 */
export function markingRectInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  rect: Rect,
  options: RectOptions,
): Project | null {
  if (perspective === null) return null;
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  const shown = shownRect(p, perspective, markingId) ?? marking.rect;
  const resized = rect.width !== shown.width || rect.height !== shown.height;
  if (!marking.floating)
    return resized
      ? refusePrincipalOnly()
      : markingMoveFrom(p, perspective, markingId, rect, shown);
  const { x, y } = marking.rect;
  const sized = model.setMarkingRect(
    p,
    markingId,
    { x, y, width: rect.width, height: rect.height },
    options,
  );
  return markingMoveFrom(sized, perspective, markingId, rect, shown);
}

/** Anda a raiz da marcação até a posição pedida (`rect`), partindo de `shown`. */
function markingMoveFrom(
  p: Project,
  perspective: Perspective,
  markingId: string,
  rect: Rect,
  shown: Rect,
): Project {
  return (
    markingMoveInView(p, perspective, markingId, rect.x - shown.x, rect.y - shown.y) ?? p
  );
}

/**
 * Ajuste fino pelo painel (valor DA VISTA para `x`/`y`): `x`/`y` movem a raiz da marcação do
 * canvas; largura e altura só da flutuante (as demais: `principal-only`). Marcação de container:
 * `null`.
 */
export function markingAdjustInView(
  p: Project,
  perspective: Perspective | null,
  markingId: string,
  field: keyof Rect,
  value: number,
  options: RectOptions,
): Project | null {
  if (perspective === null) return null;
  const marking = markingOrFail(p, markingId);
  if (marking.containerId !== null) return null;
  if (!Number.isInteger(value)) model.fail('rect-not-integer');
  if (field === 'x' || field === 'y') {
    const shown = shownRect(p, perspective, markingId) ?? marking.rect;
    const delta = value - shown[field];
    return markingMoveInView(
      p,
      perspective,
      markingId,
      field === 'x' ? delta : 0,
      field === 'y' ? delta : 0,
    );
  }
  if (!marking.floating) return refusePrincipalOnly();
  return model.adjustMarkingRect(p, markingId, field, value, options);
}

// ---------------------------------------------------------------------------
// Seleção

/** Um item que anda na perspectiva: container ou marcação do canvas (a raiz dele). */
function rootOfMoving(p: Project, item: ItemRef): string | undefined {
  const index = model.projectIndex(p);
  if (item.kind === 'image') return index.rootOf.get(item.id);
  const marking = index.markings.get(item.id);
  return marking?.containerId === null ? index.rootOf.get(item.id) : undefined;
}

/** O item pode mudar de lugar (trava própria ou herdada dos ancestrais). */
function canGrab(p: Project, item: ItemRef): boolean {
  return item.kind === 'image'
    ? model.canEditImagePlacement(p, item.id)
    : model.canEditMarkingGeometry(p, item.id);
}

/** Os itens do arrasto separados: as raízes que andam na perspectiva e o resto, que anda no projeto. */
function splitMoving(
  p: Project,
  items: readonly ItemRef[],
): { readonly roots: readonly string[]; readonly rest: readonly ItemRef[] } {
  const moving = model.movingItems(p, items);
  const roots = new Set<string>();
  const others: ItemRef[] = [];
  for (const item of moving) {
    const root = rootOfMoving(p, item);
    if (root === undefined) others.push(item);
    else {
      model.requireUnlocked(canGrab(p, item));
      roots.add(root);
    }
  }
  const index = model.projectIndex(p);
  // A marcação de container cuja raiz anda vai com a raiz.
  const rest = others.filter((item) => !roots.has(index.rootOf.get(item.id) ?? ''));
  return { roots: [...roots], rest };
}

/** O arrasto aceita qualquer número finito; o passo das setas, só inteiros. */
function assertValidDelta(
  mode: 'move' | 'nudge',
  delta: { readonly dx: number; readonly dy: number },
): void {
  const valid = mode === 'move' ? Number.isFinite : Number.isInteger;
  if (!valid(delta.dx) || !valid(delta.dy)) model.fail('invalid-placement');
}

/**
 * Arrasto conjunto (`'move'`, unidades do canvas) ou passo das setas (`'nudge'`, inteiros) com uma
 * perspectiva aberta: as raízes dos containers e das marcações do canvas andam na perspectiva
 * (sem repetir; com marcação raiz o deslocamento do canvas é arredondado uma vez para todas) e as
 * marcações de container cuja raiz não anda seguem `moveItems`/`nudgeItems`, na mesma operação.
 */
export function itemsMoveInView(
  p: Project,
  perspective: Perspective | null,
  items: readonly ItemRef[],
  delta: { readonly dx: number; readonly dy: number },
  mode: 'move' | 'nudge',
  options: SettleOptions,
): Project | null {
  if (perspective === null) return null;
  assertValidDelta(mode, delta);
  if (delta.dx === 0 && delta.dy === 0) return p;
  const { roots, rest } = splitMoving(p, items);
  // O arrasto encosta (decisão 4 da etapa #764); o passo das setas segue recusando.
  const { dx, dy } =
    mode === 'move'
      ? touchingViewDelta(p, perspective, roots, delta.dx, delta.dy)
      : delta;
  let next = p;
  if (rest.length > 0) {
    next =
      mode === 'move'
        ? model.moveItems(p, rest, dx, dy, options)
        : model.nudgeItems(p, rest, dx, dy, options);
  }
  const whole = roots.some((root) => model.isMarkingRoot(p, root));
  const moves = roots.map((root) => ({
    root,
    dx: whole ? Math.round(dx) : dx,
    dy: whole ? Math.round(dy) : dy,
  }));
  return moves.length === 0 ? next : moveRootsChecked(next, perspective.id, moves);
}

// ---------------------------------------------------------------------------
// Criar numa perspectiva

/**
 * Depois de uma operação que cria (`before` → `after`) com a perspectiva `perspectiveId` aberta:
 * marcação do canvas nova que não é flutuante recusa (`principal-only`); cada raiz nova (container
 * sem pai ou flutuante) entra na perspectiva na posição que tem no projeto e chega à Principal
 * (`arriveInPrincipal`), uma de cada vez. Devolve o projeto e as chegadas (para o aviso).
 */
export function creationInPerspective(
  before: Project,
  after: Project,
  perspectiveId: string,
): { readonly project: Project; readonly arrivals: readonly ArrivalInfo[] } {
  if (!findPerspective(after, perspectiveId)) return { project: after, arrivals: [] };
  const known = model.projectIndex(before);
  const isNew = (id: string) => !known.containers.has(id) && !known.markings.has(id);
  const created = after.markings.filter((m) => isNew(m.id));
  if (created.some((m) => m.containerId === null && !m.floating)) refusePrincipalOnly();
  const roots = model.projectIndex(after).roots.filter(isNew);
  let project = after;
  const arrivals: ArrivalInfo[] = [];
  for (const root of roots) {
    const entered = enterPerspective(project, perspectiveId, root);
    const arrived = model.arriveInPrincipal(
      entered,
      root,
      perspectiveIn(entered, perspectiveId),
    );
    project = arrived.project;
    arrivals.push({
      root,
      from: perspectiveId,
      kind: arrived.kind,
      referenceId: arrived.referenceId,
    });
  }
  return { project, arrivals };
}

/** Acrescenta a raiz na perspectiva, na posição que ela tem no projeto. */
function enterPerspective(p: Project, perspectiveId: string, root: string): Project {
  const open = perspectiveIn(p, perspectiveId);
  const at = model.placeCreatedRoot(p, open, root);
  return {
    ...p,
    perspectives: p.perspectives.map((x) =>
      x.id === perspectiveId
        ? {
            ...x,
            items: [
              ...x.items.filter((i) => i.root !== root),
              { root, x: at.x, y: at.y },
            ],
          }
        : x,
    ),
  };
}
