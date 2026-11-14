import {
  ModelError,
  NOTICE_KINDS,
  changeNotices,
  type Change,
  type SpecNotice,
  addAnnotation,
  addBackgroundContainer,
  addComponentMarking,
  addContainer,
  addLayer,
  addTableRow,
  addTypedAnnotation,
  arrowDeletionImpact,
  createArrow,
  placeFloatingNear,
  removeArrow,
  setArrowLocked,
  setArrowName,
  setArrowStyle,
  type FloatingNearTarget,
  annotationDeletionImpact,
  annotationShortLabel,
  applySpecialization,
  checkSpecApply,
  SHORT_CODE_LENGTH,
  normalizeId,
  componentFileMinSize,
  effectiveDensity,
  componentMinSize,
  componentPlacement,
  componentSize,
  fitMarking,
  snapToAnchor,
  setMarkingAnchor,
  setNewMarkingAnchor,
  checkAnchorTarget,
  componentAnchoredPlacement,
  typeAnchorDefaults,
  markingAnchorDefaults,
  type MarkingAnchor,
  placementFitsSlot,
  hasComponentSlot,
  componentTypes,
  findSpecType,
  loadSpecComponents,
  type ComponentCatalog,
  type ComponentType,
  type TextMeasurer,
  confirmMarkingReview,
  createMarking,
  reorderMarking,
  setBackgroundContainer,
  siblingPosition,
  extensionForMime,
  fieldOf,
  getSpecialization,
  packageDirOf,
  containerDeletionImpact,
  layerDeletionImpact,
  markingDeletionImpact,
  matchShortCode,
  moveLayer,
  moveMarking,
  moveTableRow,
  nextLayerColor,
  parseRef,
  pastedFileName,
  projectIndex,
  projectIssues,
  projectLayerFor,
  removeAnnotation,
  removeContainer,
  removeLayer,
  removeMarking,
  removeDocRepo,
  removePlatformRepo,
  removeSpecialization,
  removeTableRow,
  renameAnnotation,
  renameContainer,
  renameLayer,
  renameMarking,
  replaceContainer,
  roleNameOf,
  setAnnotationParent,
  setAnnotationRole,
  setDocRepo,
  setEntries,
  setFieldValue,
  setImageLocked,
  setContainerDensity,
  setContainerDirection,
  setContainerDrawingMode,
  setContainerMarkingColor,
  setProjectDirection,
  setProjectDrawingMode,
  setImageMarkingsLocked,
  setContainerPlacement,
  setImageSource,
  setLayerColor,
  setMarkingLocked,
  setMarkingFloating,
  setMarkingRect,
  setMarkingSpace,
  setMarkingSource,
  setPlatformRepo,
  setTableCell,
  specializationRemovalImpact,
  tableRows,
  typeKey,
  typeOfAnnotation,
  updateSpecialization,
  uniqueImageFile,
  validateProject,
  type Annotation,
  type AnnotationTypeRef,
  type EntryInput,
  type ExternalSource,
  type ItemKind,
  type JsonValue,
  type Layer,
  type Marking,
  type Project,
  type Rect,
  type RefValue,
  type Spec,
  type SpecField,
  type SpecUpdateImpact,
  canWrapItems,
  wrapItems,
  type ItemRef,
} from '../src/model';
import type { LibraryIssue } from '../src/model/library';
import { ToolError } from './errors';
import {
  checkUpdate,
  packageFileEntries,
  parsePackage,
  requireValid,
  updateSummary,
  validatePackage,
} from './libraryUpdate';
import type { ReadPackage, SpecInput } from './library';
import { MAX_BASE64_LENGTH, MIME, detectFormat } from './image/formats';
import { builtinFontBook, measurerFor } from './image/textMeasurer';
import { prepareImage } from './imagePrepare';
import { INVALID_REF_HINT, KIND_NOT_FOUND, KIND_WITH_ARTICLE, Refs } from './items';
import { containersNamed } from './markingList';
import {
  MODEL_ERROR_MESSAGES,
  describeModelError,
  rectTooSmallDetail,
  MODEL_ERROR_HINTS,
} from './modelErrors';
import { measuredTree, planMeasured } from './importMeasured';
import type { Operation } from './operations';
import type { LoadedProject } from './projects';

// The `plan_changes` batch: applies the operations in order on a copy of the project, always through
// the pure functions of `src/model/` (which enforce invariants, locks, specializations and links).
// Nothing is written here: the result (project and new files) goes to `apply_changes`.

/** Reading of files cited by the agent (images and specializations), inside the roots. */
export interface BatchIo {
  readSource(
    path: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly name: string }>;
  /**
   * Reads what a specialization operation points to: the file of a v1 to v3 specialization,
   * or the folder of a v4 package (also from the specialization file inside it).
   */
  readSpecInput(path: string): Promise<SpecInput>;
  /** Files that already exist in `images/` on disk (`images/…`), so they are not overwritten. */
  readonly takenImageFiles: ReadonlySet<string>;
  /**
   * Project read from the folder, when the batch starts from another one (the proposal review starts
   * from the whole proposed project): the arrows warning compares with it, not with what was already proposed.
   */
  readonly diskProject?: Project;
  now(): Date;
}

type AliasTarget =
  | { readonly kind: 'layer' | ItemKind; readonly id: string }
  | {
      readonly kind: 'row';
      readonly annotationId: string;
      readonly key: string;
      readonly rowId: string;
    };

type CreatedKind = 'layer' | ItemKind;

export interface CreatedItem {
  readonly index: number;
  readonly kind: CreatedKind;
  readonly id: string;
  readonly alias?: string;
}

export interface OperationError {
  readonly index: number;
  readonly op: string;
  readonly code: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

export interface BatchResult {
  readonly before: Project;
  readonly project: Project;
  readonly errors: readonly OperationError[];
  /** One readable line per valid operation. */
  readonly steps: readonly { readonly index: number; readonly description: string }[];
  readonly created: readonly CreatedItem[];
  readonly aliases: ReadonlyMap<string, AliasTarget>;
  /** Content of the new images, by file (`images/…`). */
  readonly imageFiles: ReadonlyMap<string, Uint8Array>;
  /**
   * Files of the library packages applied or updated, by the final path in the
   * project (`specs/<folder>/<relative>`): the proposal stores them in `proposals/<id>/…`.
   */
  readonly packageFiles: ReadonlyMap<string, Uint8Array>;
  /** Warnings from the package validation (they block nothing). */
  readonly libraryWarnings: readonly LibraryWarning[];
  /** Old operations accepted with a warning (e.g. `add_blank_image` → `add_container`). */
  readonly deprecations: readonly {
    readonly index: number;
    readonly op: string;
    readonly message: string;
    /** Code of the warning in the report; absent = `deprecated-op`. */
    readonly code?: string;
  }[];
  /** Roles that an owner change cleared without the step asking for it (`role-cleared` warning). */
  readonly rolesCleared: readonly RoleCleared[];
  /** Cross-collection rules violated by the result (should not happen). */
  readonly invariantIssues: readonly string[];
  /** Component catalog after the batch (with the specializations it applied, updated or removed). */
  readonly catalog: ComponentCatalog;
}

/** Role cleared by the owner change in `update_annotation`: becomes the `role-cleared` warning. */
export interface RoleCleared {
  readonly index: number;
  readonly annotationId: string;
  readonly role: string;
  readonly roleName: string;
  readonly message: string;
}

/** Warning from the library validator, with the originating operation and specialization. */
export interface LibraryWarning {
  readonly index: number;
  readonly specId: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

/** The specialization read from an operation and, if it is a v4 package, the already validated package. */
interface LoadedSpec {
  readonly spec: Spec;
  /** Only on update: the impact (the contract already checked). */
  readonly impact?: SpecUpdateImpact;
  readonly package?: {
    readonly pkg: ReadPackage;
    readonly specName: string;
    readonly warnings: readonly LibraryIssue[];
  };
}

interface Step {
  readonly project: Project;
  /** Role that the owner change cleared without the step asking for it. */
  readonly roleCleared?: Omit<RoleCleared, 'index'>;
  /** Warnings of the operation (ignored argument…): they go to the response's `warnings`. */
  readonly notes?: readonly string[];
  /** Library package carried by the operation: final folder and its files. */
  readonly packageFiles?: readonly [string, Uint8Array][];
  readonly warnings?: readonly LibraryIssue[];
  readonly specId?: string;
  readonly description: string;
  readonly created?: readonly { kind: CreatedKind; id: string }[];
  readonly rowAliases?: readonly [string, AliasTarget][];
  readonly imageFiles?: readonly [string, Uint8Array][];
}

const KIND_LABEL: Record<CreatedKind, string> = {
  layer: 'a layer',
  ...KIND_WITH_ARTICLE,
};

/** Old operations accepted with a warning for one version (MCP 0.8.0), with what to use instead. */
const DEPRECATED_OPS: Partial<Record<Operation['op'], string>> = {
  add_image: 'add_image is old: use add_container with `file` (or `base64`)',
  add_blank_image:
    'add_blank_image is old: use add_container (same fields: width, height and background)',
  update_image:
    'update_image is old: use update_container (the `image` argument became `container`)',
  replace_image:
    'replace_image is old: use replace_container (the `image` argument became `container`)',
  delete_image:
    'delete_image is old: use delete_container (the `image` argument became `container`)',
};

/**
 * The simple values (text, number, empty) of `annotation.values` for measuring the size of the new
 * instance (decision 16 of #898): table and reference do not count (they stay on the `default`).
 */
function initialValuesArg(values: Record<string, JsonValue> | undefined): {
  values?: Record<string, JsonValue>;
} {
  if (values === undefined) return {};
  const simple = Object.entries(values).filter(
    ([, value]) =>
      value === null || typeof value === 'string' || typeof value === 'number',
  );
  return simple.length === 0 ? {} : { values: Object.fromEntries(simple) };
}

/** Some value is a table (list of rows): `initialValuesArg` leaves it out of the measurement. */
function hasTableValue(values: Record<string, JsonValue>): boolean {
  return Object.values(values).some((value) => Array.isArray(value));
}

/** Lowercase and without accents, to find layers and types by name. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** The name in quotes and a space, or nothing (for sentences like "container <name> with …"). */
const nameLabel = (name: string | undefined): string =>
  name === undefined ? '' : `${quoted(name)} `;

function quoted(text: string | null): string {
  return text === null ? '(unnamed)' : `"${text}"`;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Safe file name for `images/`: just the name, without folders, control characters or a leading dot. */
function safeFileName(input: string, fallback: string): string {
  const base = input.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned === '' || cleaned.startsWith('.') ? fallback : cleaned;
}

function decodeBase64(text: string): Uint8Array {
  const payload = text.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  // Before decoding: the `Buffer` of a huge text would already be the memory peak.
  if (payload.length > MAX_BASE64_LENGTH) {
    throw new ToolError(
      'image-too-large',
      `base64 content too large (${payload.length} characters; maximum ${MAX_BASE64_LENGTH}): send large images through \`file\``,
    );
  }
  if (payload === '' || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(payload)) {
    throw new ToolError('invalid-base64', 'empty or invalid base64 content');
  }
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

/** The operation's `source` → the model's `ExternalSource` (`url` omitted = no link). */
function toSource(
  input: { system: string; id: string; url?: string | null | undefined } | null,
): ExternalSource | null {
  return input === null
    ? null
    : { system: input.system, id: input.id, url: input.url ?? null };
}

/** Short label of the source in the summaries: `figma:3f2a` or `no source`. */
function sourceLabel(source: ExternalSource | null): string {
  return source === null ? 'no source' : `source ${source.system}:${source.id}`;
}

/** Catalog without the specialization `specId`. */
function withoutSpec(catalog: ComponentCatalog, specId: string): ComponentCatalog {
  if (!catalog.has(specId)) return catalog;
  const next = new Map(catalog);
  next.delete(specId);
  return next;
}

/**
 * Catalog after applying or updating a specialization in the batch: its entry is rebuilt
 * with the package files that the operation carried (`packageFiles`, by the final path).
 * A specialization without a package (v1 to v3) has no component: the entry disappears.
 */
function catalogAfterSpecStep(
  catalog: ComponentCatalog,
  project: Project,
  specId: string | undefined,
  packageFiles: ReadonlyMap<string, Uint8Array>,
): ComponentCatalog {
  if (specId === undefined) return catalog;
  const applied = getSpecialization(project, specId);
  if (!applied?.spec || applied.spec.formatVersion < 4)
    return withoutSpec(catalog, specId);
  const decoder = new TextDecoder();
  const files = applied.file;
  const next = new Map(catalog);
  next.set(
    specId,
    loadSpecComponents(applied.spec, files, applied.version, (path) => {
      const data = packageFiles.get(path);
      return data === undefined ? undefined : decoder.decode(data);
    }),
  );
  return next;
}

/**
 * Note of the step when the type declares a component in the applied specialization and the batch's
 * catalog does not have it (missing file, unreadable or with a problem): the annotation is created
 * without the preview and without the minimum size. `null` if the type does not declare a component.
 */
function missingComponentNote(
  p: Project,
  catalog: ComponentCatalog,
  ref: AnnotationTypeRef,
): string | null {
  const found = findSpecType(p, ref);
  if (found === null || found.type.component === undefined) return null;
  const label = `${ref.specId}/${ref.typeId}`;
  const components = catalog.get(ref.specId);
  const problem = components?.problems.find((m) => m.startsWith(`${ref.typeId}: `));
  const reason =
    problem !== undefined
      ? problem.slice(ref.typeId.length + 2)
      : 'the batch did not find the component files of that specialization';
  return `type ${label} declares a component, but ${reason}: the annotation was created without the preview and without the minimum size`;
}

type CreateMarkingValues = NonNullable<
  Extract<Operation, { op: 'create_marking' }>['annotation']
>['values'];

class Batch {
  private p: Project;
  private readonly aliases = new Map<string, AliasTarget>();
  /** Count of the first 8 characters (normalized) of the marking and arrow ids, for the version in `project`. */
  private prefixCounts: { project: Project; counts: Map<string, number> } | null = null;

  private componentTypes: {
    specs: Project['specializations'];
    catalog: ComponentCatalog;
    map: ReadonlyMap<string, ComponentType>;
  } | null = null;

  /** Aliases of operations that failed: the ones that depend on them say why. */
  private readonly failedAliases = new Map<string, number>();
  private readonly imageFiles = new Map<string, Uint8Array>();
  private readonly packageFiles = new Map<string, Uint8Array>();
  private readonly libraryWarnings: LibraryWarning[] = [];
  private readonly deprecations: {
    index: number;
    op: string;
    message: string;
    code?: string;
  }[] = [];
  private readonly rolesCleared: RoleCleared[] = [];
  private readonly errors: OperationError[] = [];
  private readonly steps: { index: number; description: string }[] = [];
  private readonly created: CreatedItem[] = [];
  /**
   * The batch's component catalog: it starts from what was read when loading the project and follows the
   * specializations that the batch itself applies, updates or removes.
   */
  private catalog: ComponentCatalog;
  /** Measures text like the server's drawing: embedded font and, if any, the library's `fonts`. */
  private readonly measurer: TextMeasurer;

  constructor(
    private readonly loaded: LoadedProject,
    private readonly io: BatchIo,
  ) {
    this.p = loaded.project;
    this.catalog = loaded.catalog;
    this.measurer = measurerFor(loaded.fonts ?? builtinFontBook());
  }

  private refs(p: Project = this.p): Refs {
    return new Refs({ ...this.loaded, project: p });
  }

  async run(operations: readonly Operation[]): Promise<BatchResult> {
    for (const [index, op] of operations.entries()) {
      const alias = 'as' in op ? op.as : undefined;
      // Alias of the operation's second creation (the annotation of create_marking).
      const secondAlias = op.op === 'create_marking' ? op.annotationAs : undefined;
      try {
        for (const name of [alias, secondAlias]) {
          if (
            name !== undefined &&
            (this.aliases.has(name) || this.failedAliases.has(name))
          ) {
            throw new ToolError(
              'duplicate-alias',
              `alias repeated in the batch: ${name}`,
            );
          }
        }
        if (alias !== undefined && alias === secondAlias) {
          throw new ToolError('duplicate-alias', `alias repeated in the batch: ${alias}`);
        }
        const step = await this.apply(op);
        this.checkRowAliases(step, [alias, secondAlias]);
        this.p = step.project;
        this.steps.push({ index, description: step.description });
        const deprecated = DEPRECATED_OPS[op.op];
        if (deprecated !== undefined) {
          this.deprecations.push({ index, op: op.op, message: deprecated });
        }
        if (op.op === 'create_marking' && op.image !== undefined) {
          this.deprecations.push({
            index,
            op: op.op,
            message: 'the `image` argument of create_marking is old: use `container`',
          });
        }
        if (
          (op.op === 'create_marking' || op.op === 'update_marking') &&
          op.parent !== undefined
        ) {
          this.deprecations.push({
            index,
            op: op.op,
            code: 'ignored-argument',
            message:
              "the `parent` argument was ignored: the marking's parent comes from the geometry (the innermost one that contains it)",
          });
        }
        if (
          (op.op === 'create_annotation' || op.op === 'update_annotation') &&
          op.inherit !== undefined
        ) {
          this.deprecations.push({
            index,
            op: op.op,
            message:
              'the `inherit` argument left the format (v13) and was ignored: the annotation applies only to its own marking',
          });
        }
        if (step.roleCleared) this.rolesCleared.push({ index, ...step.roleCleared });
        for (const note of step.notes ?? []) {
          this.deprecations.push({
            index,
            op: op.op,
            message: note,
            code: 'ignored-argument',
          });
        }
        for (const [file, data] of step.imageFiles ?? []) this.imageFiles.set(file, data);
        this.takePackage(index, step);
        this.refreshCatalog(op, step);
        for (const [name, target] of step.rowAliases ?? [])
          this.aliases.set(name, target);
        for (const [n, item] of (step.created ?? []).entries()) {
          // The operation's alias applies to the main item (the first one created); the second,
          // when the operation creates two (marking and annotation), has its own.
          const named = n === 0 ? alias : n === 1 ? secondAlias : undefined;
          if (named !== undefined) this.aliases.set(named, item);
          this.created.push({ index, ...item, ...(named ? { alias: named } : {}) });
        }
      } catch (error) {
        for (const name of [alias, secondAlias]) {
          if (name !== undefined && !this.aliases.has(name)) {
            this.failedAliases.set(name, index);
          }
        }
        this.errors.push(this.describeError(index, op.op, error));
      }
    }
    const invariantIssues = validateProject(this.p).map(
      (issue) => `${issue.code}: ${issue.id}`,
    );
    return {
      before: this.loaded.project,
      project: this.p,
      errors: this.errors,
      steps: this.steps,
      created: this.created,
      aliases: this.aliases,
      imageFiles: this.imageFiles,
      packageFiles: this.packageFiles,
      libraryWarnings: this.libraryWarnings,
      deprecations: this.deprecations,
      rolesCleared: this.rolesCleared,
      invariantIssues,
      catalog: this.catalog,
    };
  }

  /** The operation's alias cannot repeat a row `_as` of the same operation. */
  private checkRowAliases(step: Step, names: readonly (string | undefined)[]): void {
    for (const [rowAlias] of step.rowAliases ?? []) {
      if (names.includes(rowAlias)) {
        throw new ToolError(
          'duplicate-alias',
          `alias repeated in the batch: ${rowAlias}`,
        );
      }
    }
  }

  /**
   * Rebuilds the catalog entry of the specialization that the operation touched, with the package it
   * already read (without reading the disk again): the following operations see the new version's components.
   */
  private refreshCatalog(op: Operation, step: Step): void {
    if (op.op === 'remove_specialization') {
      this.catalog = withoutSpec(this.catalog, op.specId);
    } else if (op.op === 'apply_specialization' || op.op === 'update_specialization') {
      this.catalog = catalogAfterSpecStep(
        this.catalog,
        step.project,
        step.specId,
        this.packageFiles,
      );
    }
  }

  /**
   * Stores the operation's package files. A later operation on the same folder
   * (apply and then update in the same batch) replaces the previous one entirely, with no leftovers.
   */
  private takePackage(index: number, step: Step): void {
    const files = step.packageFiles ?? [];
    const first = files[0];
    if (first !== undefined) {
      const dir = packageDirOf(first[0]);
      if (dir !== null) {
        for (const key of [...this.packageFiles.keys()]) {
          if (packageDirOf(key) === dir) this.packageFiles.delete(key);
        }
      }
    }
    for (const [path, data] of files) this.packageFiles.set(path, data);
    for (const issue of step.warnings ?? []) {
      this.libraryWarnings.push({
        index,
        specId: step.specId ?? '',
        file: issue.file,
        path: issue.path,
        message: issue.message,
      });
    }
  }

  private describeError(index: number, op: string, error: unknown): OperationError {
    if (error instanceof ModelError) {
      return {
        index,
        op,
        code: error.code,
        message: MODEL_ERROR_MESSAGES[error.code],
        ...describeModelError(error, this.refs()),
      };
    }
    if (error instanceof ToolError) {
      const { code, message, ...details } = error.toJSON().error;
      return { index, op, code: String(code), message: String(message), ...details };
    }
    throw error;
  }

  // -------------------------------------------------------------------------
  // Resolution of what the agent provided

  private alias(name: string, kind: AliasTarget['kind']): AliasTarget {
    const target = this.aliases.get(name);
    if (target) {
      if (target.kind !== kind) {
        throw new ToolError('wrong-kind', `the alias ${name} is not ${kindLabel(kind)}`);
      }
      return target;
    }
    const failed = this.failedAliases.get(name);
    if (failed !== undefined) {
      throw new ToolError(
        'alias-unavailable',
        `the alias ${name} would come from operation ${failed}, which failed`,
        { alias: name, failedOperation: failed },
      );
    }
    throw new ToolError(
      'unknown-alias',
      `unknown alias: ${name} (create the item with "as" in an earlier operation)`,
      { alias: name },
    );
  }

  /**
   * Container by reference/id or, if not found, by name or file (like `list_markings`);
   * a name shared by more than one container → `ambiguous-image`.
   */
  private containerItem(text: string, p: Project = this.p): string {
    try {
      return this.item(text, 'i', p);
    } catch (error) {
      if (
        !(error instanceof ToolError) ||
        (error.code !== 'not-found' && error.code !== 'invalid-ref') ||
        text.trim().startsWith('$')
      ) {
        throw error;
      }
      const named = containersNamed(p, text.trim());
      if (named.length === 1) return named[0]!.id;
      if (named.length > 1) {
        throw new ToolError(
          'ambiguous-image',
          `more than one container is named "${text}": use the reference`,
          { candidates: named.map((c) => this.refs(p).ref('i', c.id)) },
        );
      }
      throw error;
    }
  }

  /** Id of a marking, container or annotation of this project: alias, reference or id. */
  private item(text: string, kind: ItemKind, p: Project = this.p): string {
    const wanted = text.trim();
    if (wanted.startsWith('$')) {
      const target = this.alias(wanted, kind);
      return 'id' in target ? target.id : '';
    }
    const parsed = parseRef(wanted);
    if (!parsed) {
      throw new ToolError('invalid-ref', `invalid reference: ${text}`, {
        hint: INVALID_REF_HINT,
      });
    }
    if (parsed.project !== null && parsed.project !== this.loaded.location.name) {
      throw new ToolError(
        'project-mismatch',
        `the reference is to project "${parsed.project}", not "${this.loaded.location.name}"`,
      );
    }
    if (parsed.kind !== null && parsed.kind !== kind) {
      throw new ToolError(
        'wrong-kind',
        `the reference is to ${KIND_WITH_ARTICLE[parsed.kind]}, not ${KIND_WITH_ARTICLE[kind]}`,
      );
    }
    const found = matchShortCode(p, kind, parsed.code);
    if (found.length === 1) return found[0]!.id;
    if (found.length === 0) {
      throw new ToolError('not-found', `${KIND_NOT_FOUND[kind]}: ${text}`);
    }
    throw new ToolError(
      'ambiguous-ref',
      `${found.length} items start with that code: use the full reference`,
      { candidates: found.slice(0, 20).map((f) => this.refs(p).ref(f.kind, f.id)) },
    );
  }

  private layer(text: string, p: Project = this.p): Layer {
    const wanted = text.trim();
    const index = projectIndex(p);
    if (wanted.startsWith('$')) {
      const target = this.alias(wanted, 'layer');
      const layer = 'id' in target ? index.layers.get(target.id) : undefined;
      if (layer) return layer;
      throw new ToolError('not-found', `the layer ${wanted} no longer exists`);
    }
    const byId = index.layers.get(wanted);
    if (byId) return byId;
    const slash = wanted.indexOf('/');
    if (slash > 0) {
      const fromSpec = projectLayerFor(
        p,
        wanted.slice(0, slash),
        wanted.slice(slash + 1),
      );
      if (fromSpec) return fromSpec;
    }
    const byName = p.layers.filter((l) => fold(l.name) === fold(wanted));
    if (byName.length === 1) return byName[0]!;
    throw new ToolError(
      byName.length > 1 ? 'ambiguous-layer' : 'not-found',
      byName.length > 1
        ? `there are ${byName.length} layers named "${text}": use the id`
        : `layer not found: ${text}`,
      { layers: p.layers.map((l) => ({ id: l.id, name: l.name })) },
    );
  }

  private type(text: string, p: Project = this.p): AnnotationTypeRef {
    const wanted = fold(text);
    const matches = [...projectIndex(p).types.values()].filter(
      ({ spec, type }) =>
        fold(`${spec.id}/${type.id}`) === wanted ||
        fold(type.id) === wanted ||
        fold(type.name) === wanted,
    );
    const exact = matches.filter(
      ({ spec, type }) => fold(`${spec.id}/${type.id}`) === wanted,
    );
    const chosen = exact.length > 0 ? exact : matches;
    if (chosen.length === 1)
      return { specId: chosen[0]!.spec.id, typeId: chosen[0]!.type.id };
    throw new ToolError(
      chosen.length > 1 ? 'ambiguous-type' : 'unknown-type',
      chosen.length > 1
        ? `"${text}" exists in more than one specialization: use specId/typeId`
        : `annotation type not found: ${text} (see get_project and get_specialization)`,
      {
        types: [...projectIndex(p).types.values()]
          .slice(0, 50)
          .map(({ spec, type }) => `${spec.id}/${type.id}`),
      },
    );
  }

  /**
   * Reads what `file` points to: a v1 to v3 specialization file, or the v4 package (the folder, or the
   * specialization file inside it). The package is validated with the same levels as
   * `validate_library`: an error blocks (`invalid-library`), a warning goes on and comes back in the result.
   * On an update, the applied copy binds the version contract (`previous`).
   */
  private async loadSpec(
    file: string,
    mode: 'apply' | 'update',
    p: Project,
  ): Promise<LoadedSpec> {
    const input = await this.io.readSpecInput(file);
    if (input.kind === 'file') {
      const impact = mode === 'update' ? checkUpdate(p, input.spec) : undefined;
      return { spec: input.spec, ...(impact ? { impact } : {}) };
    }
    const { spec, specName } = parsePackage(input.pkg);
    const impact = mode === 'update' ? checkUpdate(p, spec) : undefined;
    const previous =
      mode === 'update' ? (getSpecialization(p, spec.id)?.spec ?? undefined) : undefined;
    const warnings = requireValid(validatePackage(input.pkg, previous));
    return {
      spec,
      ...(impact ? { impact } : {}),
      package: { pkg: input.pkg, specName, warnings },
    };
  }

  /** Package files with the final path, after the model has chosen the `file`. */
  private packageStep(
    loaded: LoadedSpec,
    project: Project,
  ): Pick<Step, 'packageFiles' | 'warnings' | 'specId'> {
    if (!loaded.package) return {};
    const entry = getSpecialization(project, loaded.spec.id);
    if (!entry) return {};
    return {
      specId: loaded.spec.id,
      packageFiles: packageFileEntries(
        loaded.package.pkg,
        loaded.package.specName,
        entry.file,
      ),
      warnings: loaded.package.warnings,
    };
  }

  /** Model options: the v4 package stores the copy in a folder, with the specialization file inside it. */
  private specOptions(loaded: LoadedSpec): { packageSpecName?: string } {
    return loaded.package ? { packageSpecName: loaded.package.specName } : {};
  }

  /** Reads and optimizes the given image and picks the free name in `images/`. */
  private async image(
    source: { file?: string; base64?: string; fileName?: string },
    p: Project,
  ): Promise<{
    file: string;
    data: Uint8Array;
    width: number;
    height: number;
    note: string;
  }> {
    let bytes: Uint8Array;
    let name: string;
    if (source.file !== undefined && source.base64 !== undefined) {
      throw new ToolError('invalid-image-source', 'provide `file` or `base64`, not both');
    }
    if (source.file !== undefined) {
      const read = await this.io.readSource(source.file);
      bytes = read.bytes;
      name = read.name;
    } else if (source.base64 !== undefined) {
      bytes = decodeBase64(source.base64);
      const format = detectFormat(bytes);
      name = pastedFileName(this.io.now(), extensionForMime(format ? MIME[format] : ''));
    } else {
      throw new ToolError(
        'invalid-image-source',
        "provide the image's `file` or `base64`",
      );
    }
    const fallback = pastedFileName(this.io.now(), 'png');
    const prepared = await prepareImage(
      bytes,
      safeFileName(source.fileName ?? name, fallback),
    );
    const taken = new Set([...this.io.takenImageFiles, ...this.imageFiles.keys()]);
    const file = uniqueImageFile(p, safeFileName(prepared.name, fallback), taken);
    const { original } = prepared;
    const note = prepared.optimized
      ? original.width !== prepared.width
        ? `optimized: ${original.width}×${original.height} → ${prepared.width}×${prepared.height}, WebP`
        : 'optimized: WebP'
      : 'original file';
    return {
      file,
      data: prepared.data,
      width: prepared.width,
      height: prepared.height,
      note,
    };
  }

  /** Reference of a `ref` field in the agent's format → the model's `RefValue`. */
  private refValue(input: JsonValue, key: string, p: Project): JsonValue {
    if (input === null || (typeof input === 'string' && input === '')) return null;
    if (!isRecord(input)) {
      throw new ToolError(
        'invalid-ref-value',
        `field ${key}: the reference is an object with "annotation" (see the description of values)`,
      );
    }
    const target = input.annotation ?? input.annotationId;
    if (typeof target !== 'string') {
      throw new ToolError('invalid-ref-value', `field ${key}: "annotation" is missing`);
    }
    const annotationId = this.item(target, 'a', p);
    const annotation = projectIndex(p).annotations.get(annotationId)!;
    const entry = input.entry ?? input.entryId;
    const field = input.key;
    const row = input.row ?? input.rowId;
    let ref: RefValue;
    if (entry !== undefined) {
      if (typeof entry !== 'string') {
        throw new ToolError(
          'invalid-ref-value',
          `field ${key}: "entry" is the key or the id of the pair`,
        );
      }
      const found =
        annotation.entries.find((e) => e.id === entry) ??
        annotation.entries.find((e) => e.key === entry.trim());
      if (!found) {
        throw new ToolError(
          'not-found',
          `field ${key}: the annotation has no pair "${entry}"`,
          {
            entries: annotation.entries.map((e) => e.key),
          },
        );
      }
      ref = { annotationId, entryId: found.id };
    } else if (typeof field === 'string' && row !== undefined) {
      ref = { annotationId, key: field, rowId: this.rowId(annotation, field, row, key) };
    } else if (typeof field === 'string') {
      ref = { annotationId, key: field };
    } else if (field === undefined && row === undefined) {
      // Without `entry`, `key` or `row`: the whole annotation (fourth format).
      ref = { annotationId };
    } else {
      throw new ToolError(
        'invalid-ref-value',
        `field ${key}: "row" requires "key" (the table); without "entry", "key" or "row", the reference is the whole annotation`,
      );
    }
    return { ...ref };
  }

  private rowId(
    annotation: Annotation,
    field: string,
    row: JsonValue,
    key: string,
  ): string {
    const rows = tableRows(annotation.values?.[field]);
    if (typeof row === 'number') {
      const found = rows[row];
      if (!found)
        throw new ToolError(
          'not-found',
          `field ${key}: the table ${field} has no row ${row}`,
        );
      return found._id;
    }
    if (typeof row !== 'string') {
      throw new ToolError(
        'invalid-ref-value',
        `field ${key}: "row" is the id, the alias or the index of the row`,
      );
    }
    if (row.startsWith('$')) {
      const target = this.alias(row, 'row');
      if (target.kind === 'row') {
        if (target.annotationId !== annotation.id || target.key !== field) {
          throw new ToolError(
            'invalid-ref-value',
            `field ${key}: row ${row} belongs to another table`,
          );
        }
        return target.rowId;
      }
    }
    return row;
  }

  /** Sets the values of a typed annotation, field by field, through the model's operations. */
  private setValues(
    p: Project,
    annotationId: string,
    values: Record<string, JsonValue>,
    rowAliases: [string, AliasTarget][],
  ): Project {
    const entries = Object.entries(values);
    if (entries.length === 0) return p;
    // The annotation's type does not change when setting the values: resolved once, not per field.
    const annotation = projectIndex(p).annotations.get(annotationId)!;
    const resolved = typeOfAnnotation(p, annotation);
    let next = p;
    for (const [key, value] of entries) {
      const field: SpecField | null = resolved ? fieldOf(resolved.type, key) : null;
      if (field?.type === 'table') {
        next = this.setTable(next, annotationId, field, value, rowAliases);
      } else if (field?.type === 'ref') {
        next = setFieldValue(next, annotationId, key, this.refValue(value, key, next));
      } else {
        // Simple fields; a nonexistent type or an unknown field: the model says why.
        next = setFieldValue(next, annotationId, key, value);
      }
    }
    return next;
  }

  /** Replaces the table's rows: `_id` keeps an existing row, `_as` gives it an alias. */
  private setTable(
    p: Project,
    annotationId: string,
    tableField: Extract<SpecField, { type: 'table' }>,
    value: JsonValue,
    rowAliases: [string, AliasTarget][],
  ): Project {
    const key = tableField.key;
    if (value !== null && !Array.isArray(value)) {
      throw new ToolError('invalid-value', `field ${key}: a table is a list of rows`);
    }
    const input = (value ?? []).map((row, i) => {
      if (!isRecord(row)) {
        throw new ToolError('invalid-value', `field ${key}: row ${i} is not an object`);
      }
      return row;
    });
    const current = tableRows(
      projectIndex(p).annotations.get(annotationId)!.values?.[key],
    );
    const kept = new Set(
      input.map((row) => row._id).filter((id): id is string => typeof id === 'string'),
    );
    let next = p;
    for (const row of current) {
      if (!kept.has(row._id)) next = removeTableRow(next, annotationId, key, row._id);
    }
    const existing = new Set(current.map((row) => row._id));
    input.forEach((row, position) => {
      const given = row._id;
      if (given !== undefined && (typeof given !== 'string' || !existing.has(given))) {
        throw new ToolError(
          'not-found',
          `field ${key}: row ${String(given)} does not exist`,
        );
      }
      const rowId = given ?? crypto.randomUUID();
      if (given === undefined) next = addTableRow(next, annotationId, key, rowId);
      for (const [column, cell] of Object.entries(row)) {
        if (column === '_id' || column === '_as') continue;
        const isRef = tableField.columns.find((c) => c.key === column)?.type === 'ref';
        // `ref` cell: the same value as the `ref` field (aliases included) or the stored format.
        const cellValue = isRef ? this.refValue(cell, column, next) : cell;
        next = setTableCell(next, annotationId, key, rowId, column, cellValue);
      }
      next = moveTableRow(next, annotationId, key, rowId, position);
      const alias = row._as;
      if (alias !== undefined) {
        if (typeof alias !== 'string' || !/^\$[A-Za-z0-9_-]+$/.test(alias)) {
          throw new ToolError(
            'invalid-alias',
            `field ${key}: "_as" is an alias like "$row"`,
          );
        }
        if (this.aliases.has(alias) || rowAliases.some(([name]) => name === alias)) {
          throw new ToolError('duplicate-alias', `alias repeated in the batch: ${alias}`);
        }
        rowAliases.push([alias, { kind: 'row', annotationId, key, rowId }]);
      }
    });
    return next;
  }

  /** New pairs with the same key as an existing one keep the id (and the references to it). */
  private entries(
    p: Project,
    annotationId: string | null,
    entries: readonly { key: string; value: string; id?: string }[],
  ): EntryInput[] {
    const current = annotationId
      ? (projectIndex(p).annotations.get(annotationId)?.entries ?? [])
      : [];
    return entries.map((e) => {
      const id = e.id ?? current.find((c) => c.key === e.key.trim())?.id;
      return { key: e.key, value: e.value, ...(id ? { id } : {}) };
    });
  }

  // -------------------------------------------------------------------------
  // Labels for the summary

  private markingLabel(p: Project, id: string): string {
    return this.refs(p).markingPath(id).join(' › ');
  }

  /**
   * Label of the newly created marking (`Container › Name`), the same as `markingLabel`'s, without building
   * the index or sorting the codes of the whole project: the cost does not grow with it, and a batch of
   * a thousand creations stays linear. It only holds for a marking with no parent and no other id starting
   * the same; in the other cases it falls back to `markingLabel` (which decides the name and code from the whole project).
   */
  private createdMarkingLabel(
    before: Project,
    project: Project,
    marking: Marking,
    typeName: string | null,
  ): string {
    const fast =
      marking.parentId === null && project.arrows === before.arrows
        ? this.freshCode(before, project, marking.id)
        : null;
    if (fast === null) return this.markingLabel(project, marking.id);
    const name = marking.name ?? `${typeName ?? 'Marking'} ${fast}`;
    return [this.refs(project).imageLabelNoIndex(marking.containerId), name].join(' › ');
  }

  /**
   * Types with a component by `specialization/type`, built once per version of the
   * specializations and the catalog (`import_measured` creates one marking per node).
   */
  private componentTypeMap(
    p: Project,
    catalog: ComponentCatalog,
  ): ReadonlyMap<string, ComponentType> {
    const cached = this.componentTypes;
    if (cached?.specs === p.specializations && cached.catalog === catalog) {
      return cached.map;
    }
    const map = new Map<string, ComponentType>();
    for (const t of componentTypes(p, catalog)) {
      // The first one wins, like the `find` by specialization and type.
      const key = `${t.specId}/${t.typeId}`;
      if (!map.has(key)) map.set(key, t);
    }
    this.componentTypes = { specs: p.specializations, catalog, map };
    return map;
  }

  /**
   * Short code of the new id if no other marking or arrow id starts with the same 8
   * characters (the code is then the 8-character prefix, as `shortCode` would give); `null` if there is
   * a collision or if the project is not the previous one plus one marking.
   */
  private freshCode(before: Project, project: Project, id: string): string | null {
    if (project.markings.length !== before.markings.length + 1) {
      this.prefixCounts = null;
      return null;
    }
    if (this.prefixCounts?.project !== before) {
      const counts = new Map<string, number>();
      for (const item of [...before.markings, ...before.arrows]) {
        const prefix = normalizeId(item.id).slice(0, SHORT_CODE_LENGTH);
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
      this.prefixCounts = { project: before, counts };
    }
    const { counts } = this.prefixCounts;
    const norm = normalizeId(id);
    const prefix = norm.slice(0, SHORT_CODE_LENGTH);
    const taken = norm.length < SHORT_CODE_LENGTH || counts.has(prefix);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    this.prefixCounts = { project, counts };
    return taken ? null : prefix;
  }

  private annotationLabel(p: Project, id: string): string {
    const a = projectIndex(p).annotations.get(id);
    return a
      ? `${annotationShortLabel(p, a)} on "${this.markingLabel(p, a.markingId)}"`
      : id;
  }

  // -------------------------------------------------------------------------
  // Operations

  private async apply(op: Operation): Promise<Step> {
    const p = this.p;
    switch (op.op) {
      case 'set_platform_repo': {
        if (op.urlTemplate !== undefined) {
          throw new ToolError(
            'unknown-field',
            'the repository address comes from the specialization (`platforms[].repo`); the project only provides `localPath`',
          );
        }
        if (op.localPath === undefined) {
          throw new ToolError(
            'nothing-to-change',
            'provide `localPath` (or use remove_platform_repo)',
          );
        }
        const project = setPlatformRepo(p, op.platform, { localPath: op.localPath });
        const repo = project.platformRepos[op.platform];
        return {
          project,
          description: repo?.localPath
            ? `Set the local clone of platform "${op.platform}": localPath "${repo.localPath}"`
            : `Set the local clone of platform "${op.platform}": localPath removed`,
        };
      }
      case 'remove_platform_repo':
        return {
          project: removePlatformRepo(p, op.platform),
          description: `Remove the local clone of platform "${op.platform}"`,
        };
      case 'set_doc_repo': {
        if (op.localPath === undefined) {
          throw new ToolError(
            'nothing-to-change',
            'provide `localPath` (or use remove_doc_repo)',
          );
        }
        const project = setDocRepo(p, op.repo, { localPath: op.localPath });
        const repo = project.docRepos[op.repo];
        return {
          project,
          description: repo?.localPath
            ? `Set the local clone of the documents repository "${op.repo}": localPath "${repo.localPath}"`
            : `Set the local clone of the documents repository "${op.repo}": localPath removed`,
        };
      }
      case 'remove_doc_repo':
        return {
          project: removeDocRepo(p, op.repo),
          description: `Remove the local clone of the documents repository "${op.repo}"`,
        };
      case 'create_layer': {
        const id = crypto.randomUUID();
        const project = addLayer(p, {
          id,
          name: op.name,
          color: op.color ?? nextLayerColor(p),
        });
        return {
          project,
          description: `Create the layer "${op.name.trim()}"`,
          created: [{ kind: 'layer', id }],
        };
      }
      case 'update_layer': {
        const layer = this.layer(op.layer);
        let project = p;
        const changes: string[] = [];
        if (op.name !== undefined) {
          project = renameLayer(project, layer.id, op.name);
          changes.push(`name "${op.name.trim()}"`);
        }
        if (op.color !== undefined) {
          project = setLayerColor(project, layer.id, op.color);
          changes.push(`color ${op.color.toUpperCase()}`);
        }
        return {
          project,
          description: `Change the layer "${layer.name}": ${changes.join(', ') || 'nothing'}`,
        };
      }
      case 'move_layer': {
        const layer = this.layer(op.layer);
        return {
          project: moveLayer(p, layer.id, op.index),
          description: `Move the layer "${layer.name}" to position ${op.index}`,
        };
      }
      case 'delete_layer': {
        const layer = this.layer(op.layer);
        const impact = layerDeletionImpact(p, layer.id);
        return {
          project: removeLayer(p, layer.id),
          description: `Delete the layer "${layer.name}" (${impact.annotations} annotation(s)${
            impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : ''
          })`,
        };
      }
      case 'apply_specialization': {
        const loaded = await this.loadSpec(op.file, 'apply', p);
        const { spec } = loaded;
        const check = checkSpecApply(p, spec);
        if (check === 'update') {
          throw new ToolError(
            'spec-already-applied',
            `the specialization "${spec.id}" is already applied in a lower version: use update_specialization`,
          );
        }
        const project = applySpecialization(p, spec, this.specOptions(loaded));
        const layers = project.layers.slice(p.layers.length);
        const warnings = loaded.package?.warnings.length ?? 0;
        return {
          project,
          description: `Apply the specialization "${spec.name}" (${spec.id} v${spec.version}): layers ${layers
            .map((l) => `"${l.name}"`)
            .join(', ')}${
            loaded.package
              ? ` (library package${warnings > 0 ? `, ${warnings} validation warning(s)` : ''})`
              : ''
          }`,
          created: layers.map((l) => ({ kind: 'layer' as const, id: l.id })),
          ...this.packageStep(loaded, project),
        };
      }
      case 'update_specialization': {
        const loaded = await this.loadSpec(op.file, 'update', p);
        const { spec } = loaded;
        const impact = loaded.impact!;
        const project = updateSpecialization(p, spec, this.specOptions(loaded));
        const before = new Set(p.layers.map((l) => l.id));
        const added = project.layers.filter((l) => !before.has(l.id));
        const parts = updateSummary(impact);
        const warnings = loaded.package?.warnings.length ?? 0;
        if (warnings > 0) parts.push(`${warnings} library validation warning(s)`);
        return {
          project,
          description: `Update the specialization "${spec.id}" to v${spec.version}${
            parts.length > 0 ? ` (${parts.join('; ')})` : ''
          }`,
          created: added.map((l) => ({ kind: 'layer' as const, id: l.id })),
          ...this.packageStep(loaded, project),
        };
      }
      case 'remove_specialization': {
        if (!projectIndex(p).specializations.has(op.specId)) {
          throw new ToolError('not-found', `specialization not applied: ${op.specId}`);
        }
        const impact = specializationRemovalImpact(p, op.specId, op.mode);
        const layers = p.layers.filter((l) => l.spec?.specId === op.specId).length;
        const broken =
          impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : '';
        return {
          project: removeSpecialization(p, op.specId, op.mode),
          description:
            op.mode === 'delete'
              ? `Remove the specialization "${op.specId}": delete ${layers} layer(s) and ${impact.annotations} annotation(s)${broken}`
              : `Remove the specialization "${op.specId}": ${layers} layer(s) and ${impact.annotations} annotation(s) become free-form${broken}`,
        };
      }
      case 'update_project':
        return this.updateProjectOp(op, p);
      case 'add_container':
        return this.addContainerOp(op, p);
      case 'add_image':
        return this.addContainerFromFile(op, p);
      case 'add_blank_image':
        return this.addContainerWithBackground(op, p);
      case 'update_container':
        return this.updateContainerOp(op, this.containerItem(op.container, p), p);
      case 'update_image':
        return this.updateContainerOp(op, this.containerItem(op.image, p), p);
      case 'replace_container':
        return this.replaceContainerOp(op, this.containerItem(op.container, p), p);
      case 'replace_image':
        return this.replaceContainerOp(op, this.containerItem(op.image, p), p);
      case 'delete_container':
        return this.deleteContainerOp(this.containerItem(op.container, p), p);
      case 'delete_image':
        return this.deleteContainerOp(this.containerItem(op.image, p), p);
      case 'create_marking':
        return this.createMarkingOp(op);
      case 'wrap_items':
        return this.wrapItemsOp(op);
      case 'import_measured':
        return this.importMeasuredOp(op);
      case 'move_marking': {
        const id = this.item(op.marking, 'm');
        const before = siblingPosition(p, id);
        const label = this.markingLabel(p, id);
        if (before.index === op.index) {
          return {
            project: p,
            description: `The marking "${label}" is already at position ${op.index} among its ${before.count} siblings (in the batch state at this point): nothing changes`,
          };
        }
        return {
          project: reorderMarking(p, id, op.index),
          description: `Move the marking "${label}" to position ${op.index} among its ${before.count} siblings (0 = at the bottom)`,
        };
      }
      case 'fit_marking':
        return this.fitMarkingOp(op, p);
      case 'snap_to_anchor':
        return this.snapToAnchorOp(op, p);
      case 'update_marking': {
        const id = this.item(op.marking, 'm');
        this.requireNotArrow(id, 'update_arrow');
        const label = this.markingLabel(p, id);
        let project = p;
        const changes: string[] = [];
        if (op.locked === false) {
          project = setMarkingLocked(project, id, false);
          changes.push('unlock');
        }
        if (op.name !== undefined) {
          project = renameMarking(project, id, op.name);
          changes.push(`name ${quoted(projectIndex(project).markings.get(id)!.name)}`);
        }
        if (op.source !== undefined) {
          project = setMarkingSource(project, id, toSource(op.source));
          changes.push(sourceLabel(projectIndex(project).markings.get(id)!.source));
        }
        if (op.move !== undefined) {
          project = moveMarking(project, id, op.move.dx, op.move.dy);
          changes.push(`move (${op.move.dx}, ${op.move.dy}) with the children`);
        }
        if (op.floating !== undefined) {
          const minSize = componentMinSize(project, this.catalog, id);
          project = setMarkingFloating(
            project,
            id,
            op.floating,
            minSize ? { minSize } : undefined,
          );
          changes.push(op.floating ? 'floating' : 'stop being floating');
        }
        if (op.container !== undefined) {
          if (op.rect === undefined) {
            throw new ToolError(
              'invalid-arguments',
              'changing `container` requires the `rect` in the pixels of the new container (on the canvas, in canvas units)',
            );
          }
          const target =
            op.container === null ? null : this.containerItem(op.container, project);
          const { rect } = op;
          const minSize = componentMinSize(project, this.catalog, id);
          project = this.checkMinSize(minSize, `"${label}"`, () =>
            setMarkingSpace(project, id, target, rect, minSize ? { minSize } : undefined),
          );
          changes.push(
            `${target === null ? 'go to the canvas' : `go to the container "${this.refs(project).imageLabel(target)}"`}, rectangle x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}`,
          );
        } else if (op.rect !== undefined) {
          const { rect } = op;
          const minSize = componentMinSize(project, this.catalog, id);
          project = this.checkMinSize(minSize, `"${label}"`, () =>
            setMarkingRect(project, id, rect, minSize ? { minSize } : undefined),
          );
          const r = op.rect;
          changes.push(`rectangle x ${r.x}, y ${r.y}, ${r.width}×${r.height}`);
        }
        if (op.anchor !== undefined) {
          const anchor = op.anchor === null ? null : this.markingAnchor(op.anchor);
          project = setMarkingAnchor(project, id, anchor);
          changes.push(
            anchor === null
              ? 'remove the anchor'
              : `anchor to "${this.markingLabel(project, anchor.to)}"`,
          );
        }
        if (op.confirmReview === true) {
          project = confirmMarkingReview(project, id);
          changes.push('confirm the position');
        }
        if (op.locked === true) {
          project = setMarkingLocked(project, id, true);
          changes.push('lock');
        }
        return {
          project,
          description: `Change the marking "${label}": ${changes.join(', ') || 'nothing'}`,
        };
      }
      case 'delete_marking': {
        const id = this.item(op.marking, 'm');
        this.requireNotArrow(id, 'delete_arrow');
        const impact = markingDeletionImpact(p, id);
        return {
          project: removeMarking(p, id),
          description: `Delete the marking "${this.markingLabel(p, id)}" (${impact.descendants} descendant(s), ${impact.annotations} annotation(s)${
            impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : ''
          })`,
        };
      }
      case 'create_arrow':
        return this.createArrowOp(op);
      case 'update_arrow':
        return this.updateArrowOp(op);
      case 'delete_arrow': {
        const id = this.item(op.arrow, 'm');
        this.requireArrow(id);
        const label = this.markingLabel(p, id);
        const impact = arrowDeletionImpact(p, id);
        return {
          project: removeArrow(p, id),
          description: `Delete the arrow "${label}" (${impact.annotations} annotation(s)${
            impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : ''
          })`,
        };
      }
      case 'create_annotation':
        return this.createAnnotation(op);
      case 'update_annotation':
        return this.updateAnnotation(op);
      case 'delete_annotation': {
        const id = this.item(op.annotation, 'a');
        const impact = annotationDeletionImpact(p, id);
        return {
          project: removeAnnotation(p, id),
          description: `Delete the annotation ${this.annotationLabel(p, id)}${
            impact.annotations > 1 ? ` (with ${impact.annotations - 1} linked)` : ''
          }${impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : ''}`,
        };
      }
    }
  }

  /** Runs `run` and, if the rectangle ended up below the component's minimum, says what the minimum is. */
  private checkMinSize<T>(
    minSize: { width: number; height: number } | null,
    what: string,
    run: () => T,
  ): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof ModelError && error.code === 'rect-too-small' && minSize) {
        const detail = rectTooSmallDetail(error.data);
        throw new ToolError(
          error.code,
          `rectangle smaller than the minimum size of the component of ${what}: ${minSize.width}×${minSize.height} px`,
          {
            minSize: { width: minSize.width, height: minSize.height },
            ...(detail ? { detail } : {}),
            hint: MODEL_ERROR_HINTS['rect-too-small'],
          },
        );
      }
      throw error;
    }
  }

  /**
   * `create_marking`: the marking and, if requested, the typed annotation. When the type has a component
   * (in the catalog read when loading the project), the `rect` may be missing (the component's initial
   * size) and the `minSize` applies; the annotation is created as in the app's palette (`preview`), with the
   * `values` on top. The server never arranges: the rectangles are the ones the agent provided.
   */
  /** `update_project`: the project's drawing mode and reading direction. */
  private updateProjectOp(
    op: Extract<Operation, { op: 'update_project' }>,
    p: Project,
  ): Step {
    let project = p;
    const changes: string[] = [];
    if (op.drawingMode !== undefined) {
      project = setProjectDrawingMode(project, op.drawingMode);
      changes.push(
        op.drawingMode === null
          ? 'drawing mode removed'
          : `drawing mode ${quoted(op.drawingMode)}`,
      );
    }
    if (op.direction !== undefined) {
      project = setProjectDirection(project, op.direction);
      changes.push(
        op.direction === null ? 'direction removed' : `direction ${quoted(op.direction)}`,
      );
    }
    return {
      project,
      description: `Change the project: ${changes.join(', ') || 'nothing'}`,
    };
  }

  /** `add_container` (with a file or background only) and the drawing mode it pins. */
  private async addContainerOp(
    op: Extract<Operation, { op: 'add_container' }>,
    p: Project,
  ): Promise<Step> {
    const step =
      op.file !== undefined || op.base64 !== undefined
        ? await this.addContainerFromFile(op, p)
        : this.addContainerWithBackground(op, p);
    const id = step.created?.find((c) => c.kind === 'i')?.id;
    if (id === undefined) return step;
    let result = step;
    if (op.drawingMode != null) {
      result = {
        ...result,
        project: setContainerDrawingMode(result.project, id, op.drawingMode),
        description: `${result.description}, drawing mode ${quoted(op.drawingMode)}`,
      };
    }
    if (op.direction != null) {
      result = {
        ...result,
        project: setContainerDirection(result.project, id, op.direction),
        description: `${result.description}, direction ${quoted(op.direction)}`,
      };
    }
    if (op.density != null) {
      result = {
        ...result,
        project: setContainerDensity(result.project, id, op.density),
        description: `${result.description}, density ${op.density}x`,
      };
    }
    return result;
  }

  /** `beside` of `add_container`: the id of the reference container; with `center` it is `invalid-arguments`. */
  private besideId(
    op: { readonly beside?: string; readonly center?: unknown },
    p: Project,
  ): string | undefined {
    if (op.beside === undefined) return undefined;
    if (op.center !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`beside` and `center` are mutually exclusive: use `beside` to place the container next to another one, or `center` for a canvas point',
      );
    }
    return this.containerItem(op.beside, p);
  }

  /** Container with an image file: `add_container` with `file`/`base64` and the old `add_image`. */
  private async addContainerFromFile(
    op: Extract<Operation, { op: 'add_container' | 'add_image' }>,
    p: Project,
  ): Promise<Step> {
    if (
      op.op === 'add_container' &&
      (op.width !== undefined || op.height !== undefined || op.background !== undefined)
    ) {
      throw new ToolError(
        'invalid-arguments',
        'add_container is ambiguous: with `file`/`base64` the width and height come from the file; provide `file` or `base64`, or else `width`, `height` and `background`, never both groups',
      );
    }
    const beside = this.besideId(op, p);
    const image = await this.image(op, p);
    const id = crypto.randomUUID();
    let project = addContainer(p, {
      id,
      file: image.file,
      width: image.width,
      height: image.height,
      ...(op.center ? { center: op.center } : {}),
      ...(beside !== undefined ? { beside } : {}),
    });
    if (op.name !== undefined) project = renameContainer(project, id, op.name);
    if (op.source !== undefined) {
      project = setImageSource(project, id, toSource(op.source));
    }
    return {
      project,
      description: `Add the container ${nameLabel(op.name)}with the image ${image.file} (${image.width}×${image.height} px, ${image.note}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'i', id }],
      imageFiles: [[image.file, image.data]],
    };
  }

  /** Background-only container: `add_container` without a file and the old `add_blank_image`. */
  private addContainerWithBackground(
    op: Extract<Operation, { op: 'add_container' | 'add_blank_image' }>,
    p: Project,
  ): Step {
    const { width, height, background } = op;
    if (width === undefined || height === undefined || background === undefined) {
      const missing = [
        width === undefined ? '`width`' : null,
        height === undefined ? '`height`' : null,
        background === undefined ? '`background`' : null,
      ].filter((m) => m !== null);
      throw new ToolError(
        'invalid-arguments',
        `add_container needs \`file\` (or \`base64\`), or \`width\`, \`height\` and \`background\`; missing: ${missing.join(', ')}`,
      );
    }
    const beside = this.besideId(op, p);
    const id = crypto.randomUUID();
    let project = addBackgroundContainer(p, {
      id,
      ...(op.name !== undefined ? { name: op.name } : {}),
      width,
      height,
      background,
      ...(op.center ? { center: op.center } : {}),
      ...(beside !== undefined ? { beside } : {}),
    });
    if (op.source !== undefined) {
      project = setImageSource(project, id, toSource(op.source));
    }
    return {
      project,
      description: `Add the container "${this.refs(project).imageLabel(id)}" (${width}×${height} px, background ${background.toUpperCase()}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'i', id }],
    };
  }

  /** `update_container` and the old `update_image`. */
  private updateContainerOp(
    op: Extract<Operation, { op: 'update_container' | 'update_image' }>,
    id: string,
    p: Project,
  ): Step {
    let project = p;
    const changes: string[] = [];
    if (op.locked === false) {
      project = setImageLocked(project, id, false);
      changes.push('unlock');
    }
    if (op.name !== undefined) {
      project = renameContainer(project, id, op.name);
      changes.push(`name ${quoted(projectIndex(project).containers.get(id)!.name)}`);
    }
    if (op.source !== undefined) {
      project = setImageSource(project, id, toSource(op.source));
      changes.push(sourceLabel(projectIndex(project).containers.get(id)!.source));
    }
    if (op.x !== undefined || op.y !== undefined || op.scale !== undefined) {
      const { placement } = projectIndex(project).containers.get(id)!;
      const next = {
        x: op.x ?? placement.x,
        y: op.y ?? placement.y,
        scale: op.scale ?? placement.scale,
      };
      project = setContainerPlacement(project, id, next);
      // The stored value, already free of floating-point noise.
      const saved = projectIndex(project).containers.get(id)!.placement;
      changes.push(`position (${saved.x}, ${saved.y}) scale ${saved.scale}`);
    }
    if (op.markingColor !== undefined) {
      project = setContainerMarkingColor(project, id, op.markingColor);
      changes.push(`marking color ${op.markingColor ?? 'theme'}`);
    }
    if (op.markingsLocked !== undefined) {
      project = setImageMarkingsLocked(project, id, op.markingsLocked);
      changes.push(
        op.markingsLocked ? 'lock all the markings' : 'unlock all the markings',
      );
    }
    if (
      op.background !== undefined ||
      op.width !== undefined ||
      op.height !== undefined
    ) {
      // Only a container without a file: with a file the model refuses with `container-has-file`.
      project = setBackgroundContainer(project, id, {
        ...(op.background !== undefined ? { background: op.background } : {}),
        ...(op.width !== undefined ? { width: op.width } : {}),
        ...(op.height !== undefined ? { height: op.height } : {}),
      });
      const container = projectIndex(project).containers.get(id)!;
      changes.push(
        `size ${container.width}×${container.height} px, background ${container.background}`,
      );
    }
    if (op.drawingMode !== undefined) {
      project = setContainerDrawingMode(project, id, op.drawingMode);
      changes.push(
        op.drawingMode === null
          ? 'project drawing mode'
          : `drawing mode ${quoted(op.drawingMode)}`,
      );
    }
    if (op.direction !== undefined) {
      project = setContainerDirection(project, id, op.direction);
      changes.push(
        op.direction === null ? 'project direction' : `direction ${quoted(op.direction)}`,
      );
    }
    if (op.density !== undefined) {
      project = setContainerDensity(project, id, op.density);
      changes.push(op.density === null ? 'density 1x' : `density ${op.density}x`);
    }
    if (op.locked === true) {
      project = setImageLocked(project, id, true);
      changes.push('lock');
    }
    return {
      project,
      description: `Change the container "${this.refs(p).imageLabel(id)}": ${changes.join(', ') || 'nothing'}`,
    };
  }

  /** `replace_container` and the old `replace_image`: replaces the container's image file. */
  private async replaceContainerOp(
    op: Extract<Operation, { op: 'replace_container' | 'replace_image' }>,
    id: string,
    p: Project,
  ): Promise<Step> {
    const image = await this.image(op, p);
    let project = replaceContainer(
      p,
      id,
      { file: image.file, width: image.width, height: image.height },
      {
        confirmAspectChange: op.confirmAspectChange === true,
        minSizeOf: (markingId) => componentMinSize(p, this.catalog, markingId),
      },
    );
    if (op.source !== undefined) {
      project = setImageSource(project, id, toSource(op.source));
    }
    const old = projectIndex(p).containers.get(id)!;
    return {
      project,
      description: `Replace the image of the container "${this.refs(p).imageLabel(id)}": ${old.file} → ${image.file} (${image.width}×${image.height} px, ${image.note})`,
      imageFiles: [[image.file, image.data]],
    };
  }

  /**
   * Redoes the size of a new instance after the batch's table rows have been entered (the initial size
   * is measured before them, with the table empty): `fitMarking` and, if the marking was created anchored,
   * `snapToAnchor` with the component's defaults. A component that does not fit (slot, no `sizing`)
   * stays as it is.
   */
  private refitToRows(p: Project, markingId: string, anchored: boolean): Project {
    let next = p;
    try {
      next = fitMarking(next, this.catalog, markingId, this.measurer, {
        minSizeOf: (id) => componentMinSize(next, this.catalog, id),
      });
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      return p;
    }
    if (!anchored || projectIndex(next).markings.get(markingId)?.anchor == null)
      return next;
    try {
      return snapToAnchor(next, markingId, {
        defaults: markingAnchorDefaults(next, this.catalog),
      }).project;
    } catch (error) {
      if (!(error instanceof ModelError)) throw error;
      return next;
    }
  }

  /**
   * `fit_marking`: the model's `fitMarking` (the same as the app's Arrange on a marking without a slot), with the
   * annotation's values in the batch state. The summary gives the rectangle before and after.
   */
  private fitMarkingOp(op: Extract<Operation, { op: 'fit_marking' }>, p: Project): Step {
    const id = this.item(op.marking, 'm');
    const label = this.markingLabel(p, id);
    const before = projectIndex(p).markings.get(id)?.rect;
    if (before === undefined) throw new ModelError('not-found', id);
    const project = fitMarking(p, this.catalog, id, this.measurer, {
      minSizeOf: (markingId) => componentMinSize(p, this.catalog, markingId),
    });
    const rectText = (r: Rect): string => `${r.width}×${r.height} px at (${r.x}, ${r.y})`;
    if (project === p) {
      return {
        project,
        description: `The marking "${label}" is already the size of its content (${rectText(before)}): nothing changes`,
      };
    }
    const after = projectIndex(project).markings.get(id)!.rect;
    return {
      project,
      description: `Fit the marking "${label}" to its content: ${rectText(before)} → ${rectText(after)}`,
    };
  }

  /** The step's anchor: the target (reference, id or alias) becomes an id; `side`, `align` and `offset` only go in if given. */
  private markingAnchor(
    anchor: NonNullable<Extract<Operation, { op: 'update_marking' }>['anchor']>,
  ): MarkingAnchor {
    return {
      to: this.item(anchor.to, 'm'),
      ...(anchor.side === undefined ? {} : { side: anchor.side }),
      ...(anchor.align === undefined ? {} : { align: anchor.align }),
      ...(anchor.offset === undefined ? {} : { offset: anchor.offset }),
    };
  }

  /**
   * `snap_to_anchor`: the model's `snapToAnchor` (the same as the app's Snap), with the
   * marking's component defaults. The summary gives the rectangle before and after; the "clamped inside the
   * container" warning goes to `warnings`.
   */
  private snapToAnchorOp(
    op: Extract<Operation, { op: 'snap_to_anchor' }>,
    p: Project,
  ): Step {
    const id = this.item(op.marking, 'm');
    this.requireNotArrow(id, 'update_arrow');
    const label = this.markingLabel(p, id);
    const before = projectIndex(p).markings.get(id)?.rect;
    if (before === undefined) throw new ModelError('not-found', id);
    const { project, warnings } = snapToAnchor(p, id, {
      defaults: markingAnchorDefaults(p, this.catalog),
    });
    const notes = warnings.map((w) => w.text);
    const rectText = (r: Rect): string => `${r.width}×${r.height} px at (${r.x}, ${r.y})`;
    if (project === p) {
      return {
        project,
        description: `The marking "${label}" is already snapped to the anchor (${rectText(before)}): nothing changes`,
      };
    }
    const after = projectIndex(project).markings.get(id)!.rect;
    return {
      project,
      ...(notes.length > 0 ? { notes } : {}),
      description: `Snap the marking "${label}" to the anchor: ${rectText(before)} → ${rectText(after)}`,
    };
  }

  /** `delete_container` and the old `delete_image`. */
  private deleteContainerOp(id: string, p: Project): Step {
    const impact = containerDeletionImpact(p, id);
    return {
      project: removeContainer(p, id),
      description: `Delete the container "${this.refs(p).imageLabel(id)}" (${impact.markings} marking(s), ${impact.annotations} annotation(s))`,
    };
  }

  /** The id is an arrow's (arrows share the markings' id space). */
  private requireArrow(id: string): void {
    if (!projectIndex(this.p).arrows.has(id)) {
      throw new ToolError('wrong-kind', 'the reference is not to an arrow', {
        hint: 'use the id or the reference of an arrow (`arrows` of get_marking)',
      });
    }
  }

  /** The id is an arrow's in a marking tool: a friendly error pointing to the right tool. */
  private requireNotArrow(id: string, tool: 'update_arrow' | 'delete_arrow'): void {
    if (projectIndex(this.p).arrows.has(id)) {
      throw new ToolError(
        'wrong-kind',
        'the reference is to an arrow, not to a marking',
        {
          hint: `use ${tool} for the arrow`,
        },
      );
    }
  }

  private noPoints(op: { readonly points?: unknown }): void {
    if (op.points !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        "`points` is not accepted: the arrow's route belongs to the person (the server only provides the endpoints and the style)",
      );
    }
  }

  private createArrowOp(op: Extract<Operation, { op: 'create_arrow' }>): Step {
    this.noPoints(op);
    const from = this.item(op.from, 'm');
    const to = this.item(op.to, 'm');
    const id = crypto.randomUUID();
    const project = createArrow(this.p, {
      id,
      from,
      to,
      ...(op.style !== undefined ? { style: op.style } : {}),
      ...(op.name !== undefined ? { name: op.name } : {}),
    });
    return {
      project,
      description: `Create the arrow "${this.markingLabel(project, from)}" → "${this.markingLabel(project, to)}" (${projectIndex(project).arrows.get(id)!.style})`,
      created: [{ kind: 'm', id }],
    };
  }

  private updateArrowOp(op: Extract<Operation, { op: 'update_arrow' }>): Step {
    this.noPoints(op);
    const id = this.item(op.arrow, 'm');
    this.requireArrow(id);
    let project = this.p;
    const label = this.markingLabel(project, id);
    const changes: string[] = [];
    if (op.locked === false) {
      project = setArrowLocked(project, id, false);
      changes.push('unlock');
    }
    if (op.name !== undefined) {
      project = setArrowName(project, id, op.name);
      changes.push(`name ${quoted(projectIndex(project).arrows.get(id)!.name)}`);
    }
    if (op.style !== undefined) {
      project = setArrowStyle(project, id, op.style);
      changes.push(`style ${op.style}`);
    }
    if (op.locked === true) {
      project = setArrowLocked(project, id, true);
      changes.push('lock');
    }
    // The proposal only carries the creation and removal of an arrow: the name, style and lock of an arrow that
    // already exists in the project belong to the person and do not become a change.
    const existing = (this.io.diskProject ?? this.loaded.project).arrows.some(
      (a) => a.id === id,
    );
    return {
      project,
      description: `Change the arrow "${label}": ${changes.join(', ') || 'nothing'}`,
      ...(existing && changes.length > 0
        ? {
            notes: [
              "the proposal only carries the creation and removal of arrows: a change of name, style or lock of an arrow that already exists is not included in the proposal (it applies in this batch's preview and to an arrow created in it)",
            ],
          }
        : {}),
    };
  }

  /**
   * Target of `near`: a container or a marking (never an arrow), by alias, reference or id.
   */
  private nearTarget(text: string): FloatingNearTarget {
    const target = this.containerOrMarking(text);
    if (target.kind === 'marking' && projectIndex(this.p).arrows.has(target.id)) {
      throw new ToolError('invalid-arguments', '`near` does not accept an arrow', {
        hint: 'provide a container or a marking',
      });
    }
    return target;
  }

  /** Container or marking (or arrow, which is a marking for the reference), by alias, reference or id. */
  private containerOrMarking(text: string): FloatingNearTarget {
    const wanted = text.trim();
    const index = projectIndex(this.p);
    if (wanted.startsWith('$')) {
      const target = this.aliases.get(wanted);
      if (target && 'id' in target && target.kind === 'i') {
        return { kind: 'container', id: target.id };
      }
    } else {
      const parsed = parseRef(wanted);
      if (parsed?.kind === 'i') return { kind: 'container', id: this.item(wanted, 'i') };
      if (parsed === null || parsed.kind === null) {
        if (index.containers.has(wanted)) return { kind: 'container', id: wanted };
      }
    }
    return { kind: 'marking', id: this.item(wanted, 'm') };
  }

  /**
   * `wrap_items`: the model's `wrapItems` (the same as the app's Wrap), with a new id and an optional
   * name and source. Notes and arrows do not go in (warning); if nothing goes in, `invalid-parent`.
   */
  private wrapItemsOp(op: Extract<Operation, { op: 'wrap_items' }>): Step {
    const p = this.p;
    const index = projectIndex(p);
    const refs = new Map<string, ItemRef>();
    for (const text of op.items) {
      const target = this.containerOrMarking(text);
      const kind =
        target.kind === 'container'
          ? 'image'
          : index.arrows.has(target.id)
            ? 'arrow'
            : 'marking';
      refs.set(`${kind}:${target.id}`, { kind, id: target.id });
    }
    const items = [...refs.values()];
    const entering = items.filter((item) => canWrapItems(p, [item]));
    if (entering.length === 0) {
      throw new ModelError(
        'invalid-parent',
        'nothing to wrap: notes (floating) and arrows do not go in; provide at least one non-floating marking or a container',
      );
    }
    const ignored = items.length - entering.length;
    const markingId = crypto.randomUUID();
    let project = wrapItems(p, { id: markingId, items });
    if (op.name !== undefined) project = renameMarking(project, markingId, op.name);
    if (op.source !== undefined) {
      project = setMarkingSource(project, markingId, toSource(op.source));
    }
    const { rect } = projectIndex(project).markings.get(markingId)!;
    return {
      project,
      ...(ignored > 0
        ? {
            notes: [
              `${ignored} item(s) ignored: notes (floating) and arrows do not go into a parent marking`,
            ],
          }
        : {}),
      description: `Wrap ${entering.length} ${entering.length === 1 ? 'item' : 'items'} in a new marking "${this.markingLabel(project, markingId)}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'm', id: markingId }],
    };
  }

  /**
   * Creates a marking per typed node of the measured tree, each one through `create_marking` (the parent
   * comes from the geometry, never from the tree). A node that cannot be created (minimum size, for example)
   * becomes a warning and the others carry on; the CF10 drawing proof looks at what the batch created.
   */
  private async importMeasuredOp(
    op: Extract<Operation, { op: 'import_measured' }>,
  ): Promise<Step> {
    const tree = await measuredTree(op, this.io);
    const plan = planMeasured(this.p, op, tree);
    this.containerItem(op.container);
    const notes = [...plan.warnings];
    const created: { kind: CreatedKind; id: string }[] = [];
    const rowAliases: [string, AliasTarget][] = [];
    let project = this.p;
    for (const marking of plan.markings) {
      try {
        this.p = project;
        const step = this.createMarkingOp({
          op: 'create_marking',
          container: op.container,
          rect: marking.rect,
          annotation: {
            type: `${marking.specId}/${marking.typeId}`,
            values: marking.values as CreateMarkingValues,
          },
        });
        project = step.project;
        created.push(...(step.created ?? []));
        rowAliases.push(...(step.rowAliases ?? []));
        notes.push(...(step.notes ?? []));
      } catch (error) {
        if (!(error instanceof ToolError || error instanceof ModelError)) throw error;
        notes.push(`${marking.path}: not created (${error.message})`);
      }
    }
    const made = created.filter((c) => c.kind === 'm').length;
    return {
      project,
      notes,
      created,
      rowAliases,
      description: `Import measured layout "${op.system}": ${made} marking(s) created${
        plan.markings.length > made ? `, ${plan.markings.length - made} not created` : ''
      }`,
    };
  }

  private createMarkingOp(op: Extract<Operation, { op: 'create_marking' }>): Step {
    const p = this.p;
    const catalog = this.catalog;
    const annotation = op.annotation;
    if (annotation === undefined && op.annotationAs !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`annotationAs` only applies with `annotation` in the same operation',
      );
    }
    if (op.container !== undefined && op.image !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        'provide `container` (the old `image` is also accepted), not both',
      );
    }
    const containerRef = op.container ?? op.image;
    // `inside`: the target (a component with a slot) gives the container; the stored parent still comes from the geometry.
    const inside = op.inside === undefined ? null : this.insideTarget(op, containerRef);
    // Without `container`: canvas marking (rect in canvas units, possibly negative).
    const containerId = inside
      ? inside.containerId
      : containerRef === undefined
        ? null
        : this.containerItem(containerRef, p);
    const markingId = crypto.randomUUID();
    const typeRef = annotation ? this.type(annotation.type) : null;
    const component =
      typeRef === null
        ? null
        : (this.componentTypeMap(p, catalog).get(`${typeRef.specId}/${typeRef.typeId}`) ??
          null);
    if (inside !== null && component === null) {
      throw new ToolError(
        'invalid-arguments',
        '`inside` only applies with `annotation` of a type with a component (see list_components)',
      );
    }
    const anchor = op.anchor === undefined ? null : this.markingAnchor(op.anchor);
    // The anchor is checked before creating (the invariant's errors); after settling, only the space
    // may have changed and then the new marking is created without an anchor, with a warning.
    if (anchor !== null) checkAnchorTarget(p, markingId, containerId, anchor);
    if (anchor !== null && (op.near !== undefined || inside !== null)) {
      throw new ToolError(
        'invalid-arguments',
        '`anchor` and `near`/`inside` are different placements: provide only one',
      );
    }
    if (op.rect === undefined && component === null) {
      throw new ToolError(
        'invalid-arguments',
        '`rect` is required (only an annotation type with a component dispenses with the rectangle: see list_components)',
      );
    }
    // With a component the minimum is its `minSize` or 1×1; without a component, that of any marking (8).
    const minSize =
      component === null
        ? null
        : componentFileMinSize(component.component, effectiveDensity(p, containerId));
    // `near` (ME4): only a floating type; the spot comes from `placeFloatingNear` and the `rect`, if given,
    // supplies only the size. In the other cases the argument is ignored, with a warning.
    const notes: string[] = [];
    let nearRect: { x: number; y: number; width: number; height: number } | null = null;
    if (op.near !== undefined) {
      if (component?.floating === true && containerId === null) {
        const target = this.nearTarget(op.near);
        const size =
          op.rect ??
          componentSize(
            p,
            catalog,
            {
              containerId: null,
              parentId: null,
              ...typeRef!,
              ...initialValuesArg(op.annotation?.values),
            },
            this.measurer,
          );
        nearRect = placeFloatingNear(p, target, size);
      } else {
        notes.push(
          '`near` only applies to a floating annotation type, without `container`: it was ignored (to place the marking in a container, use `container` and `rect`)',
        );
      }
    }
    if (typeRef !== null && component === null) {
      const missing = missingComponentNote(p, catalog, typeRef);
      if (missing !== null) notes.push(missing);
    }
    const rowAliases: [string, AliasTarget][] = [];
    let project: Project;
    let annotationId: string | null = null;

    if (annotation && typeRef !== null && component !== null) {
      const newAnnotationId = crypto.randomUUID();
      annotationId = newAnnotationId;
      // The parent comes from the geometry (the model settles on creation): without `rect`, in the center of the container.
      // The size came from the component (not from the request): the batch's table rows did not
      // exist yet when it was measured, so `refitToRows` redoes it after `setValues`.
      const rectFromComponent =
        nearRect === null && inside === null && op.rect === undefined;
      const rect =
        nearRect ??
        (inside ? this.insideRect(op, inside.id, containerId, typeRef, minSize) : null) ??
        op.rect ??
        this.anchoredRect(p, notes, markingId, containerId, typeRef, op, anchor) ??
        componentPlacement(
          p,
          catalog,
          {
            containerId,
            parentId: null,
            ...typeRef,
            ...initialValuesArg(annotation.values),
          },
          this.measurer,
        );
      if (annotation.layer !== undefined) {
        const layer = this.layer(annotation.layer);
        if (
          layer.spec?.specId !== typeRef.specId ||
          layer.spec.layerId !== component.layerId
        ) {
          throw new ModelError('type-not-in-layer');
        }
      }
      project = this.checkMinSize(minSize, `"${typeRef.specId}/${typeRef.typeId}"`, () =>
        addComponentMarking(
          p,
          catalog,
          {
            markingId,
            annotationId: newAnnotationId,
            containerId,
            parentId: inside?.id ?? null,
            ...typeRef,
            rect,
            name: op.name ?? null,
            ...(anchor === null ? {} : { anchor }),
          },
          this.measurer,
        ),
      );
      if (inside) {
        this.noteInsideFit(notes, p, project, inside.id, {
          id: markingId,
          rect,
          asked: op.rect,
        });
      }
      if (annotation.name !== undefined) {
        project = renameAnnotation(project, newAnnotationId, annotation.name);
      }
      if (annotation.values !== undefined) {
        project = this.setValues(project, newAnnotationId, annotation.values, rowAliases);
        if (rectFromComponent && hasTableValue(annotation.values)) {
          project = this.refitToRows(project, markingId, anchor !== null);
        }
      }
    } else {
      project = createMarking(p, {
        id: markingId,
        containerId,
        rect: op.rect!,
        name: op.name ?? null,
      });
      if (anchor !== null) project = setNewMarkingAnchor(project, markingId, anchor);
      if (annotation && typeRef !== null) {
        annotationId = crypto.randomUUID();
        project = this.typedAnnotation(project, annotationId, markingId, {
          type: typeRef,
          layer: annotation.layer,
          name: annotation.name,
          values: annotation.values,
          ownerId: null,
          rowAliases,
        });
      }
    }
    if (op.source !== undefined) {
      project = setMarkingSource(project, markingId, toSource(op.source));
    }
    // The new marking is at the end of the array (settling does not reorder): the backward search is O(1).
    let created!: Marking;
    for (let i = project.markings.length - 1; i >= 0; i--) {
      if (project.markings[i]!.id === markingId) {
        created = project.markings[i]!;
        break;
      }
    }
    const { rect } = created;
    if (anchor !== null && created.anchor == null) {
      notes.push(
        'the anchor was dropped: by geometry the marking was created in a different space than the target (the container or the canvas); anchor it afterwards with `update_marking`, in the same space as the target',
      );
    }
    const label = this.createdMarkingLabel(p, project, created, component?.name ?? null);
    return {
      project,
      ...(notes.length > 0 ? { notes } : {}),
      description: `Create the marking "${label}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
        op.rect === undefined ? ', initial size of the component' : ''
      }${op.source ? `, ${sourceLabel(toSource(op.source))}` : ''})${
        typeRef ? ` with the annotation ${typeRef.specId}/${typeRef.typeId}` : ''
      }`,
      created: [
        { kind: 'm', id: markingId },
        ...(annotationId ? [{ kind: 'a' as const, id: annotationId }] : []),
      ],
      rowAliases,
    };
  }

  /**
   * The rectangle of a new instance with `anchor` and without `rect`: the measured size snapped to the target,
   * with the component's defaults; `null` when there is no `anchor` or the `rect` rules. The "clamped
   * inside the container" warning goes to the notes.
   */
  private anchoredRect(
    p: Project,
    notes: string[],
    markingId: string,
    containerId: string | null,
    typeRef: AnnotationTypeRef,
    op: Extract<Operation, { op: 'create_marking' }>,
    anchor: MarkingAnchor | null,
  ): Rect | null {
    if (anchor === null || op.rect !== undefined) return null;
    const placed = componentAnchoredPlacement(
      p,
      this.catalog,
      {
        markingId,
        containerId,
        parentId: null,
        ...typeRef,
        ...initialValuesArg(op.annotation?.values),
        anchor,
        anchorDefaults: typeAnchorDefaults(this.catalog, typeRef.specId, typeRef.typeId),
      },
      this.measurer,
    );
    notes.push(...placed.warnings.map((w) => w.text));
    return placed.rect;
  }

  /**
   * Target of the `inside` of `create_marking`: a marking (from the batch or the project) that draws a
   * component with a slot. It only positions: the stored parent comes from the geometry. `container`, if given,
   * must be the target's.
   */
  private insideTarget(
    op: Extract<Operation, { op: 'create_marking' }>,
    containerRef: string | undefined,
  ): { id: string; containerId: string | null } {
    if (op.near !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`inside` and `near` are two placements: provide only one',
      );
    }
    if (op.annotation === undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`inside` only applies with `annotation` of a type with a component (see list_components)',
      );
    }
    const id = this.item(op.inside!, 'm');
    const target = this.p.markings.find((m) => m.id === id);
    if (
      target === undefined ||
      !hasComponentSlot(this.p, this.catalog, id, this.measurer)
    ) {
      throw new ModelError(
        'invalid-parent',
        '`inside` must be a marking that draws a component with a slot (see list_components: only a component with a slot, such as Column or Row, receives children)',
      );
    }
    if (
      containerRef !== undefined &&
      this.containerItem(containerRef, this.p) !== target.containerId
    ) {
      throw new ModelError(
        'invalid-parent',
        '`container` is not the container of the `inside` target: omit `container` (it comes from the target)',
      );
    }
    return { id, containerId: target.containerId };
  }

  /** Rectangle of the child in the target's slot; the step's `rect` supplies only the size (x and y are ignored). */
  private insideRect(
    op: Extract<Operation, { op: 'create_marking' }>,
    targetId: string,
    containerId: string | null,
    typeRef: AnnotationTypeRef,
    minSize: { width: number; height: number } | null,
  ): Rect {
    const { rect } = op;
    if (
      rect !== undefined &&
      minSize !== null &&
      (rect.width < minSize.width || rect.height < minSize.height)
    ) {
      this.checkMinSize(minSize, `"${typeRef.specId}/${typeRef.typeId}"`, () => {
        throw new ModelError('rect-too-small', undefined, {
          received: { width: rect.width, height: rect.height },
          min: { ...minSize },
          source: 'component',
        });
      });
    }
    return componentPlacement(
      this.p,
      this.catalog,
      {
        containerId,
        parentId: targetId,
        ...typeRef,
        ...(rect === undefined
          ? {}
          : { size: { width: rect.width, height: rect.height } }),
        ...initialValuesArg(op.annotation?.values),
      },
      this.measurer,
    );
  }

  /**
   * Warnings of `inside`: full slot (the child did not fit in the slot's area), stored parent that is not the
   * target (and who it ended up in, even when it fit) and `rect` shrunk to the slot.
   */
  private noteInsideFit(
    notes: string[],
    before: Project,
    after: Project,
    targetId: string,
    created: { id: string; rect: Rect; asked: Rect | undefined },
  ): void {
    const target = this.markingLabel(after, targetId);
    const { asked, rect } = created;
    if (asked && (asked.width !== rect.width || asked.height !== rect.height)) {
      notes.push(
        `the size of the \`rect\` (${asked.width}×${asked.height}) does not fit in the slot of ${target}: the marking was created at ${rect.width}×${rect.height}`,
      );
    }
    const parentId = projectIndex(after).markings.get(created.id)?.parentId ?? null;
    const where =
      parentId === targetId
        ? ''
        : parentId === null
          ? '; it ended up outside it'
          : `; it ended up inside ${this.markingLabel(after, parentId)}`;
    if (!placementFitsSlot(before, this.catalog, targetId, rect, this.measurer)) {
      notes.push(
        `the marking did not fit in the slot of ${target}: enlarge the component or use Arrange in the app${where}`,
      );
    } else if (where !== '') {
      notes.push(
        `the marking was created in the slot of ${target}, but the stored parent is not it${where}`,
      );
    }
  }

  /** New typed annotation: the type's layer (or the one given), owner and values field by field. */
  private typedAnnotation(
    p: Project,
    id: string,
    markingId: string,
    args: {
      readonly type: AnnotationTypeRef;
      readonly layer: string | undefined;
      readonly name: string | null | undefined;
      readonly values: Record<string, JsonValue> | undefined;
      readonly ownerId: string | null;
      readonly rowAliases: [string, AliasTarget][];
    },
  ): Project {
    const { type } = args;
    const typeLayer = projectIndex(p).types.get(typeKey(type.specId, type.typeId))!.layer;
    const layer =
      args.layer !== undefined
        ? this.layer(args.layer)
        : (projectLayerFor(p, type.specId, typeLayer.id) ??
          fail(
            'not-found',
            `the specialization's layer "${typeLayer.name}" is not in the project`,
          ));
    let project = addTypedAnnotation(p, {
      id,
      markingId,
      layerId: layer.id,
      type,
      name: args.name ?? null,
      parentAnnotationId: args.ownerId,
    });
    if (args.values !== undefined) {
      project = this.setValues(project, id, args.values, args.rowAliases);
    }
    return project;
  }

  private createAnnotation(op: Extract<Operation, { op: 'create_annotation' }>): Step {
    const p = this.p;
    const markingId = this.item(op.marking, 'm');
    const id = crypto.randomUUID();
    const ownerId =
      op.owner === undefined || op.owner === null ? null : this.item(op.owner, 'a');
    const rowAliases: [string, AliasTarget][] = [];
    let project: Project;
    if (op.type !== undefined) {
      if (op.entries !== undefined) {
        throw new ModelError('typed-annotation');
      }
      project = this.typedAnnotation(p, id, markingId, {
        type: this.type(op.type),
        layer: op.layer,
        name: op.name,
        values: op.values,
        ownerId,
        rowAliases,
      });
    } else {
      if (op.layer === undefined) {
        throw new ToolError(
          'layer-required',
          'free-form annotation: provide `layer` (or `type` for a typed annotation)',
        );
      }
      if (op.values !== undefined) throw new ModelError('not-typed');
      const layer = this.layer(op.layer);
      project = addAnnotation(p, {
        id,
        markingId,
        layerId: layer.id,
        name: op.name ?? null,
        entries: this.entries(p, null, op.entries ?? []),
      });
      if (ownerId !== null) project = setAnnotationParent(project, id, ownerId);
    }
    if (op.role !== undefined && op.role !== null) {
      project = setAnnotationRole(project, id, op.role);
    }
    const ownerAnnotation = ownerId
      ? projectIndex(project).annotations.get(ownerId)
      : undefined;
    const owner = ownerAnnotation
      ? `, linked to ${annotationShortLabel(project, ownerAnnotation)}${
          op.role ? ` (role "${roleNameOf(project, ownerAnnotation, op.role)}")` : ''
        }`
      : '';
    const layerName = projectIndex(project).layers.get(
      projectIndex(project).annotations.get(id)!.layerId,
    )!.name;
    return {
      project,
      description: `Create the annotation ${this.annotationLabel(project, id)} in the layer "${layerName}"${owner}`,
      created: [{ kind: 'a', id }],
      rowAliases,
    };
  }

  /** Name of the role the annotation holds in the owner, for the step's description. */
  private roleName(p: Project, id: string): string {
    const a = projectIndex(p).annotations.get(id)!;
    const owner = a.parentAnnotationId
      ? projectIndex(p).annotations.get(a.parentAnnotationId)
      : undefined;
    return roleNameOf(p, owner, a.parentRole ?? '');
  }

  private updateAnnotation(op: Extract<Operation, { op: 'update_annotation' }>): Step {
    const p = this.p;
    const id = this.item(op.annotation, 'a');
    const label = this.annotationLabel(p, id);
    const rowAliases: [string, AliasTarget][] = [];
    const changes: string[] = [];
    let project = p;
    if (op.name !== undefined) {
      project = renameAnnotation(project, id, op.name);
      changes.push(`name ${quoted(projectIndex(project).annotations.get(id)!.name)}`);
    }
    if (op.entries !== undefined) {
      project = setEntries(project, id, this.entries(project, id, op.entries));
      changes.push(`${op.entries.length} pair(s)`);
    }
    if (op.values !== undefined) {
      project = this.setValues(project, id, op.values, rowAliases);
      changes.push(`fields ${Object.keys(op.values).join(', ')}`);
    }
    let roleCleared: Step['roleCleared'];
    if (op.owner !== undefined) {
      const moved = this.changeOwner(project, id, op.owner, op.role === undefined);
      project = moved.project;
      changes.push(moved.change);
      roleCleared = moved.roleCleared;
    }
    if (op.role !== undefined) {
      project = setAnnotationRole(project, id, op.role);
      changes.push(op.role === null ? 'no role' : `role "${this.roleName(project, id)}"`);
    }
    return {
      project,
      description: `Change the annotation ${label}: ${changes.join(', ') || 'nothing'}`,
      rowAliases,
      ...(roleCleared ? { roleCleared } : {}),
    };
  }

  /**
   * Changes the owner (or removes it, with `null`). If the annotation's role goes with it and the step does not
   * carry `role` (`roleUnset`), the note goes into the step's text and the `role-cleared` warning is returned.
   */
  private changeOwner(
    p: Project,
    id: string,
    owner: string | null,
    roleUnset: boolean,
  ): { project: Project; change: string; roleCleared?: Step['roleCleared'] } {
    const ownerId = owner === null ? null : this.item(owner, 'a', p);
    const roleId = projectIndex(p).annotations.get(id)!.parentRole;
    const roleName = roleId === null ? '' : this.roleName(p, id);
    const project = setAnnotationParent(p, id, ownerId);
    const where =
      ownerId === null
        ? 'no owner'
        : `owner ${annotationShortLabel(project, projectIndex(project).annotations.get(ownerId)!)}`;
    const cleared =
      roleId !== null &&
      roleUnset &&
      projectIndex(project).annotations.get(id)!.parentRole === null;
    if (!cleared) return { project, change: where };
    const reason =
      ownerId === null
        ? 'the annotation is left without an owner'
        : 'the new owner does not offer it';
    return {
      project,
      change: `${where}; role ${quoted(roleName)} cleared`,
      roleCleared: {
        annotationId: id,
        role: roleId,
        roleName,
        message: `the role ${quoted(roleName)} of ${this.annotationLabel(p, id)} is cleared: ${reason}`,
      },
    };
  }
}

function kindLabel(kind: AliasTarget['kind']): string {
  return kind === 'row' ? 'a table row' : KIND_LABEL[kind];
}

function fail(code: 'not-found', message: string): never {
  throw new ToolError(code, message);
}

/** Applies the batch on the loaded project, without writing anything. */
export function runBatch(
  loaded: LoadedProject,
  operations: readonly Operation[],
  io: BatchIo,
): Promise<BatchResult> {
  return new Batch(loaded, io).run(operations);
}

/** Items created, changed and deleted, per collection (comparing before and after). */
export function changeCounts(before: Project, after: Project): Record<string, unknown> {
  const count = <T extends { readonly id: string }>(a: readonly T[], b: readonly T[]) => {
    const old = new Map(a.map((item) => [item.id, JSON.stringify(item)]));
    const next = new Set(b.map((item) => item.id));
    let created = 0;
    let updated = 0;
    for (const item of b) {
      const previous = old.get(item.id);
      if (previous === undefined) created++;
      else if (previous !== JSON.stringify(item)) updated++;
    }
    const deleted = a.filter((item) => !next.has(item.id)).length;
    return { created, updated, deleted };
  };
  const specs = (p: Project) =>
    p.specializations.map((s) => ({ id: s.id, version: s.version, file: s.file }));
  const repos = (p: Project) =>
    Object.entries(p.platformRepos).map(([id, repo]) => ({ id, ...repo }));
  const docRepos = (p: Project) =>
    Object.entries(p.docRepos).map(([id, repo]) => ({ id, ...repo }));
  return {
    specializations: count(specs(before), specs(after)),
    layers: count(before.layers, after.layers),
    containers: count(before.containers, after.containers),
    markings: count(before.markings, after.markings),
    arrows: count(before.arrows, after.arrows),
    annotations: count(before.annotations, after.annotations),
    platformRepos: count(repos(before), repos(after)),
    docRepos: count(docRepos(before), docRepos(after)),
  };
}

/** Pending items (incomplete annotations) that the batch creates or resolves. */
export function issueChanges(refs: Refs, before: Project): Record<string, unknown> {
  const after = refs.project;
  const old = projectIssues(before);
  const next = projectIssues(after);
  const added = [...next.entries()]
    .filter(([id]) => !old.has(id))
    .map(([id, issues]) => ({
      annotation: refs.ref('a', id),
      issues: issues.map((i) => ({ code: i.code, ...(i.key ? { key: i.key } : {}) })),
    }));
  const resolved = [...old.keys()].filter((id) => !next.has(id)).length;
  return { before: old.size, after: next.size, resolved, new: added };
}

/**
 * The specialization notices that the annotations created or changed by the batch come to have
 * (stage #486, decision 11), from the same changes that the proposal review shows
 * (`changeNotices`), from the most serious to the least and, within the same `kind`, in the order they appear.
 */
export function noticeChanges(
  refs: Refs,
  before: Project,
  changes: readonly Change[],
): Record<string, unknown> {
  const after = refs.project;
  const seen = new Set<string>();
  const entries: { kind: SpecNotice['kind']; view: Record<string, unknown> }[] = [];
  for (const change of changes) {
    for (const usage of changeNotices(after, change, change.field ?? '')) {
      const id = JSON.stringify([
        change.entityId,
        usage.key,
        usage.column,
        usage.notice.kind,
        usage.notice.message,
      ]);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        kind: usage.notice.kind,
        view: {
          annotation: refs.ref('a', change.entityId),
          type: usage.typeId,
          kind: usage.notice.kind,
          message: usage.notice.message,
          ...(usage.key ? { key: usage.key } : {}),
          ...(usage.column ? { column: usage.column } : {}),
        },
      });
    }
  }
  entries.sort((a, b) => NOTICE_KINDS.indexOf(a.kind) - NOTICE_KINDS.indexOf(b.kind));
  return { new: entries.map((e) => e.view) };
}
