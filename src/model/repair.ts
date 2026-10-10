// Reparo mecânico de um projeto que viola invariantes (docs/FORMAT.md, "Arquivos
// inconsistentes"). Função pura: quem grava o reparado (e o backup do original) é a sessão.
import { imageCanvasRect, imagePixelRect, rectsOverlap, right } from './geometry';
import { IMAGE_GAP } from './images';
import {
  validateProject,
  type InvariantCode,
  type InvariantEntity,
  type InvariantIssue,
} from './invariants';
import type { Annotation, Marking, Project, ProjectImage, Rect } from './types';

/** O que o reparo fez com o item. */
export type RepairAction = 'new-id' | 'clipped' | 'removed' | 'made-root' | 'moved';

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
]);

/**
 * Um reparo pode deixar outro à mostra (ex.: a marcação removida deixa as anotações dela
 * sem marcação e os filhos sem pai); cada rodada resolve o que a anterior expôs.
 */
const MAX_ROUNDS = 8;

/**
 * Repara o que é mecânico e inequívoco: par com id repetido → id novo; `rect` fora da
 * imagem → recortado aos limites (sem área → marcação removida); marcação de imagem
 * inexistente e anotação de marcação ou camada inexistente → removidas (a anotação leva as
 * que ela possui); pai inexistente ou ciclo na hierarquia → a marcação vira raiz; imagens
 * sobrepostas → a de maior índice vai para a direita das anteriores. O que sobra depois
 * dos reparos (`validateProject` de novo) é `unrepaired`.
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
    if (!current.some((i) => REPAIRABLE.has(i.code))) break;
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
  item: { readonly id: string; readonly name: string | null; readonly file?: string },
): void {
  const name = item.name ?? item.file ?? null;
  out.push({ action, code, entity, id: item.id, ...(name === null ? {} : { name }) });
}

/** Recorte de `rect` aos limites da imagem; `null` se não sobra área. */
function clipToImage(rect: Rect, image: ProjectImage): Rect | null {
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
  const images = new Map(p.images.map((i) => [i.id, i]));
  const byId = new Map(p.markings.map((m) => [m.id, m]));
  const markings: Marking[] = [];
  for (const m of p.markings) {
    if (has('marking', m.id, 'missing-image')) {
      record(out, 'removed', 'missing-image', 'marking', m);
      continue;
    }
    let next = m;
    const image = images.get(m.imageId);
    if (image && has('marking', m.id, 'rect-out-of-image')) {
      const rect = clipToImage(m.rect, image);
      if (!rect) {
        record(out, 'removed', 'rect-out-of-image', 'marking', m);
        continue;
      }
      next = { ...next, rect };
      record(out, 'clipped', 'rect-out-of-image', 'marking', m);
    }
    if (has('marking', m.id, 'missing-parent')) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'missing-parent', 'marking', m);
    } else if (has('marking', m.id, 'hierarchy-cycle') && inCycle(m, byId)) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'hierarchy-cycle', 'marking', m);
    }
    markings.push(next);
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
    const entries = a.entries.map((e) => {
      if (!seenEntries.has(e.id)) {
        seenEntries.add(e.id);
        return e;
      }
      let id = newId();
      while (seenEntries.has(id)) id = newId();
      seenEntries.add(id);
      return { ...e, id };
    });
    record(out, 'new-id', 'duplicate-entry-id', 'annotation', a);
    kept.push({ ...a, entries });
  }

  // Imagens sobrepostas: cada uma que encosta numa anterior vai para a direita de todas elas.
  let projectImages = p.images;
  if (issues.some((i) => i.code === 'images-overlap')) {
    const placed: Rect[] = [];
    projectImages = p.images.map((image) => {
      let next = image;
      let rect = imageCanvasRect(image, image.placement);
      if (placed.some((r) => rectsOverlap(r, rect))) {
        const x = Math.max(...placed.map(right)) + IMAGE_GAP;
        next = { ...image, placement: { ...image.placement, x } };
        rect = imageCanvasRect(next, next.placement);
        record(out, 'moved', 'images-overlap', 'image', image);
      }
      placed.push(rect);
      return next;
    });
  }

  return { ...p, images: projectImages, markings, annotations: kept };
}
