import {
  arrowShownIn,
  perspectiveRootSet,
  projectIndex,
  type Perspective,
  type Project,
} from '../src/model';
import { ToolError } from './errors';
import type { Refs } from './items';

// Perspectives (v16, stage #659): the MCP only reads. The Main one is the project itself and does not appear in
// `perspectives` (it always exists, shows everything). The "Only me" perspectives stay in the browser and do not
// exist here. Nothing in this file writes `mapping.json`.

type Json = Record<string, unknown>;

/** Reference of the root: container (`i`) or marking (`m`). */
function rootRef(refs: Refs, root: string): string {
  const isContainer = projectIndex(refs.project).containers.has(root);
  return refs.ref(isContainer ? 'i' : 'm', root);
}

function hiddenLayersView(p: Project, perspective: Perspective): Json[] {
  const names = new Map(p.layers.map((l) => [l.id, l.name]));
  return perspective.hiddenLayers.map((id) => ({ id, name: names.get(id) ?? null }));
}

function countRoots(p: Project, perspective: Perspective): number {
  const index = projectIndex(p);
  let count = 0;
  for (const root of perspectiveRootSet(perspective)) {
    if (index.rootOf.get(root) === root) count++;
  }
  return count;
}

/** `perspectives` of `get_project`: id, name, how many roots and the hidden layers. */
export function perspectiveSummaries(refs: Refs): Json[] {
  const p = refs.project;
  return p.perspectives.map((perspective) => ({
    id: perspective.id,
    name: perspective.name,
    roots: countRoots(p, perspective),
    hiddenLayers: hiddenLayersView(p, perspective),
  }));
}

/** `arrivals` of `get_project`: the "Came from…" marks that the Main one still shows. */
export function arrivalsView(refs: Refs): Json[] {
  const p = refs.project;
  const index = projectIndex(p);
  return p.arrivals.map((arrival) => {
    const marking = index.markings.get(arrival.root);
    const container = index.containers.get(arrival.root);
    return {
      root: rootRef(refs, arrival.root),
      name: marking?.name ?? container?.name ?? null,
      from: arrival.from,
      fromName: arrival.fromName,
      perspectiveExists: p.perspectives.some((x) => x.id === arrival.from),
    };
  });
}

/** Finds the perspective by id or, failing that, by name (case-insensitive). */
export function findPerspective(p: Project, query: string): Perspective {
  const lower = query.trim().toLocaleLowerCase();
  const found =
    p.perspectives.find((x) => x.id === query) ??
    p.perspectives.find((x) => x.name.toLocaleLowerCase() === lower);
  if (found) return found;
  throw new ToolError('not-found', `perspective not found: ${query}`, {
    hint: 'see `perspectives` in get_project; the Main perspective is not a saved perspective (it is the project itself) and the "Only me" ones stay in the browser',
  });
}

/** `get_perspective`: the roots with their position and the hidden layers. */
export function perspectiveDetail(refs: Refs, perspective: Perspective): Json {
  const p = refs.project;
  const index = projectIndex(p);
  const missing: string[] = [];
  const roots: Json[] = [];
  for (const item of perspective.items) {
    if (index.rootOf.get(item.root) !== item.root) {
      missing.push(item.root);
      continue;
    }
    const container = index.containers.get(item.root);
    const marking = index.markings.get(item.root);
    roots.push({
      ref: rootRef(refs, item.root),
      kind: container ? 'container' : 'marking',
      name: container?.name ?? marking?.name ?? null,
      x: item.x,
      y: item.y,
    });
  }
  return {
    id: perspective.id,
    name: perspective.name,
    hiddenLayers: hiddenLayersView(p, perspective),
    roots,
    ...(missing.length > 0 ? { missing } : {}),
  };
}

/** In which perspectives the root appears, with its position in each one. */
export function perspectivesOfRoot(p: Project, root: string): Json[] {
  return p.perspectives.flatMap((perspective) => {
    const item = perspective.items.find((x) => x.root === root);
    return item
      ? [{ id: perspective.id, name: perspective.name, x: item.x, y: item.y }]
      : [];
  });
}

/** In which perspectives the arrow appears (both ends in the view). */
export function perspectivesOfArrow(p: Project, arrowId: string): Json[] {
  return p.perspectives
    .filter((perspective) => arrowShownIn(p, perspective, arrowId))
    .map((perspective) => ({ id: perspective.id, name: perspective.name }));
}

/** `root` (reference) and `perspectives` of an item (container or marking). */
export function rootInfo(refs: Refs, itemId: string): Json {
  const p = refs.project;
  const root = projectIndex(p).rootOf.get(itemId);
  if (root === undefined) return { root: null, perspectives: [] };
  return { root: rootRef(refs, root), perspectives: perspectivesOfRoot(p, root) };
}
