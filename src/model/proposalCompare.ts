import type { Change, ChangeEntity, Proposal } from './proposal';
import { entityKey, jsonEqual } from './proposalValues';
import { isRecord } from './refs';
import type { JsonValue } from './types';

// Comparison between proposals (stage 4): when a proposal is superseded, each of its changes
// that was left behind (undecided or accepted without being applied) shows whether the new
// proposal brings the same thing, something else or nothing for that point.

/**
 * `same`: the new one has the same change (same entity, field, kind and `to` value).
 * `different`: the new one touches the same point (or the same entity) with another result.
 * `missing`: the new one does not touch it ("not in the new one").
 */
export type ChangeComparison = 'same' | 'different' | 'missing';

function changeKey(c: Change): string {
  return `${entityKey(c.entity, c.entityId)}|${c.field ?? ''}`;
}

function sourceKey(c: Change): string | null {
  if (c.kind !== 'create' || (c.entity !== 'image' && c.entity !== 'marking'))
    return null;
  const source = isRecord(c.to) ? c.to.source : null;
  if (!isRecord(source)) return null;
  return `${c.entity}|${String(source.system)}|${String(source.id)}`;
}

function text(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The creations of a proposal seen through the readable path, which does not depend on the
 * ids generated at each `propose_changes`: image by name (or file); marking by image (or
 * Canvas) › parent › name; arrow by its endpoints (origin → destination) and name;
 * annotation by marking › layer › type › name; layer by name. Entities that already exist
 * in the project enter by id (it is the same in both proposals).
 */
class Created {
  private readonly creates = new Map<string, Change>();
  private readonly paths = new Map<string, string>();
  /** Generated id (created entity, free-form pair, table row) → stable form. */
  private readonly tokens = new Map<string, string>();

  constructor(proposal: Proposal) {
    for (const c of proposal.changes) {
      if (c.kind === 'create') this.creates.set(entityKey(c.entity, c.entityId), c);
    }
    for (const c of this.creates.values()) this.collectTokens(c);
  }

  /** Path of the creation; `null` if the change is not a creation. */
  pathOf(c: Change): string | null {
    return c.kind === 'create' ? this.path(c.entity, c.entityId, new Set()) : null;
  }

  /** The value with the ids generated in this proposal replaced by the stable form. */
  canonical(value: JsonValue): JsonValue {
    if (typeof value === 'string') return this.tokens.get(value) ?? value;
    if (Array.isArray(value)) return value.map((v) => this.canonical(v));
    if (!isRecord(value)) return value;
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = this.canonical(v);
    return out;
  }

  private path(entity: ChangeEntity, id: string, seen: Set<string>): string {
    const key = entityKey(entity, id);
    const cached = this.paths.get(key);
    if (cached !== undefined) return cached;
    const c = this.creates.get(key);
    // Existing entity (or a cycle, which a valid proposal does not have): by id.
    if (!c || seen.has(key)) return `#${key}`;
    seen.add(key);
    // The arrow's key is the marking's (the ids share the space): the creation's entity counts.
    const kind = c.entity;
    const to = isRecord(c.to) ? c.to : {};
    const ref = (e: ChangeEntity, value: JsonValue | undefined) =>
      typeof value === 'string' && value !== '' ? this.path(e, value, seen) : '-';
    let path: string;
    if (kind === 'image') {
      path = `image(${text(to.name) || text(to.file) || `${text(to.background)} ${String(to.width)}x${String(to.height)}`})`;
    } else if (kind === 'marking') {
      // Null container: the canvas marking ("Canvas › parent › name").
      const space = to.containerId === null ? 'Canvas' : ref('image', to.containerId);
      path = `marking(${space} › ${ref('marking', to.parentId)} › ${text(to.name)})`;
    } else if (kind === 'arrow') {
      // The arrow by its endpoints (origin → destination) and by name, which do not depend on the generated id.
      path = `arrow(${ref('marking', to.from)} → ${ref('marking', to.to)} › ${text(to.name)})`;
    } else if (kind === 'annotation') {
      const type = isRecord(to.type)
        ? `${text(to.type.specId)}/${text(to.type.typeId)}`
        : '-';
      path = `annotation(${ref('marking', to.markingId)} › ${ref('layer', to.layerId)} › ${type} › ${text(to.name)})`;
    } else if (kind === 'layer') {
      path = `layer(${text(to.name)})`;
    } else {
      path = `#${key}`;
    }
    this.paths.set(key, path);
    return path;
  }

  private collectTokens(c: Change): void {
    const path = this.path(c.entity, c.entityId, new Set());
    this.tokens.set(c.entityId, `@${path}`);
    if (c.entity !== 'annotation' || !isRecord(c.to)) return;
    const { entries, values } = c.to;
    if (Array.isArray(entries)) {
      entries.forEach((e, i) => {
        if (isRecord(e) && typeof e.id === 'string') {
          this.tokens.set(e.id, `@${path}/entries[${i}]`);
        }
      });
    }
    if (isRecord(values)) {
      for (const [field, rows] of Object.entries(values)) {
        if (!Array.isArray(rows)) continue;
        rows.forEach((row, i) => {
          if (isRecord(row) && typeof row._id === 'string') {
            this.tokens.set(row._id, `@${path}/${field}[${i}]`);
          }
        });
      }
    }
  }
}

/**
 * Compares each change of `previous` with those of `next`. The corresponding change in the
 * new one is found, in this order: for an image or marking creation with `source`, by origin
 * (the same screen recreated with another id); by entity and field (ids of existing entities
 * and of created items cited again); and, for creations, by the readable path (image or
 * Canvas › parent › name), one by one and in order. The values are compared with the ids
 * generated by each proposal replaced by the path. Returns the result per change id of
 * `previous`.
 */
export function compareProposals(
  previous: Proposal,
  next: Proposal,
): Map<string, ChangeComparison> {
  const prevCreated = new Created(previous);
  const nextCreated = new Created(next);
  const byKey = new Map<string, Change>();
  const byEntity = new Set<string>();
  const bySource = new Map<string, Change>();
  const byPath = new Map<string, Change[]>();
  for (const c of next.changes) {
    byKey.set(changeKey(c), c);
    byEntity.add(entityKey(c.entity, c.entityId));
    const source = sourceKey(c);
    if (source !== null && !bySource.has(source)) bySource.set(source, c);
  }
  const compare = (c: Change, match: Change): ChangeComparison =>
    match.kind === c.kind &&
    jsonEqual(prevCreated.canonical(c.to), nextCreated.canonical(match.to))
      ? 'same'
      : 'different';

  const result = new Map<string, ChangeComparison>();
  const used = new Set<string>();
  const unmatched: Change[] = [];
  for (const c of previous.changes) {
    const source = sourceKey(c);
    const match =
      (source === null ? undefined : bySource.get(source)) ?? byKey.get(changeKey(c));
    if (match) {
      used.add(match.id);
      result.set(c.id, compare(c, match));
    } else {
      unmatched.push(c);
    }
  }
  // Creations still without a pair, by the readable path (those already matched above are left out).
  for (const c of next.changes) {
    const path = nextCreated.pathOf(c);
    if (path === null || used.has(c.id)) continue;
    const list = byPath.get(path) ?? [];
    list.push(c);
    byPath.set(path, list);
  }
  for (const c of unmatched) {
    const path = prevCreated.pathOf(c);
    const twin = path === null ? undefined : byPath.get(path)?.shift();
    if (twin) {
      result.set(c.id, compare(c, twin));
      continue;
    }
    const touched = byEntity.has(entityKey(c.entity, c.entityId));
    result.set(c.id, touched ? 'different' : 'missing');
  }
  return result;
}
