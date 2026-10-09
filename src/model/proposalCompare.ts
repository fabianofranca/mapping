import type { Change, Proposal } from './proposal';
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

/** O valor sem os ids (a mesma entidade recriada com outro id, casada pela origem). */
function withoutIds(value: JsonValue): JsonValue {
  if (!isRecord(value)) return value;
  const rest: Record<string, JsonValue> = { ...value };
  delete rest.id;
  delete rest.imageId;
  delete rest.parentId;
  return rest;
}

/**
 * Compara cada mudança de `previous` com as de `next`: pela entidade e campo (ids das
 * entidades existentes e dos itens criados citados de novo) e, na criação de imagem ou
 * marcação com `source`, pela origem (a mesma tela recriada com outro id). Devolve o
 * resultado por id de mudança de `previous`.
 */
export function compareProposals(
  previous: Proposal,
  next: Proposal,
): Map<string, ChangeComparison> {
  const byKey = new Map<string, Change>();
  const byEntity = new Set<string>();
  const bySource = new Map<string, Change>();
  for (const c of next.changes) {
    byKey.set(changeKey(c), c);
    byEntity.add(entityKey(c.entity, c.entityId));
    const source = sourceKey(c);
    if (source !== null && !bySource.has(source)) bySource.set(source, c);
  }
  const result = new Map<string, ChangeComparison>();
  for (const c of previous.changes) {
    const match = byKey.get(changeKey(c));
    if (match) {
      const same = match.kind === c.kind && jsonEqual(match.to, c.to);
      result.set(c.id, same ? 'same' : 'different');
      continue;
    }
    const source = sourceKey(c);
    const twin = source === null ? undefined : bySource.get(source);
    if (twin) {
      const same = jsonEqual(withoutIds(twin.to), withoutIds(c.to));
      result.set(c.id, same ? 'same' : 'different');
      continue;
    }
    const touched = byEntity.has(entityKey(c.entity, c.entityId));
    result.set(c.id, touched ? 'different' : 'missing');
  }
  return result;
}
