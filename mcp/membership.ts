import { membershipChanges, type MembershipChange, type Project } from '../src/model';
import { Refs } from './items';

// O `membership` do resultado de `plan_changes` e `propose_changes`: quem mudou de pai ou de
// espaço pela geometria (`settleHierarchy`) entre o projeto antes do lote e o depois. A
// comparação é do modelo (`membershipChanges`); aqui só se dão nomes e referências.

interface Place {
  readonly parent: string | null;
  readonly container?: string | null;
}

/** Nomes de um lado da mudança: o pai e o espaço (`null` sem pai; o canvas é "Canvas"). */
interface Names {
  readonly parent: string | null;
  readonly space: string | null;
}

function parentPhrase(from: Names, to: Names): string {
  if (from.parent !== null && to.parent === null) {
    return `sai de ${from.parent}; agora direto em ${to.space ?? 'o canvas'}`;
  }
  if (from.parent !== null) return `sai de ${from.parent}; agora dentro de ${to.parent}`;
  return `entra em ${to.parent}`;
}

/** Frase curta: "Botão sai de Topo; agora direto em Detalhes". */
function messageOf(name: string, from: Names, to: Names): string {
  const spaceMoved = from.space !== to.space;
  const parentMoved = from.parent !== to.parent;
  const parts: string[] = [];
  if (parentMoved) parts.push(parentPhrase(from, to));
  if (spaceMoved) parts.push(`passa de ${from.space} para ${to.space}`);
  return `${name} ${parts.join('; ')}`;
}

function placeView(refs: Refs, place: MembershipChange['from']): Place {
  const parent = place.parentId === null ? null : refs.ref('m', place.parentId);
  if (place.containerId === undefined) return { parent };
  return {
    parent,
    container: place.containerId === null ? null : refs.ref('i', place.containerId),
  };
}

function namesOf(refs: Refs, place: MembershipChange['from']): Names {
  return {
    parent: place.parentId === null ? null : refs.markingName(place.parentId),
    space: place.containerId === undefined ? null : refs.imageLabel(place.containerId),
  };
}

function entryView(
  change: MembershipChange,
  before: Refs,
  after: Refs,
): Record<string, unknown> {
  const isMarking = change.kind === 'marking';
  const name = isMarking ? after.markingName(change.id) : after.imageLabel(change.id);
  const kind = isMarking ? 'm' : 'i';
  return {
    kind: change.kind,
    ref: after.ref(kind, change.id),
    name,
    from: placeView(before, change.from),
    to: placeView(after, change.to),
    message: messageOf(name, namesOf(before, change.from), namesOf(after, change.to)),
  };
}

/**
 * A lista `membership`: cada marcação ou container que já existia e cujo pai ou espaço muda
 * no lote. Vazia quando nada muda (o campo não aparece na resposta).
 */
export function membershipView(
  base: Project,
  before: Refs,
  after: Refs,
): Record<string, unknown>[] {
  return membershipChanges(base, after.project).map((change) =>
    entryView(change, before, after),
  );
}
