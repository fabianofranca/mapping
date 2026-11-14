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

// `linkedRef` (SG2): the targets that the sibling `ref` accepts become items of the suggestions
// list of the `string` field/column. No Preact: the UI only connects the result to the editor.

export interface LinkedTargets {
  /** The targets as list items (target text, type name and identifier). */
  readonly items: readonly SuggestionItem[];
  /** The reference of the item with the given `id`; `null` if it no longer exists. */
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

/** Targets of the annotation's `ref` field `linkedRef`. */
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

/** Targets of the `ref` column `linkedRef` of the annotation's table `tableKey`. */
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
