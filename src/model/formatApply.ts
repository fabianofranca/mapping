import {
  addBatchTypedAnnotation,
  createBatchAnnotation,
  createBatchArrow,
  setBatchValues,
  updateBatchAnnotation,
  type AnnotationResolver,
  type CreateAnnotationArgs,
  type CreateArrowArgs,
  type RoleCleared,
  type RowAliases,
  type RowAliasTarget,
  type UpdateAnnotationArgs,
} from './batchAnnotations';
import {
  BatchRuleError,
  addBatchBackgroundContainer,
  applyContainerSettings,
  createBatchMarking,
  updateBatchMarking,
  type ContainerSettingsArgs,
  type CreateMarkingArgs,
  type MarkingContext,
  type UpdateMarkingArgs,
} from './batchMarkings';
import {
  aliasKindLabel,
  containerPageArg,
  guardMinSize,
  markingRootPageId,
  resolveBeside,
  resolveItem,
  resolveLayer,
  resolveNearTarget,
  resolveType,
  type AliasKind,
  type RefContext,
} from './batchRefs';
import { markingTypeName, type ComponentCatalog } from './componentCatalog';
import { componentTypes, type ComponentType } from './componentMarkings';
import type { TextMeasurer } from './components/instantiate';
import { ModelError } from './errors';
import type { FormatInput, FormatOperation, FormatResult } from './formatPlugin';
import { refImageLabel, shortCode } from './itemRef';
import { projectIndex } from './projectIndex';
import { projectLayerFor } from './specLookup';
import type { Layer, Project } from './types';

// Applying what a format plugin's `parse` returned (stage #2035, decision 8): the six operations of a
// checked result (`checkFormatResult`) go through the same rules as the MCP batch (`batchMarkings.ts` and
// `batchAnnotations.ts`), with the result's own local aliases (`$name`) and the references of the plugin's
// input (`mapping://…` or codes). All or nothing: the first operation that breaks a rule gives the error at
// its index and the project stays as it was. Pure: no DOM, no I/O; the caller hands the project, the
// component catalog and the text measurer, and keeps what is its own (the save, the undo entry, the summary).

/** A created or changed item: `i` container, `m` marking or arrow, `a` annotation. */
export interface AppliedItem {
  readonly kind: 'i' | 'm' | 'a';
  readonly id: string;
}

/** The error of an operation of the result: where it is, the model's code and message, and what raised it. */
export interface FormatApplyError {
  /** Index in `operations`: the path is `operations[index]`. */
  readonly index: number;
  readonly op: string;
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  /** The error that was thrown (a `BatchRuleError` or a `ModelError`), for a caller that words it its own way. */
  readonly cause: unknown;
}

/** A role the result cleared by moving or unlinking an annotation (the MCP reports it as a warning). */
export interface FormatRoleCleared extends RoleCleared {
  readonly index: number;
}

export type FormatApplyOutcome =
  | {
      readonly ok: true;
      readonly project: Project;
      readonly created: readonly AppliedItem[];
      /** Existing items an operation changed (`update_marking`, `update_annotation`), once each. */
      readonly updated: readonly AppliedItem[];
      /** What the rules noted (a component missing from the catalog, an ignored `near`, …). */
      readonly notes: readonly string[];
      /** The plugin's own warnings, as the result carried them. */
      readonly warnings: readonly string[];
      readonly rolesCleared: readonly FormatRoleCleared[];
    }
  | { readonly ok: false; readonly error: FormatApplyError };

export interface FormatApplyOptions {
  /** The projection the plugin received: the project's name (references cite it) and the format. */
  readonly input: Pick<FormatInput, 'project'>;
  readonly catalog: ComponentCatalog;
  readonly measure: TextMeasurer;
  /** The page of the containers the result creates without naming one (`beside` already gives it). */
  readonly page?: string | undefined;
  /** Readable labels for the rules' messages; the default is the item's name or its short code. */
  readonly labels?: {
    markingLabel(p: Project, id: string): string;
    containerLabel(p: Project, id: string): string;
  };
}

type Alias = { readonly kind: AliasKind; readonly id: string } | RowAliasTarget;

// The operations as the rules take them. A result's values come from a plugin: the caller checks their types
// (the MCP with the operations' schema) before handing the result over; a rule that trips on a wrong type
// still gives `plugin-output-invalid` at the operation's index.
type AddContainerOp = Parameters<typeof addBatchBackgroundContainer>[1] &
  ContainerSettingsArgs & {
    readonly as?: string;
    readonly page?: string;
    readonly beside?: string;
  };
type CreateMarkingOp = CreateMarkingArgs & { readonly as?: string };
type UpdateMarkingOp = UpdateMarkingArgs & { readonly marking: string };
type CreateAnnotationOp = CreateAnnotationArgs & { readonly as?: string };
type CreateArrowOp = CreateArrowArgs & { readonly as?: string };

function defaultMarkingLabel(p: Project, id: string): string {
  const marking = projectIndex(p).markings.get(id);
  if (marking?.name) return marking.name;
  const typeName = marking ? markingTypeName(p, id) : null;
  return `${typeName ?? 'Marking'} ${shortCode(p, 'm', id)}`;
}

function defaultContainerLabel(p: Project, id: string): string {
  const container = projectIndex(p).containers.get(id);
  return (container && refImageLabel(container)) ?? id;
}

/** One application of a result: the project as it stands, the local aliases and what each operation made. */
class ResultApplier {
  private p: Project;
  private readonly aliases = new Map<string, Alias>();
  private readonly created: AppliedItem[] = [];
  private readonly touched: AppliedItem[] = [];
  private readonly notes: string[] = [];
  private readonly rolesCleared: FormatRoleCleared[] = [];
  private componentTypesCache: {
    specs: Project['specializations'];
    map: ReadonlyMap<string, ComponentType>;
  } | null = null;
  private index = 0;

  constructor(
    project: Project,
    private readonly options: FormatApplyOptions,
  ) {
    this.p = project;
  }

  run(result: FormatResult): FormatApplyOutcome {
    for (const [i, op] of result.operations.entries()) {
      this.index = i;
      try {
        this.apply(op);
      } catch (error) {
        return { ok: false, error: this.describe(i, op.op, error) };
      }
    }
    return {
      ok: true,
      project: this.p,
      created: this.created,
      updated: onlyExisting(this.touched, this.created),
      notes: this.notes,
      warnings: result.warnings ?? [],
      rolesCleared: this.rolesCleared,
    };
  }

  /** The thrown error as the result's error at `operations[index]`. */
  private describe(index: number, op: string, error: unknown): FormatApplyError {
    if (error instanceof BatchRuleError) {
      return {
        index,
        op,
        code: error.code,
        message: error.message,
        details: error.details,
        cause: error,
      };
    }
    if (error instanceof ModelError) {
      return {
        index,
        op,
        code: error.code,
        message: error.message,
        details: {},
        cause: error,
      };
    }
    // A value of the wrong type that the plugin result check cannot see (it checks shape and references).
    const message = error instanceof Error ? error.message : String(error);
    return {
      index,
      op,
      code: 'plugin-output-invalid',
      message: `operations[${index}]: ${message}`,
      details: { path: `operations[${index}]` },
      cause: error,
    };
  }

  // ------------------------------------------------------------------ references

  private refContext(): RefContext {
    return {
      projectName: this.options.input.project.name,
      alias: (name, kind) => this.alias(name, kind),
      containerAlias: (name) => {
        const target = this.aliases.get(name);
        return target && target.kind === 'i' && 'id' in target ? target : undefined;
      },
    };
  }

  private alias(name: string, kind: AliasKind): { readonly id: string } {
    const target = this.aliases.get(name);
    if (!target) {
      throw new BatchRuleError(
        'unknown-alias',
        `unknown alias: ${name} (create the item with "as" in an earlier operation)`,
        { alias: name },
      );
    }
    if (target.kind !== kind) {
      throw new BatchRuleError(
        'wrong-kind',
        `the alias ${name} is not ${aliasKindLabel(kind)}`,
      );
    }
    return { id: 'id' in target ? target.id : '' };
  }

  private labels(): NonNullable<FormatApplyOptions['labels']> {
    return (
      this.options.labels ?? {
        markingLabel: defaultMarkingLabel,
        containerLabel: defaultContainerLabel,
      }
    );
  }

  private layer(ref: string, p: Project): Layer {
    return resolveLayer(
      this.refContext(),
      p,
      ref,
      (specId, layerId) => projectLayerFor(p, specId, layerId) ?? null,
    );
  }

  private annotationRefs(): AnnotationResolver {
    const rc = this.refContext();
    return {
      marking: (ref) => resolveItem(rc, this.p, ref, 'm'),
      annotation: (ref, p) => resolveItem(rc, p, ref, 'a'),
      layer: (ref, p) => this.layer(ref, p),
      type: (ref, p) => resolveType(p, ref),
      rowAlias: (name) => {
        const target = this.aliases.get(name);
        if (target?.kind !== 'row') this.alias(name, 'row');
        return target as RowAliasTarget;
      },
      aliasTaken: (name) => this.aliases.has(name),
      markingLabel: (p, id) => this.labels().markingLabel(p, id),
    };
  }

  private componentTypeMap(p: Project): ReadonlyMap<string, ComponentType> {
    const cached = this.componentTypesCache;
    if (cached?.specs === p.specializations) return cached.map;
    const map = new Map<string, ComponentType>();
    for (const t of componentTypes(p, this.options.catalog)) {
      // The first one wins, like the `find` by specialization and type.
      const key = `${t.specId}/${t.typeId}`;
      if (!map.has(key)) map.set(key, t);
    }
    this.componentTypesCache = { specs: p.specializations, map };
    return map;
  }

  private markingContext(rowAliases: RowAliases): MarkingContext {
    const rc = this.refContext();
    const labels = this.labels();
    const res = this.annotationRefs();
    return {
      catalog: this.options.catalog,
      measurer: this.options.measure,
      refs: {
        marking: (ref) => resolveItem(rc, this.p, ref, 'm'),
        container: (ref, p = this.p) => resolveItem(rc, p, ref, 'i'),
        layer: (ref) => this.layer(ref, this.p),
        type: (ref) => resolveType(this.p, ref),
        nearTarget: (ref) => resolveNearTarget(rc, this.p, ref),
        pageFor: (p, containerId, args) =>
          markingRootPageId(rc, p, args, containerId, args),
        componentType: (p, type) =>
          this.componentTypeMap(p).get(`${type.specId}/${type.typeId}`) ?? null,
        markingLabel: labels.markingLabel,
        containerLabel: labels.containerLabel,
        guardMinSize,
      },
      annotate: {
        typed: (p, id, markingId, args) =>
          addBatchTypedAnnotation(
            res,
            p,
            id,
            markingId,
            { ...args, ownerId: null },
            rowAliases,
          ),
        setValues: (p, annotationId, values) =>
          setBatchValues(res, p, annotationId, values, rowAliases),
      },
    };
  }

  // ------------------------------------------------------------------ operations

  /** The local aliases a created item and a created row take (the first item `as`, the second `annotationAs`). */
  private define(
    names: readonly (string | undefined)[],
    created: readonly AppliedItem[],
    rows: RowAliases,
  ): void {
    for (const [rowAlias] of rows) {
      if (names.includes(rowAlias)) {
        throw new BatchRuleError(
          'duplicate-alias',
          `alias repeated in the batch: ${rowAlias}`,
        );
      }
    }
    for (const [name, target] of rows) this.aliases.set(name, target);
    for (const [n, item] of created.entries()) {
      const named = names[n];
      if (named !== undefined) this.aliases.set(named, item);
    }
  }

  private apply(op: FormatOperation): void {
    switch (op.op) {
      case 'add_container':
        return this.addContainer(op as unknown as AddContainerOp);
      case 'create_marking':
        return this.createMarking(op as unknown as CreateMarkingOp);
      case 'update_marking':
        return this.updateMarking(op as unknown as UpdateMarkingOp);
      case 'create_annotation':
        return this.createAnnotation(op as unknown as CreateAnnotationOp);
      case 'update_annotation':
        return this.updateAnnotation(op as unknown as UpdateAnnotationArgs);
      case 'create_arrow':
        return this.createArrow(op as unknown as CreateArrowOp);
    }
  }

  private checkAliasNames(names: readonly (string | undefined)[]): void {
    for (const name of names) {
      if (name !== undefined && this.aliases.has(name)) {
        throw new BatchRuleError(
          'duplicate-alias',
          `alias repeated in the plugin result: ${name}`,
        );
      }
    }
  }

  private addContainer(op: AddContainerOp): void {
    this.checkAliasNames([op.as]);
    const rc = this.refContext();
    const page =
      op.page === undefined && op.beside === undefined ? this.options.page : op.page;
    const made = addBatchBackgroundContainer(this.p, op, () => {
      const beside = resolveBeside(op, (ref) => resolveItem(rc, this.p, ref, 'i'));
      return {
        ...(beside !== undefined ? { beside } : {}),
        ...containerPageArg(rc, this.p, page, beside),
      };
    });
    const settings = applyContainerSettings(made.project, made.id, op);
    this.p = settings.project;
    const item: AppliedItem = { kind: 'i', id: made.id };
    this.created.push(item);
    this.define([op.as], [item], []);
  }

  private createMarking(op: CreateMarkingOp): void {
    this.checkAliasNames([op.as, op.annotationAs]);
    const rowAliases: RowAliases = [];
    const made = createBatchMarking(this.markingContext(rowAliases), this.p, op);
    this.p = made.project;
    this.notes.push(...made.notes);
    const created: AppliedItem[] = [
      { kind: 'm', id: made.markingId },
      ...(made.annotationId ? [{ kind: 'a' as const, id: made.annotationId }] : []),
    ];
    this.created.push(...created);
    this.define([op.as, op.annotationAs], created, rowAliases);
  }

  private updateMarking(op: UpdateMarkingOp): void {
    const rc = this.refContext();
    const id = resolveItem(rc, this.p, op.marking, 'm');
    if (projectIndex(this.p).arrows.has(id)) {
      throw new BatchRuleError(
        'wrong-kind',
        'the reference is to an arrow, not to a marking',
        { hint: 'use update_arrow for the arrow' },
      );
    }
    const { project } = updateBatchMarking(this.markingContext([]), this.p, id, op);
    this.touched.push({ kind: 'm', id });
    this.p = project;
  }

  private createAnnotation(op: CreateAnnotationOp): void {
    this.checkAliasNames([op.as]);
    const made = createBatchAnnotation(this.annotationRefs(), this.p, op);
    this.p = made.project;
    const item: AppliedItem = { kind: 'a', id: made.annotationId };
    this.created.push(item);
    this.define([op.as], [item], made.rowAliases);
  }

  private updateAnnotation(op: UpdateAnnotationArgs): void {
    const made = updateBatchAnnotation(this.annotationRefs(), this.p, op);
    this.p = made.project;
    this.touched.push({ kind: 'a', id: made.annotationId });
    if (made.roleCleared) {
      this.rolesCleared.push({ index: this.index, ...made.roleCleared });
    }
    this.define([], [], made.rowAliases);
  }

  private createArrow(op: CreateArrowOp): void {
    this.checkAliasNames([op.as]);
    const made = createBatchArrow(this.annotationRefs(), this.p, op);
    this.p = made.project;
    const item: AppliedItem = { kind: 'm', id: made.id };
    this.created.push(item);
    this.define([op.as], [item], []);
  }
}

/** The items of `touched` that existed before (an item the result created and then changed is not an update), once each. */
function onlyExisting(
  touched: readonly AppliedItem[],
  created: readonly AppliedItem[],
): AppliedItem[] {
  const made = new Set(created.map((c) => c.id));
  const seen = new Set<string>();
  return touched.filter((t) => {
    if (made.has(t.id) || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/**
 * Applies a plugin result that `checkFormatResult` already accepted to `project`, all or nothing: the new
 * project and what was created and changed, or the first operation that broke a rule, at its index. The
 * result's references and codes are those of `options.input` (the projection the plugin read) and its `$`
 * aliases the ones it defined in earlier operations.
 */
export function applyFormatResult(
  project: Project,
  result: FormatResult,
  options: FormatApplyOptions,
): FormatApplyOutcome {
  return new ResultApplier(project, options).run(result);
}
