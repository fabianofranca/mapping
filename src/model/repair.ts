// Reparo mecânico de um projeto que viola invariantes (docs/FORMAT.md, "Arquivos
// inconsistentes"). Função pura: quem grava o reparado (e o backup do original) é a sessão.
import {
  IDENTITY_PLACEMENT,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  right,
  snapPlacement,
  toCanvasRect,
} from './geometry';
import { IMAGE_GAP } from './containers';
import {
  perspectiveNameKey,
  validateProject,
  type InvariantCode,
  type InvariantEntity,
  type InvariantIssue,
} from './invariants';
import type {
  Annotation,
  Arrival,
  Arrow,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  Rect,
} from './types';

/** O que o reparo fez com o item. */
export type RepairAction =
  'new-id' | 'clipped' | 'removed' | 'made-root' | 'moved' | 'renamed';

export interface RepairRecord {
  readonly action: RepairAction;
  /** Invariante que motivou o reparo. */
  readonly code: InvariantCode;
  readonly entity: InvariantEntity;
  readonly id: string;
  /** Nome do item, quando houver (na imagem sem rótulo, o arquivo). */
  readonly name?: string;
}

export interface RepairResult {
  /** O projeto reparado; só é válido com `unrepaired` vazio. */
  readonly project: Project;
  /** Cada reparo feito, na ordem. */
  readonly repaired: readonly RepairRecord[];
  /** Problemas sem reparo mecânico inequívoco: com algum, o projeto continua recusado. */
  readonly unrepaired: readonly InvariantIssue[];
}

/** Invariantes com reparo mecânico. Todo o resto fica em `unrepaired`. */
const REPAIRABLE: ReadonlySet<InvariantCode> = new Set<InvariantCode>([
  'duplicate-entry-id',
  'rect-out-of-image',
  'missing-image',
  'missing-marking',
  'missing-layer',
  'missing-parent',
  'hierarchy-cycle',
  'images-overlap',
  'container-parent-missing',
  'container-parent-not-canvas',
  'container-outside-parent',
  'floating-in-container',
  'parent-floating',
  'arrow-endpoint-missing',
  'arrow-self',
  'duplicate-id', // só o de perspectiva (ver `isRepairable`)
  'perspective-root-missing',
  'perspective-root-not-root',
  'perspective-root-duplicate',
  'perspective-layer-missing',
  'perspective-duplicate-name',
  'arrival-root-missing',
  'arrival-root-not-root',
  'arrival-duplicate',
]);

/**
 * O `duplicate-id` só tem reparo na perspectiva (nada aponta para ela por id além da chegada,
 * que guarda o nome); nas outras entidades a referência seria ambígua.
 */
function isRepairable(issue: InvariantIssue): boolean {
  if (issue.code === 'duplicate-id') return issue.entity === 'perspective';
  return REPAIRABLE.has(issue.code);
}

/**
 * Um reparo pode deixar outro à mostra (ex.: a marcação removida deixa as anotações dela
 * sem marcação e os filhos sem pai); cada rodada resolve o que a anterior expôs.
 */
const MAX_ROUNDS = 8;

/**
 * Repara o que é mecânico e inequívoco: par com id repetido → id novo; `rect` de marcação de
 * container fora da imagem → recortado aos limites (sem área → marcação removida); marcação de
 * imagem inexistente e anotação de marcação ou camada inexistente → removidas (a anotação leva
 * as que ela possui); pai inexistente, flutuante ou ciclo na hierarquia → a marcação vira
 * raiz; pai de container ausente, que não é do canvas ou que não o contém → o container fica
 * sem pai; flutuante com container ou pai → vai para o canvas, com o `rect` convertido;
 * imagens sobrepostas → a de maior índice vai para a direita das anteriores; seta com ponta
 * inexistente (ou que não é uma marcação) ou ligada a ela mesma → removida, e as anotações dela
 * saem na rodada seguinte (a dona deixou de existir); perspectiva (v16): item de raiz inexistente,
 * que não é raiz ou repetido → removido, camada escondida inexistente → tirada da lista, id
 * repetido → a repetida ganha id novo, nome repetido → a repetida ganha " (2)", " (3)"…; chegada
 * de raiz inexistente, que não é raiz ou repetida → removida. Só torna o
 * projeto válido: não assenta (quem assenta é a próxima operação de geometria). O que sobra
 * depois dos reparos (`validateProject` de novo) é `unrepaired`.
 */
export function repairProject(
  project: Project,
  issues: readonly InvariantIssue[],
  newId: () => string = () => crypto.randomUUID(),
): RepairResult {
  const repaired: RepairRecord[] = [];
  let p = project;
  let current = issues;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (!current.some(isRepairable)) break;
    p = repairRound(p, current, newId, repaired);
    current = validateProject(p);
  }
  return { project: p, repaired, unrepaired: current };
}

function record(
  out: RepairRecord[],
  action: RepairAction,
  code: InvariantCode,
  entity: InvariantEntity,
  item: {
    readonly id: string;
    readonly name: string | null;
    readonly file?: string | null;
  },
): void {
  const name = item.name ?? item.file ?? null;
  out.push({ action, code, entity, id: item.id, ...(name === null ? {} : { name }) });
}

/** Recorte de `rect` aos limites da imagem; `null` se não sobra área. */
function clipToImage(rect: Rect, image: ProjectContainer): Rect | null {
  const bounds = imagePixelRect(image);
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const width = Math.min(rect.x + rect.width, bounds.width) - x;
  const height = Math.min(rect.y + rect.height, bounds.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** A marcação faz parte do ciclo (subindo pelos pais, volta a ela mesma)? */
function inCycle(m: Marking, markings: ReadonlyMap<string, Marking>): boolean {
  const visited = new Set<string>();
  let parentId = m.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    if (parentId === m.id) return true;
    visited.add(parentId);
    parentId = markings.get(parentId)?.parentId ?? null;
  }
  return false;
}

function repairRound(
  p: Project,
  issues: readonly InvariantIssue[],
  newId: () => string,
  out: RepairRecord[],
): Project {
  const codesOf = new Map<string, Set<InvariantCode>>();
  for (const issue of issues) {
    const key = `${issue.entity}:${issue.id}`;
    const set = codesOf.get(key) ?? new Set<InvariantCode>();
    set.add(issue.code);
    codesOf.set(key, set);
  }
  const has = (entity: InvariantEntity, id: string, code: InvariantCode) =>
    codesOf.get(`${entity}:${id}`)?.has(code) ?? false;

  // Marcações: removidas (imagem inexistente, recorte sem área), recortadas ou viradas raiz.
  // A marcação do canvas (`containerId` nulo) não tem imagem: nunca é órfã nem é recortada.
  const containers = new Map(p.containers.map((i) => [i.id, i]));
  const byId = new Map(p.markings.map((m) => [m.id, m]));
  const markings: Marking[] = [];
  for (const m of p.markings) {
    if (has('marking', m.id, 'missing-image')) {
      record(out, 'removed', 'missing-image', 'marking', m);
      continue;
    }
    let next = m;
    const image = m.containerId === null ? undefined : containers.get(m.containerId);
    if (has('marking', m.id, 'floating-in-container')) {
      // A flutuante vive só no canvas: sai do container, com o `rect` como a pessoa o vê.
      const rect = image
        ? fromCanvasRect(IDENTITY_PLACEMENT, toCanvasRect(image.placement, m.rect), null)
        : m.rect;
      next = { ...next, containerId: null, parentId: null, rect };
      record(out, 'made-root', 'floating-in-container', 'marking', m);
    } else if (image && has('marking', m.id, 'rect-out-of-image')) {
      const rect = clipToImage(m.rect, image);
      if (!rect) {
        record(out, 'removed', 'rect-out-of-image', 'marking', m);
        continue;
      }
      next = { ...next, rect };
      record(out, 'clipped', 'rect-out-of-image', 'marking', m);
    }
    if (next.parentId !== null && has('marking', m.id, 'missing-parent')) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'missing-parent', 'marking', m);
    } else if (next.parentId !== null && has('marking', m.id, 'parent-floating')) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'parent-floating', 'marking', m);
    } else if (has('marking', m.id, 'hierarchy-cycle') && inCycle(m, byId)) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'hierarchy-cycle', 'marking', m);
    }
    markings.push(next);
  }

  // Setas: sem uma das pontas ou ligadas a si mesmas, não há o que ligar. As anotações delas
  // saem na rodada seguinte, como as de qualquer dona que deixou de existir.
  const arrows: Arrow[] = [];
  for (const a of p.arrows) {
    const code = (['arrow-endpoint-missing', 'arrow-self'] as const).find((c) =>
      has('arrow', a.id, c),
    );
    if (code) record(out, 'removed', code, 'arrow', a);
    else arrows.push(a);
  }

  // Anotações: as de marcação ou camada inexistente saem, com as que elas possuem.
  const removed = new Set<string>();
  const kept: Annotation[] = [];
  for (const a of p.annotations) {
    const code: InvariantCode | null = has('annotation', a.id, 'missing-marking')
      ? 'missing-marking'
      : has('annotation', a.id, 'missing-layer')
        ? 'missing-layer'
        : null;
    if (code) {
      removed.add(a.id);
      record(out, 'removed', code, 'annotation', a);
    }
  }
  if (removed.size > 0) {
    // As possuídas podem vir antes da dona na lista: repete até não achar mais nenhuma.
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of p.annotations) {
        if (removed.has(a.id) || a.parentAnnotationId === null) continue;
        if (!removed.has(a.parentAnnotationId)) continue;
        removed.add(a.id);
        record(out, 'removed', 'missing-parent-annotation', 'annotation', a);
        grew = true;
      }
    }
  }
  const seenEntries = new Set<string>();
  for (const a of p.annotations) {
    if (removed.has(a.id)) continue;
    if (!has('annotation', a.id, 'duplicate-entry-id')) {
      for (const e of a.entries) seenEntries.add(e.id);
      kept.push(a);
      continue;
    }
    // O primeiro par com o id fica com ele (as referências seguem apontando para ele).
    let renewed = false;
    const entries = a.entries.map((e) => {
      if (!seenEntries.has(e.id)) {
        seenEntries.add(e.id);
        return e;
      }
      let id = newId();
      while (seenEntries.has(id)) id = newId();
      seenEntries.add(id);
      renewed = true;
      return { ...e, id };
    });
    // O id de entrada pode ter colidido só com uma anotação removida: então nada mudou.
    if (renewed) record(out, 'new-id', 'duplicate-entry-id', 'annotation', a);
    kept.push(renewed ? { ...a, entries } : a);
  }

  // Imagens sobrepostas: cada uma que encosta numa anterior vai para a direita de todas elas.
  let projectImages = p.containers;
  if (issues.some((i) => i.code === 'images-overlap')) {
    const placed: Rect[] = [];
    projectImages = p.containers.map((image) => {
      let next = image;
      let rect = imageCanvasRect(image, image.placement);
      if (placed.some((r) => rectsOverlap(r, rect))) {
        const x = Math.max(...placed.map(right)) + IMAGE_GAP;
        next = { ...image, placement: snapPlacement({ ...image.placement, x }) };
        rect = imageCanvasRect(next, next.placement);
        record(out, 'moved', 'images-overlap', 'image', image);
      }
      placed.push(rect);
      return next;
    });
  }

  // Pai de container ausente, que não é uma marcação do canvas ou que não o contém: sem pai.
  const orphanCodes: readonly InvariantCode[] = [
    'container-parent-missing',
    'container-parent-not-canvas',
    'container-outside-parent',
  ];
  projectImages = projectImages.map((image) => {
    const code = orphanCodes.find((c) => has('image', image.id, c));
    if (code === undefined || image.parentId === null) return image;
    record(out, 'made-root', code, 'image', image);
    return { ...image, parentId: null };
  });

  return {
    ...p,
    containers: projectImages,
    markings,
    arrows,
    ...repairPerspectives(p, issues, newId, out),
    annotations: kept,
  };
}

/** Nome livre entre os já usados (comparação sem caixa): `Nome (2)`, `Nome (3)`… */
function numberedName(name: string, taken: ReadonlySet<string>): string {
  const base = name.trim();
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(perspectiveNameKey(candidate))) return candidate;
  }
}

/** Sem as camadas escondidas inexistentes e sem os itens de raiz inválida ou repetida. */
function cleanPerspective(
  x: Perspective,
  badRoots: ReadonlySet<string>,
  badLayers: ReadonlySet<string>,
): Perspective {
  const seen = new Set<string>();
  return {
    ...x,
    hiddenLayers: x.hiddenLayers.filter((layer) => !badLayers.has(layer)),
    items: x.items.filter(({ root }) => {
      if (badRoots.has(root) || seen.has(root)) return false;
      seen.add(root);
      return true;
    }),
  };
}

/** `id` e nome únicos: a primeira perspectiva fica com os dela; a repetida muda (nada some). */
function uniquePerspectives(
  list: readonly Perspective[],
  newId: () => string,
): Perspective[] {
  const takenIds = new Set(list.map((x) => x.id));
  const takenNames = new Set(list.map((x) => perspectiveNameKey(x.name)));
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  return list.map((x) => {
    let next = x;
    if (usedIds.has(x.id)) {
      let id = newId();
      while (takenIds.has(id)) id = newId();
      takenIds.add(id);
      next = { ...next, id };
    }
    usedIds.add(next.id);
    if (usedNames.has(perspectiveNameKey(x.name))) {
      const name = numberedName(x.name, takenNames);
      takenNames.add(perspectiveNameKey(name));
      next = { ...next, name };
    }
    usedNames.add(perspectiveNameKey(next.name));
    return next;
  });
}

/**
 * Reparo das perspectivas e chegadas (v16). A raiz ou a camada inválida vem no `otherId` do
 * problema (a da chegada, no `id`). Cada problema vira um registro; sem problema de perspectiva
 * ou chegada, devolve as listas como estão.
 */
function repairPerspectives(
  p: Project,
  issues: readonly InvariantIssue[],
  newId: () => string,
  out: RepairRecord[],
): { perspectives: readonly Perspective[]; arrivals: readonly Arrival[] } {
  const badRoots = new Set<string>();
  const badLayers = new Set<string>();
  const badArrivals = new Set<string>();
  // O que cada código manda tirar (a raiz repetida e o id e nome repetidos não entram: não há
  // valor inválido, só o segundo uso).
  const drop: Partial<Record<InvariantCode, Set<string>>> = {
    'perspective-root-missing': badRoots,
    'perspective-root-not-root': badRoots,
    'perspective-layer-missing': badLayers,
    'arrival-root-missing': badArrivals,
    'arrival-root-not-root': badArrivals,
  };
  let touched = false;
  for (const i of issues) {
    if (!isPerspectiveIssue(i)) continue;
    touched = true;
    record(out, PERSPECTIVE_ACTIONS[i.code] ?? 'removed', i.code, i.entity, {
      id: i.id,
      name: i.name ?? null,
    });
    drop[i.code]?.add(i.entity === 'arrival' ? i.id : (i.otherId ?? ''));
  }
  if (!touched) return { perspectives: p.perspectives, arrivals: p.arrivals };
  const seen = new Set<string>();
  return {
    perspectives: uniquePerspectives(
      p.perspectives.map((x) => cleanPerspective(x, badRoots, badLayers)),
      newId,
    ),
    // A chegada repetida (mesma raiz) perde a segunda.
    arrivals: p.arrivals.filter(({ root }) => {
      if (badArrivals.has(root) || seen.has(root)) return false;
      seen.add(root);
      return true;
    }),
  };
}

/** Problema de perspectiva ou de chegada, com reparo (o `duplicate-id` só vale na perspectiva). */
function isPerspectiveIssue(i: InvariantIssue): boolean {
  return (i.entity === 'perspective' || i.entity === 'arrival') && isRepairable(i);
}

/** Ação de cada código; o que não está aqui remove o item. */
const PERSPECTIVE_ACTIONS: Partial<Record<InvariantCode, RepairAction>> = {
  'duplicate-id': 'new-id',
  'perspective-duplicate-name': 'renamed',
};
