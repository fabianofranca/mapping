import {
  containerClassIn,
  type SpecContainerClass,
  type SpecContainerClassSet,
} from './containerClasses';
import { findById } from './project';
import { memoByProject, projectIndex } from './projectIndex';
import {
  acceptContextOf,
  isTargetAccepted,
  parseRefValue,
  resolveRef,
  tableRows,
} from './refs';
import {
  fieldOf,
  isAllowedOwner,
  ownerRolesOf,
  specLayerOf,
  typeOfAnnotation,
  type ResolvedType,
} from './specLookup';
import { checkSimpleValue, isEmptyValue } from './typed';
import { typeAppliesTo, type SpecRefAccepts } from './spec';
import type { Annotation, JsonValue, Project } from './types';

// Issues ("incomplete", docs/ARCHITECTURE.md, "Specializations in the project and typed annotations"):
// computed from the project and the specializations, never stored. Saving incomplete is always
// allowed.

export type AnnotationIssueCode =
  /** Empty required field (including a required column in a row). */
  | 'required-empty'
  /** Value incompatible with the field's type. */
  | 'invalid-value'
  /** `enum` value outside the `options`. */
  | 'unknown-option'
  /** Key that does not exist in the type. */
  | 'unknown-field'
  /** The type (or the specialization) no longer exists. */
  | 'unknown-type'
  /** Typed outside its type's layer, or free in a specialization layer. */
  | 'layer-mismatch'
  /** Type with `requiresOwner` and no owner. */
  | 'missing-owner'
  /** Owner whose type does not list this one in `allowedChildren`. */
  | 'owner-not-allowed'
  /** The owner has `childRoles` and this annotation has no role (v14). */
  | 'missing-role'
  /** The role does not exist on the owner (or the owner has no `childRoles`) (v14). */
  | 'unknown-role'
  /** The type no longer applies to the owner (marking or arrow) after an update. */
  | 'type-not-applicable'
  /**
   * The marking's container has a class outside the type's `appliesIn` (stage #1901, decisions 7 and 9):
   * one item per failing set, with `set`, `class` and `allowed`.
   */
  | 'outside-container-class'
  /** The reference's target no longer exists. */
  | 'broken-ref'
  /** The target exists but is not accepted by the field (lost its label, stopped being free). */
  | 'ref-not-accepted'
  /**
   * The component that draws the marking does not fit in the box (Library stage). The model does
   * not produce it: whoever has the drawing (`src/store/derived.ts`) adds it to the issues.
   */
  | 'component-overflow'
  /**
   * The child marking's slot does not accept its type (stage #1080, decision 10). The model does not
   * produce it: it is born in the drawing cache, which knows which slot each child is in.
   */
  | 'slot-not-accepted'
  /** The child is beyond the `max` of its slot (the same origin as `slot-not-accepted`). */
  | 'slot-full'
  /** The child is in a slot hidden by its `visible`: it stays in the slot and in the code, and is not drawn (#1978). */
  | 'slot-hidden'
  /**
   * The accessible label is empty (stage #1126, `accessibility.label.required`), on the type or on a
   * part. Not produced by `projectIssues`: `accessibilityAudit` (`accessibility.ts`) does.
   */
  | 'accessible-label-missing';

export interface AnnotationIssue {
  readonly code: AnnotationIssueCode;
  /** Field involved. */
  readonly key?: string;
  /** Table row involved (the `_id`). */
  readonly rowId?: string;
  /** Table column involved. */
  readonly column?: string;
  /** `slot-not-accepted`, `slot-full` and `slot-hidden`: the slot of the owner that the child is in. */
  readonly slot?: { readonly id: string; readonly name: string };
  /** `slot-not-accepted`, `slot-full` and `slot-hidden`: the name of the owner's type (the one that has the slot). */
  readonly owner?: string;
  /** `slot-full`: the number of children the slot takes. */
  readonly max?: number;
  /** `outside-container-class`: the set that fails (`id` and name). */
  readonly set?: { readonly id: string; readonly name: string };
  /** `outside-container-class`: the class the container has in that set. */
  readonly class?: { readonly id: string; readonly name: string };
  /** `outside-container-class`: the classes the type is meant for, in the set's order. */
  readonly allowed?: readonly { readonly id: string; readonly name: string }[];
  /** `accessible-label-missing` of a part: the part (`id` and its name, `id` by default). */
  readonly part?: { readonly id: string; readonly name: string };
}

/** Issue of a reference (`ref` field or `ref` column cell); `null` if it is fine. */
function refProblem(
  p: Project,
  a: Annotation,
  accepts: SpecRefAccepts,
  value: JsonValue,
): 'invalid-value' | 'broken-ref' | 'ref-not-accepted' | null {
  const ref = parseRefValue(value);
  if (!ref) return 'invalid-value';
  const target = resolveRef(p, ref);
  if (!target) return 'broken-ref';
  return ref.annotationId === a.id ||
    !isTargetAccepted(target, accepts, acceptContextOf(p, a.id))
    ? 'ref-not-accepted'
    : null;
}

/**
 * `outside-container-class` (decision 7): for each set the type lists in `appliesIn`, in which the
 * marking's container has a class, that class must be in the list. A canvas marking, a floating one
 * and an annotation on an arrow are not checked; a set with no class (a chosen set with no choice)
 * checks nothing.
 */
function containerClassIssues(
  p: Project,
  a: Annotation,
  resolved: ResolvedType,
): AnnotationIssue[] {
  const { appliesIn } = resolved.type;
  if (appliesIn === undefined) return [];
  const index = projectIndex(p);
  const marking = index.markings.get(a.markingId);
  const container =
    marking === undefined || marking.floating || marking.containerId === null
      ? undefined
      : index.containers.get(marking.containerId);
  if (container === undefined) return [];
  const sets = resolved.spec.containerClasses ?? [];
  return Object.entries(appliesIn).flatMap(([setId, allowedIds]) => {
    const set = sets.find((x) => x.id === setId);
    const found = set && containerClassIn(p, container, set);
    return set && found && !allowedIds.includes(found.id)
      ? [outsideItem(set, found, allowedIds)]
      : [];
  });
}

/** The `outside-container-class` item of one set: the class the container has and the ones allowed. */
function outsideItem(
  set: SpecContainerClassSet,
  found: SpecContainerClass,
  allowedIds: readonly string[],
): AnnotationIssue {
  return {
    code: 'outside-container-class',
    set: { id: set.id, name: set.name },
    class: { id: found.id, name: found.name },
    allowed: set.classes
      .filter((c) => allowedIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

function annotationIssues(p: Project, a: Annotation): AnnotationIssue[] {
  const issues: AnnotationIssue[] = [];
  const index = projectIndex(p);
  const layer = index.layers.get(a.layerId);

  if (!a.type || !a.values) {
    if (layer?.spec) issues.push({ code: 'layer-mismatch' });
    return issues;
  }

  const resolved = typeOfAnnotation(p, a);
  if (!resolved) return [{ code: 'unknown-type' }];
  const { type } = resolved;
  const values = a.values;

  if (!layer || !layer.spec || layer.spec.specId !== a.type.specId) {
    issues.push({ code: 'layer-mismatch' });
  } else if (specLayerOf(p, layer)?.id !== resolved.layer.id) {
    issues.push({ code: 'layer-mismatch' });
  }

  if (!typeAppliesTo(type, index.arrows.has(a.markingId) ? 'arrow' : 'marking')) {
    issues.push({ code: 'type-not-applicable' });
  }
  issues.push(...containerClassIssues(p, a, resolved));

  for (const key of Object.keys(values)) {
    if (!fieldOf(type, key)) issues.push({ code: 'unknown-field', key });
  }

  for (const field of type.fields) {
    const { key } = field;
    const value: JsonValue | undefined = values[key];
    if (field.type === 'table') {
      if (value !== undefined && value !== null && !Array.isArray(value)) {
        issues.push({ code: 'invalid-value', key });
        continue;
      }
      const rows = Array.isArray(value) ? value : [];
      if (rows.length === 0 && field.required)
        issues.push({ code: 'required-empty', key });
      if (tableRows(value).length !== rows.length)
        issues.push({ code: 'invalid-value', key });
      for (const row of tableRows(value)) {
        const rowId = row._id;
        for (const col of Object.keys(row)) {
          if (col !== '_id' && !field.columns.some((c) => c.key === col)) {
            issues.push({ code: 'unknown-field', key, rowId, column: col });
          }
        }
        for (const col of field.columns) {
          const cell = row[col.key];
          if (cell === undefined || isEmptyValue(cell)) {
            if (col.required) {
              issues.push({ code: 'required-empty', key, rowId, column: col.key });
            }
            continue;
          }
          const problem =
            col.type === 'ref'
              ? refProblem(p, a, col.accepts, cell)
              : checkSimpleValue(col, cell);
          if (problem) issues.push({ code: problem, key, rowId, column: col.key });
        }
      }
      continue;
    }
    if (value === undefined || isEmptyValue(value)) {
      if (field.required) issues.push({ code: 'required-empty', key });
      continue;
    }
    if (field.type === 'ref') {
      const problem = refProblem(p, a, field.accepts, value);
      if (problem) issues.push({ code: problem, key });
      continue;
    }
    const problem = checkSimpleValue(field, value);
    if (problem) issues.push({ code: problem, key });
  }

  if (a.parentAnnotationId === null) {
    if (type.requiresOwner) issues.push({ code: 'missing-owner' });
  } else {
    const owner = index.annotations.get(a.parentAnnotationId);
    // An owner of a nonexistent type already shows up as an issue on itself.
    const ownerUnknown = owner?.type != null && typeOfAnnotation(p, owner) === null;
    if (owner && !ownerUnknown && !isAllowedOwner(p, a.type, owner)) {
      issues.push({ code: 'owner-not-allowed' });
    }
    if (owner && !ownerUnknown) issues.push(...roleIssues(p, a, owner));
  }
  return issues;
}

/**
 * Role issues (v14): an owner with `childRoles` and a child with no role (`missing-role`); a role
 * the owner does not offer, including an owner with no `childRoles` (`unknown-role`). A free
 * owner or one of an unknown type does not generate a role issue.
 */
function roleIssues(p: Project, a: Annotation, owner: Annotation): AnnotationIssue[] {
  if (owner.type === null) return [];
  const offered = ownerRolesOf(p, owner);
  if (a.parentRole === null) return offered ? [{ code: 'missing-role' }] : [];
  const known = offered?.roles.some((r) => r.id === a.parentRole) ?? false;
  return known ? [] : [{ code: 'unknown-role' }];
}

/** Issues of the annotation; empty = complete. */
export function getAnnotationIssues(p: Project, annotationId: string): AnnotationIssue[] {
  const issues = projectIssues(p).get(findById(p.annotations, annotationId).id);
  return issues ? [...issues] : [];
}

/**
 * Issues of the project, computed once per project version (the same map
 * for the same version). Read-only.
 */
export const projectIssues: (
  p: Project,
) => ReadonlyMap<string, readonly AnnotationIssue[]> = memoByProject((p) => {
  const result = new Map<string, readonly AnnotationIssue[]>();
  for (const a of p.annotations) {
    const issues = annotationIssues(p, a);
    if (issues.length > 0) result.set(a.id, issues);
  }
  return result;
});
