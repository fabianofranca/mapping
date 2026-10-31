import { t } from '../i18n';
import {
  findCellRefTargets,
  findRefTargets,
  refTargetText,
  typeOfAnnotation,
  type Annotation,
  type Project,
  type RefValue,
} from '../model';
import type { SuggestionItem } from './suggestions';
import { labelTexts } from './typedText';

// `linkedRef` (SG2): os alvos que o `ref` irmão aceita viram itens da lista de sugestões do
// campo/coluna `string`. Sem Preact: a UI só liga o resultado ao editor.

export interface LinkedTargets {
  /** Os alvos como itens da lista (texto do alvo, nome do tipo e identificador). */
  readonly items: readonly SuggestionItem[];
  /** A referência do item de `id` dado; `null` se ele não existe mais. */
  find(id: string): RefValue | null;
}

function toTargets(
  project: Project,
  targets: ReturnType<typeof findRefTargets>,
): LinkedTargets {
  const items: SuggestionItem[] = [];
  const refs = new Map<string, RefValue>();
  for (const target of targets) {
    const label = refTargetText(project, target.ref);
    if (label === null) continue;
    const id = JSON.stringify(target.ref);
    refs.set(id, target.ref);
    items.push({
      label,
      detail: typeOfAnnotation(project, target.annotation)?.type.name ?? t('ref.freeTag'),
      id,
    });
  }
  return { items, find: (id) => refs.get(id) ?? null };
}

/** Alvos do campo `ref` `linkedRef` da anotação. */
export function linkedFieldTargets(
  project: Project,
  annotation: Annotation,
  linkedRef: string,
): LinkedTargets {
  return toTargets(
    project,
    findRefTargets(project, annotation.id, linkedRef, labelTexts()),
  );
}

/** Alvos da coluna `ref` `linkedRef` da tabela `tableKey` da anotação. */
export function linkedCellTargets(
  project: Project,
  annotation: Annotation,
  tableKey: string,
  linkedRef: string,
): LinkedTargets {
  return toTargets(
    project,
    findCellRefTargets(project, annotation.id, tableKey, linkedRef, labelTexts()),
  );
}
