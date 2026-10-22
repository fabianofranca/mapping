import type { Change, ChangeEntity, Proposal } from './proposal';
import { entityKey, jsonEqual } from './proposalValues';
import { isRecord } from './refs';
import type { JsonValue } from './types';

// Comparação entre propostas (etapa 4): quando uma proposta é substituída, cada mudança
// dela que ficou para trás (sem decisão ou aceita sem aplicar) mostra se a proposta nova
// traz a mesma coisa, outra coisa ou nada para aquele ponto.

/**
 * `same`: a nova tem a mesma mudança (mesma entidade, campo, tipo e valor `to`).
 * `different`: a nova mexe no mesmo ponto (ou na mesma entidade) com outro resultado.
 * `missing`: a nova não mexe nele ("não consta na nova").
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
 * As criações de uma proposta vistas pelo caminho legível, que não depende dos ids gerados a
 * cada `propose_changes`: imagem pelo nome (ou arquivo); marcação por imagem › pai › nome;
 * anotação por marcação › camada › tipo › nome; camada pelo nome. Entidades que já existem
 * no projeto entram pelo id (é o mesmo nas duas propostas).
 */
class Created {
  private readonly creates = new Map<string, Change>();
  private readonly paths = new Map<string, string>();
  /** Id gerado (entidade criada, par da livre, linha de tabela) → forma estável. */
  private readonly tokens = new Map<string, string>();

  constructor(proposal: Proposal) {
    for (const c of proposal.changes) {
      if (c.kind === 'create') this.creates.set(entityKey(c.entity, c.entityId), c);
    }
    for (const c of this.creates.values()) this.collectTokens(c);
  }

  /** Caminho da criação; `null` se a mudança não é uma criação. */
  pathOf(c: Change): string | null {
    return c.kind === 'create' ? this.path(c.entity, c.entityId, new Set()) : null;
  }

  /** O valor com os ids gerados nesta proposta trocados pela forma estável. */
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
    // Entidade existente (ou ciclo, que uma proposta válida não tem): pelo id.
    if (!c || seen.has(key)) return `#${key}`;
    seen.add(key);
    const to = isRecord(c.to) ? c.to : {};
    const ref = (e: ChangeEntity, value: JsonValue | undefined) =>
      typeof value === 'string' && value !== '' ? this.path(e, value, seen) : '-';
    let path: string;
    if (entity === 'image') {
      path = `image(${text(to.name) || text(to.file) || `${text(to.background)} ${String(to.width)}x${String(to.height)}`})`;
    } else if (entity === 'marking') {
      path = `marking(${ref('image', to.containerId)} › ${ref('marking', to.parentId)} › ${text(to.name)})`;
    } else if (entity === 'annotation') {
      const type = isRecord(to.type)
        ? `${text(to.type.specId)}/${text(to.type.typeId)}`
        : '-';
      path = `annotation(${ref('marking', to.markingId)} › ${ref('layer', to.layerId)} › ${type} › ${text(to.name)})`;
    } else if (entity === 'layer') {
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
 * Compara cada mudança de `previous` com as de `next`. A mudança correspondente na nova é
 * achada, nesta ordem: na criação de imagem ou marcação com `source`, pela origem (a mesma
 * tela recriada com outro id); pela entidade e campo (ids das entidades existentes e dos
 * itens criados citados de novo); e, nas criações, pelo caminho legível (imagem › pai › nome),
 * uma a uma e na ordem. Os valores são comparados com os ids gerados por cada proposta
 * trocados pelo caminho. Devolve o resultado por id de mudança de `previous`.
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
  // Criações ainda sem par, pelo caminho legível (as já casadas acima ficam de fora).
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
