import {
  BatchRuleError,
  applyFormatResult,
  type FormatApplyError,
  type FormatResult,
  applyContainerSettings,
  resolveBeside,
  KIND_WITH_ARTICLE,
  containerPageArg,
  guardMinSize,
  markingRootPageId,
  resolveContainerOrMarking,
  resolveItem,
  resolveLayer,
  resolveNearTarget,
  resolvePage,
  resolveType,
  rootPageId,
  type RefContext,
  ModelError,
  addBatchBackgroundContainer,
  addBatchTypedAnnotation,
  annotationLabelOf,
  refuseArrowAsMarking,
  batchRefValue,
  createBatchAnnotation,
  createBatchArrow,
  refuseArrowPoints,
  setBatchValues,
  updateBatchAnnotation,
  type AnnotationResolver,
  type RowAliasTarget,
  type RowAliases,
  createBatchMarking,
  externalSourceLabel as sourceLabel,
  quotedLabel as quoted,
  toExternalSource as toSource,
  updateBatchMarking,
  type MarkingContext,
  NOTICE_KINDS,
  createPage,
  deletePage,
  movePage,
  moveRootsToPage,
  pageContent,
  renamePage,
  type Page,
  changeNotices,
  type Change,
  type SpecNotice,
  addContainer,
  addLayer,
  arrowDeletionImpact,
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
  effectiveDensity,
  componentMinSize,
  fitMarking,
  snapToAnchor,
  markingAnchorDefaults,
  componentTypes,
  loadSpecComponents,
  type ComponentCatalog,
  type ComponentType,
  type TextMeasurer,
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
  moveLayer,
  nextLayerColor,
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
  renameContainer,
  renameLayer,
  renameMarking,
  replaceContainer,
  roleNameOf,
  setDocRepo,
  setImageLocked,
  setContainerDensity,
  setContainerDirection,
  setContainerDrawingMode,
  setContainerMarkingColor,
  setProjectDirection,
  setProjectDrawingMode,
  setImageMarkingsLocked,
  setContainerPlacement,
  snapPlacement,
  setImageSource,
  setLayerColor,
  setMarkingSource,
  setPlatformRepo,
  specializationRemovalImpact,
  updateSpecialization,
  uniqueImageFile,
  validateProject,
  type AnnotationIssue,
  type AnnotationTypeRef,
  type ItemKind,
  type JsonValue,
  type Layer,
  type Marking,
  type Project,
  type Rect,
  type Size,
  type Spec,
  type SpecField,
  type SpecAnnotationType,
  type SpecUpdateImpact,
  canWrapItems,
  wrapItems,
  type ItemRef,
} from '../src/model';
import type { LibraryIssue } from '../src/model/library';
import { applyClassChoices } from './containerClassOps';
import { ToolError, type ToolErrorCode } from './errors';
import {
  checkUpdate,
  packageFileEntries,
  parsePackage,
  requireValid,
  updateSummary,
  validatePackage,
} from './libraryUpdate';
import {
  builtinSpecInput,
  checkBuiltinArgument,
  type ReadPackage,
  type SpecInput,
} from './library';
import { MAX_BASE64_LENGTH, MIME, detectFormat } from './image/formats';
import { builtinFontBook, measurerFor } from './image/textMeasurer';
import { prepareImage } from './imagePrepare';
import { Refs } from './items';
import { containersNamed } from './markingList';
import { MODEL_ERROR_MESSAGES, describeModelError } from './modelErrors';
import { measuredTree, planMeasured } from './importMeasured';
import { importText, pluginOperations } from './formatImport';
import {
  findFileFormat,
  formatProjection,
  parseFormat,
  type PluginReader,
} from './formatTools';
import { containerClassIssueView } from './views';
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
  /**
   * Reads a text file of the project by its path in the project (`specs/<id>/plugins/a.js`): the
   * plugin of a format of an applied specialization. Absent = no plugin can be read (`import_format`
   * fails with `plugin-failed`); the files a batch itself brings are looked up first.
   */
  readProjectText?(path: string): Promise<string | null>;
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
  { readonly kind: 'layer' | 'page' | ItemKind; readonly id: string } | RowAliasTarget;

type CreatedKind = 'layer' | 'page' | ItemKind;

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
  /** What each `import_format` step changed (the created items are in `created`). */
  readonly formatImports: readonly FormatImportResult[];
  /** Cross-collection rules violated by the result (should not happen). */
  readonly invariantIssues: readonly string[];
  /** Component catalog after the batch (with the specializations it applied, updated or removed). */
  readonly catalog: ComponentCatalog;
}

/** What an `import_format` step updated and the warnings of its plugin. */
export interface FormatImportResult {
  readonly index: number;
  readonly format: string;
  readonly updated: readonly { readonly kind: CreatedKind; readonly id: string }[];
  readonly warnings: readonly string[];
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
  readonly rowAliases?: readonly [string, RowAliasTarget][];
  readonly imageFiles?: readonly [string, Uint8Array][];
  /** The `import_format` step: what it updated and the warnings of the plugin. */
  readonly imported?: Omit<FormatImportResult, 'index'>;
}

const KIND_LABEL: Record<CreatedKind, string> = {
  layer: 'a layer',
  page: 'a page',
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

/** The items of a wrap are on one page (`page-mixed` otherwise); arrows count through their ends. */
function requireSinglePage(p: Project, ids: readonly string[]): void {
  const { pageOf } = projectIndex(p);
  const pages = new Set(ids.map((id) => pageOf.get(id)));
  if (pages.size <= 1) return;
  const names = [...pages].map(
    (id) => `"${p.pages.find((g) => g.id === id)?.name ?? id}"`,
  );
  throw new ModelError('page-mixed', `the items are on ${names.join(', ')}`);
}

/** The name in quotes and a space, or nothing (for sentences like "container <name> with …"). */
const nameLabel = (name: string | undefined): string =>
  name === undefined ? '' : `${quoted(name)} `;

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

type CreateMarkingValues = NonNullable<
  Extract<Operation, { op: 'create_marking' }>['annotation']
>['values'];

class Batch {
  private p: Project;
  /** Aliases of the batch; an `import_format` step swaps in its own while its operations run. */
  private aliases = new Map<string, AliasTarget>();
  /** Index of the operation being applied (the paths of an `import_format` error). */
  private current = 0;
  private readonly formatImports: FormatImportResult[] = [];
  /** Count of the first 8 characters (normalized) of the marking and arrow ids, for the version in `project`. */
  private prefixCounts: { project: Project; counts: Map<string, number> } | null = null;

  private componentTypes: {
    specs: Project['specializations'];
    catalog: ComponentCatalog;
    map: ReadonlyMap<string, ComponentType>;
  } | null = null;

  /** Aliases of operations that failed: the ones that depend on them say why. */
  private failedAliases = new Map<string, number>();
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
      this.current = index;
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
        this.takeImport(index, op.op, step);
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
      formatImports: this.formatImports,
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

  /** The `import_format` step's record, and its plugin's warnings as warnings of the report. */
  private takeImport(index: number, op: string, step: Step): void {
    if (step.imported === undefined) return;
    this.formatImports.push({ index, ...step.imported });
    for (const message of step.imported.warnings) {
      this.deprecations.push({ index, op, message, code: 'format-warning' });
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
    return this.rules(() => resolveItem(this.refContext(), p, text, kind));
  }

  /** What the model's lookups need from the batch: the project's name and its aliases. */
  private refContext(): RefContext {
    const { loaded } = this;
    return {
      // Read when a reference names its project (a batch built only to read values has no location).
      get projectName() {
        return loaded.location.name;
      },
      alias: (name, kind) => {
        const target = this.alias(name, kind);
        return { id: 'id' in target ? target.id : '' };
      },
      containerAlias: (name) => {
        const target = this.aliases.get(name);
        return target && 'id' in target && target.kind === 'i' ? target : undefined;
      },
    };
  }

  private layer(text: string, p: Project = this.p): Layer {
    return this.rules(() =>
      resolveLayer(
        this.refContext(),
        p,
        text,
        (specId, layerId) => projectLayerFor(p, specId, layerId) ?? null,
      ),
    );
  }

  private page(text: string, p: Project = this.p): Page {
    return this.rules(() => resolvePage(this.refContext(), p, text));
  }

  private rootPageId(
    p: Project,
    pageText: string | undefined,
    implied: string | null,
  ): string | undefined {
    return this.rules(() => rootPageId(this.refContext(), p, pageText, implied));
  }

  private containerPage(
    op: { readonly page?: string },
    p: Project,
    beside: string | undefined,
  ): { pageId?: string } {
    return this.rules(() => containerPageArg(this.refContext(), p, op.page, beside));
  }

  private markingPageId(
    op: { readonly page: string | undefined; readonly near: string | undefined },
    p: Project,
    containerId: string | null,
    reference: {
      readonly inside: string | null;
      readonly anchor: string | null;
      readonly nearUsed: boolean;
    },
  ): string | undefined {
    return this.rules(() =>
      markingRootPageId(this.refContext(), p, op, containerId, reference),
    );
  }

  private type(text: string, p: Project = this.p): AnnotationTypeRef {
    return this.rules(() => resolveType(p, text));
  }

  /**
   * Reads what `file` points to: a v1 to v3 specialization file, or the v4 package (the folder, or the
   * specialization file inside it). The package is validated with the same levels as
   * `validate_library`: an error blocks (`invalid-library`), a warning goes on and comes back in the result.
   * On an update, the applied copy binds the version contract (`previous`).
   */
  private async loadSpec(
    source: { file?: string | undefined; builtin?: string | undefined },
    mode: 'apply' | 'update',
    p: Project,
  ): Promise<LoadedSpec> {
    checkBuiltinArgument(source.file, source.builtin, 'file');
    const input =
      source.builtin !== undefined
        ? builtinSpecInput(source.builtin)
        : await this.io.readSpecInput(source.file!);
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

  /** The model's `RefValue` of a reference in the agent's format (`measure_component` takes `values` this way). */
  storedRef(input: JsonValue, key: string): JsonValue {
    return this.rules(() => batchRefValue(this.annotationRefs(), input, key, this.p));
  }

  /** What the model's annotation and arrow rules need from the batch: its references, aliases and labels. */
  private annotationRefs(): AnnotationResolver {
    return {
      marking: (ref) => this.item(ref, 'm'),
      annotation: (ref, p) => this.item(ref, 'a', p),
      layer: (ref, p) => this.layer(ref, p),
      type: (ref, p) => this.type(ref, p),
      rowAlias: (name) => this.alias(name, 'row') as RowAliasTarget,
      aliasTaken: (name) => this.aliases.has(name),
      markingLabel: (p, id) => this.markingLabel(p, id),
    };
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
    return annotationLabelOf(this.annotationRefs(), p, id);
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
      case 'add_page':
        return this.addPageOp(op, p);
      case 'update_page':
        return this.updatePageOp(op, p);
      case 'delete_page':
        return this.deletePageOp(op, p);
      case 'move_to_page':
        return this.moveToPageOp(op, p);
      case 'apply_specialization': {
        const loaded = await this.loadSpec({ file: op.file }, 'apply', p);
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
        const loaded = await this.loadSpec(
          { file: op.file, builtin: op.builtin },
          'update',
          p,
        );
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
      case 'import_format':
        return this.importFormatOp(op);
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
        const { project, changes } = this.rules(() =>
          updateBatchMarking(this.markingContext([]), p, id, op),
        );
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
            impact.annotations > 1
              ? ` (with ${impact.annotations - 1} linked annotation(s))`
              : ''
          }${impact.brokenRefs > 0 ? `, ${impact.brokenRefs} broken reference(s)` : ''}`,
        };
      }
    }
  }

  private checkMinSize<T>(
    minSize: { width: number; height: number } | null,
    what: string,
    run: () => T,
  ): T {
    return this.rules(() => guardMinSize(minSize, what, run));
  }

  /**
   * `create_marking`: the marking and, if requested, the typed annotation. When the type has a component
   * (in the catalog read when loading the project), the `rect` may be missing (the component's initial
   * size) and the `minSize` applies; the annotation is created as in the app's palette (`preview`), with the
   * `values` on top. The server never arranges: the rectangles are the ones the agent provided.
   */
  /** `update_project`: the project's drawing mode and reading direction. */
  /** `add_page`: a new page at the end of the tabs; `as` names it in the following operations. */
  private addPageOp(op: Extract<Operation, { op: 'add_page' }>, p: Project): Step {
    const id = crypto.randomUUID();
    const project = createPage(p, { id, name: op.name });
    return {
      project,
      description: `Add the page "${op.name.trim()}"`,
      created: [{ kind: 'page', id }],
    };
  }

  /** `update_page`: rename and/or move in the order of the tabs. */
  private updatePageOp(op: Extract<Operation, { op: 'update_page' }>, p: Project): Step {
    const page = this.page(op.page, p);
    let project = p;
    const changes: string[] = [];
    if (op.name !== undefined) {
      project = renamePage(project, page.id, op.name);
      changes.push(`name "${op.name.trim()}"`);
    }
    if (op.position !== undefined) {
      project = movePage(project, page.id, op.position);
      changes.push(`position ${op.position}`);
    }
    return {
      project,
      description: `Change the page "${page.name}": ${changes.join(', ') || 'nothing'}`,
    };
  }

  /**
   * `delete_page`: `move_to` moves the roots to another page, `discard` deletes the content with the page; a
   * page with content and neither fails with `page-not-empty` (the counts in `contents`).
   */
  private deletePageOp(op: Extract<Operation, { op: 'delete_page' }>, p: Project): Step {
    if (op.move_to !== undefined && op.discard === true) {
      throw new ToolError(
        'invalid-arguments',
        '`move_to` and `discard` are mutually exclusive: move the content to another page or delete it with the page',
      );
    }
    const page = this.page(op.page, p);
    if (p.pages.length === 1) throw new ModelError('page-last', page.id);
    const content = pageContent(p, page.id);
    if (op.move_to !== undefined) {
      const target = this.page(op.move_to, p);
      if (target.id === page.id) {
        throw new ToolError(
          'invalid-arguments',
          '`move_to` is the page being deleted: name another page',
        );
      }
      return {
        project: deletePage(p, page.id, { moveTo: target.id }),
        description: `Delete the page "${page.name}"; its ${content.roots} root(s) move to "${target.name}"`,
      };
    }
    const empty = content.containers + content.markings + content.arrows === 0;
    if (op.discard !== true && !empty) {
      throw new ModelError('page-not-empty', undefined, { contents: content });
    }
    return {
      project: deletePage(p, page.id, { discard: true }),
      description: empty
        ? `Delete the empty page "${page.name}"`
        : `Delete the page "${page.name}" and discard its content (${content.containers} container(s), ${content.markings} marking(s), ${content.arrows} arrow(s), ${content.annotations} annotation(s))`,
    };
  }

  /** `move_to_page`: the model's `moveRootsToPage`; an arrow that would cross comes back in the error's `arrows`. */
  private moveToPageOp(op: Extract<Operation, { op: 'move_to_page' }>, p: Project): Step {
    const page = this.page(op.page, p);
    const index = projectIndex(p);
    const ids = [...new Set(op.roots.map((text) => this.containerOrMarking(text).id))];
    for (const id of ids) {
      if (index.arrows.has(id)) throw new ModelError('not-root', id);
    }
    const project = moveRootsToPage(p, ids, page.id);
    const moving = ids.filter((id) => index.pageOf.get(id) !== page.id);
    return {
      project,
      description:
        moving.length === 0
          ? `Move to the page "${page.name}": nothing changes, the ${ids.length === 1 ? 'root is' : 'roots are'} already there`
          : `Move ${moving.length} ${moving.length === 1 ? 'root' : 'roots'} to the page "${page.name}"`,
    };
  }

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
    const settings = applyContainerSettings(step.project, id, op);
    let result: Step = {
      ...step,
      project: settings.project,
      description: `${step.description}${settings.changes.map((c) => `, ${c}`).join('')}`,
    };
    if (op.classes != null) {
      const classes = applyClassChoices(result.project, id, op.classes);
      result = {
        ...result,
        project: classes.project,
        description: `${result.description}${classes.changes.map((c) => `, ${c}`).join('')}`,
      };
    }
    return result;
  }

  /** `beside` of `add_container`: the id of the reference container; with `center` it is `invalid-arguments`. */
  private besideId(
    op: { readonly beside?: string; readonly center?: unknown },
    p: Project,
  ): string | undefined {
    return this.rules(() => resolveBeside(op, (ref) => this.containerItem(ref, p)));
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
    const pageArgs = this.containerPage(op, p, beside);
    const image = await this.image(op, p);
    const id = crypto.randomUUID();
    let project = addContainer(p, {
      id,
      file: image.file,
      width: image.width,
      height: image.height,
      ...(op.center ? { center: op.center } : {}),
      ...(beside !== undefined ? { beside } : {}),
      ...pageArgs,
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
    const { project, id, size } = this.rules(() =>
      addBatchBackgroundContainer(p, op, () => {
        const beside = this.besideId(op, p);
        return {
          ...(beside !== undefined ? { beside } : {}),
          ...this.containerPage(op, p, beside),
        };
      }),
    );
    return {
      project,
      description: `Add the container "${this.refs(project).imageLabel(id)}" (${size.width}×${size.height} px, background ${size.background.toUpperCase()}${
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
      // The value `setContainerPlacement` stores: the same pure function, free of floating-point noise
      // (if it ever adjusts the placement after snapping, this text has to follow it).
      const saved = snapPlacement(next);
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
    if (op.classes !== undefined) {
      const classes = applyClassChoices(project, id, op.classes);
      project = classes.project;
      changes.push(...classes.changes);
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
        minSizeAt: (markingId, density) =>
          componentMinSize(p, this.catalog, markingId, density),
      },
    );
    if (op.source !== undefined) {
      project = setImageSource(project, id, toSource(op.source));
    }
    const old = projectIndex(p).containers.get(id)!;
    const before = effectiveDensity(p, id);
    const after = effectiveDensity(project, id);
    const density = before === after ? '' : `, density ${before}x → ${after}x`;
    return {
      project,
      description: `Replace the image of the container "${this.refs(p).imageLabel(id)}": ${old.file} → ${image.file} (${image.width}×${image.height} px, ${image.note}${density})`,
      imageFiles: [[image.file, image.data]],
    };
  }

  /** The minimum of any marking of `p` that draws a component (`null` for a plain one), for the settle (stage #2210). */
  private minSizeOf(p: Project): (markingId: string) => Size | null {
    return (markingId) => componentMinSize(p, this.catalog, markingId);
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
    this.rules(() => refuseArrowAsMarking(this.p, id, tool));
  }

  private createArrowOp(op: Extract<Operation, { op: 'create_arrow' }>): Step {
    const { project, id, from, to } = this.rules(() =>
      createBatchArrow(this.annotationRefs(), this.p, op),
    );
    return {
      project,
      description: `Create the arrow "${this.markingLabel(project, from)}" → "${this.markingLabel(project, to)}" (${projectIndex(project).arrows.get(id)!.style})`,
      created: [{ kind: 'm', id }],
    };
  }

  private updateArrowOp(op: Extract<Operation, { op: 'update_arrow' }>): Step {
    this.rules(() => refuseArrowPoints(op));
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

  private nearTarget(text: string): FloatingNearTarget {
    return this.rules(() => resolveNearTarget(this.refContext(), this.p, text));
  }

  private containerOrMarking(text: string): FloatingNearTarget {
    return this.rules(() => resolveContainerOrMarking(this.refContext(), this.p, text));
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
    requireSinglePage(
      p,
      entering.map((item) => item.id),
    );
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
    const rowAliases: RowAliases = [];
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

  /** The plugin text: a file the batch itself brings (a specialization applied in it) or the project's copy. */
  private readonly readPlugin: PluginReader = async (path) => {
    const staged = this.packageFiles.get(path);
    if (staged !== undefined) return new TextDecoder().decode(staged);
    return (await this.io.readProjectText?.(path)) ?? null;
  };

  /**
   * `import_format`: `parse` runs on the projection of the project as it is at this step, and the
   * operations it returns (already checked) are applied inside the step, with aliases of their own.
   * The step is atomic: a failure leaves the project as the step found it.
   */
  private async importFormatOp(
    op: Extract<Operation, { op: 'import_format' }>,
  ): Promise<Step> {
    const found = findFileFormat(this.p, op.format);
    const notes: string[] = [];
    const containerId = this.formatTarget(op, found.format.scope ?? 'project', notes);
    const text = await importText(op, found.format.extension, this.io);
    const input = formatProjection(
      { ...this.loaded, project: this.p, catalog: this.catalog },
      found,
      containerId,
      true,
    );
    const result = await parseFormat(found, text, input, this.readPlugin);
    const applied = this.applyPluginResult(
      {
        // Parsed by the operations' schema: the plugin's values are the right types before the model reads them.
        operations: pluginOperations(
          result.operations,
        ) as unknown as FormatResult['operations'],
        warnings: result.warnings,
      },
      op.page,
    );
    const made = (kind: CreatedKind) =>
      applied.created.filter((c) => c.kind === kind).length;
    return {
      project: applied.project,
      notes: [...notes, ...applied.notes],
      created: applied.created,
      imported: {
        format: found.ref,
        updated: applied.updated,
        warnings: result.warnings ?? [],
      },
      description: `Import ${found.ref} (${found.format.name}): ${made('i')} container(s), ${made('m')} marking(s) and ${made('a')} annotation(s) created, ${applied.updated.length} updated`,
    };
  }

  /** The target container of a format with scope `container` (optional: without it `parse` creates one); a `container` given to scope `project` is ignored with a note. */
  private formatTarget(
    op: Extract<Operation, { op: 'import_format' }>,
    scope: 'project' | 'container',
    notes: string[],
  ): string | undefined {
    if (scope === 'container') {
      // Without `container` the plugin gets `target: null` and creates the container it reads.
      return op.container === undefined ? undefined : this.containerItem(op.container);
    }
    if (op.container !== undefined) {
      notes.push(`\`container\` was ignored: ${op.format} has scope project`);
    }
    return undefined;
  }

  /**
   * Applies the plugin's operations through the model's `applyFormatResult` (the plugin cites the references of
   * its input and the aliases it created, never the batch's). A refused operation fails the whole step with
   * the batch error at `operations[i].result[j]`; the project stays as the step found it.
   */
  private applyPluginResult(
    result: FormatResult,
    page: string | undefined,
  ): {
    project: Project;
    created: { kind: CreatedKind; id: string }[];
    updated: { kind: CreatedKind; id: string }[];
    notes: string[];
  } {
    const outcome = applyFormatResult(this.p, result, {
      input: { project: { name: this.loaded.location.name } },
      catalog: this.catalog,
      measure: this.measurer,
      page,
      labels: {
        markingLabel: (p, id) => this.markingLabel(p, id),
        containerLabel: (p, id) => this.refs(p).imageLabel(id),
      },
    });
    if (!outcome.ok) throw this.refusedByModel(outcome.error);
    for (const cleared of outcome.rolesCleared) {
      const { annotationId, role, roleName, message } = cleared;
      this.rolesCleared.push({
        index: this.current,
        annotationId,
        role,
        roleName,
        message,
      });
    }
    return {
      project: outcome.project,
      created: [...outcome.created],
      updated: [...outcome.updated],
      notes: [...outcome.notes],
    };
  }

  /** The error of operation `j` of the result as the step's error: the model's own code, at `operations[i].result[j]`. */
  private refusedByModel(failure: FormatApplyError): ToolError {
    const { cause, op, index: j } = failure;
    const path = `operations[${this.current}].result[${j}]`;
    if (!(
      cause instanceof ToolError ||
      cause instanceof ModelError ||
      cause instanceof BatchRuleError
    )) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return new ToolError(
        'plugin-output-invalid',
        `${path}: a value of the plugin result has the wrong type (${detail})`,
        { path, resultOp: op },
      );
    }
    const error =
      cause instanceof BatchRuleError
        ? new ToolError(cause.code, cause.message, cause.details)
        : cause;
    const described = this.describeError(this.current, op, error);
    const { code, message } = described;
    const details = Object.fromEntries(
      Object.entries(described).filter(
        ([key]) => !['index', 'op', 'code', 'message'].includes(key),
      ),
    );
    return new ToolError(code as ToolErrorCode, message, {
      ...details,
      // A `path` of the original error (the bad file, for example) is kept as `itemPath`.
      ...(typeof details.path === 'string' ? { itemPath: details.path } : {}),
      path,
      resultOp: op,
    });
  }

  private createMarkingOp(op: Extract<Operation, { op: 'create_marking' }>): Step {
    const p = this.p;
    const rowAliases: RowAliases = [];
    const made = this.rules(() =>
      createBatchMarking(this.markingContext(rowAliases), p, op),
    );
    const { project, marking: created, typeRef, notes } = made;
    const { rect } = created;
    const label = this.createdMarkingLabel(p, project, created, made.componentName);
    return {
      project,
      ...(notes.length > 0 ? { notes: [...notes] } : {}),
      description: `Create the marking "${label}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
        op.rect === undefined ? ', initial size of the component' : ''
      }${op.source ? `, ${sourceLabel(toSource(op.source))}` : ''})${
        typeRef ? ` with the annotation ${typeRef.specId}/${typeRef.typeId}` : ''
      }`,
      created: [
        { kind: 'm', id: made.markingId },
        ...(made.annotationId ? [{ kind: 'a' as const, id: made.annotationId }] : []),
      ],
      rowAliases,
    };
  }

  /**
   * The model's rules of the marking operations need the batch's references, labels and annotation values:
   * this is what the batch hands them (the row aliases of a `create_marking` collect in `rowAliases`).
   */
  private markingContext(rowAliases: RowAliases): MarkingContext {
    const { catalog } = this;
    return {
      catalog,
      measurer: this.measurer,
      refs: {
        marking: (ref) => this.item(ref, 'm'),
        container: (ref, p = this.p) => this.containerItem(ref, p),
        layer: (ref) => this.layer(ref),
        type: (ref) => this.type(ref),
        nearTarget: (ref) => this.nearTarget(ref),
        pageFor: (p, containerId, args) =>
          this.markingPageId({ page: args.page, near: args.near }, p, containerId, args),
        componentType: (p, type) =>
          this.componentTypeMap(p, catalog).get(`${type.specId}/${type.typeId}`) ?? null,
        markingLabel: (p, id) => this.markingLabel(p, id),
        containerLabel: (p, id) => this.refs(p).imageLabel(id),
        guardMinSize: (minSize, what, run) => this.checkMinSize(minSize, what, run),
      },
      annotate: {
        typed: (p, id, markingId, args) =>
          addBatchTypedAnnotation(
            this.annotationRefs(),
            p,
            id,
            markingId,
            { ...args, ownerId: null },
            rowAliases,
          ),
        setValues: (p, annotationId, values) =>
          setBatchValues(this.annotationRefs(), p, annotationId, values, rowAliases),
      },
    };
  }

  /** Runs a rule of the model: its `BatchRuleError` becomes the batch's `ToolError`, with the same code and message. */
  private rules<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof BatchRuleError) {
        throw new ToolError(error.code, error.message, error.details);
      }
      throw error;
    }
  }

  private createAnnotation(op: Extract<Operation, { op: 'create_annotation' }>): Step {
    const {
      project,
      annotationId: id,
      ownerId,
      rowAliases,
    } = this.rules(() => createBatchAnnotation(this.annotationRefs(), this.p, op));
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

  private updateAnnotation(op: Extract<Operation, { op: 'update_annotation' }>): Step {
    const label = this.annotationLabel(this.p, this.item(op.annotation, 'a'));
    const { project, changes, rowAliases, roleCleared } = this.rules(() =>
      updateBatchAnnotation(this.annotationRefs(), this.p, op),
    );
    return {
      project,
      description: `Change the annotation ${label}: ${changes.join(', ') || 'nothing'}`,
      rowAliases,
      ...(roleCleared ? { roleCleared } : {}),
    };
  }
}

function kindLabel(kind: AliasTarget['kind']): string {
  return kind === 'row' ? 'a table row' : KIND_LABEL[kind];
}

/** Batch with no operations: only to read references (the io is not used by `storedRef`). */
const NO_IO: BatchIo = {
  readSource: () => Promise.reject(new ToolError('invalid-arguments', 'no io')),
  readSpecInput: () => Promise.reject(new ToolError('invalid-arguments', 'no io')),
  takenImageFiles: new Set(),
  now: () => new Date(0),
};

/**
 * `values` of a typed annotation with the `ref` fields and `ref` cells of the type in the agent's format
 * (`{ annotation: "mapping://…" }`) turned into the model's stored `RefValue`, as `create_marking` does.
 * An alias (`$name`) fails: there is no batch to have created it.
 */
export function storedRefValues(
  loaded: LoadedProject,
  type: SpecAnnotationType,
  values: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  const batch = new Batch(loaded, NO_IO);
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fieldOf(type, key);
    if (field?.type === 'ref') out[key] = batch.storedRef(value, key);
    else if (field?.type === 'table' && Array.isArray(value)) {
      out[key] = value.map((row) => refCells(batch, field, row));
    } else out[key] = value;
  }
  return out;
}

function refCells(
  batch: Batch,
  field: Extract<SpecField, { type: 'table' }>,
  row: JsonValue,
): JsonValue {
  if (!isRecord(row)) return row;
  const cells: Record<string, JsonValue> = {};
  for (const [column, cell] of Object.entries(row)) {
    const isRef = field.columns.find((c) => c.key === column)?.type === 'ref';
    cells[column] = isRef ? batch.storedRef(cell, column) : cell;
  }
  return cells;
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

/** What tells two pending items of an annotation apart (the same code on another field or slot is another item). */
const issueKey = (i: AnnotationIssue): string =>
  [
    i.code,
    i.key ?? '',
    i.slot?.id ?? '',
    i.rowId ?? '',
    i.column ?? '',
    i.set?.id ?? '',
  ].join('\u0000');

/** The items of `next` that `old` did not have. */
function gainedIssues(
  old: readonly AnnotationIssue[] | undefined,
  next: readonly AnnotationIssue[],
): AnnotationIssue[] {
  const had = new Set((old ?? []).map(issueKey));
  return next.filter((i) => !had.has(issueKey(i)));
}

/**
 * Pending items (incomplete annotations) that the batch creates or resolves: `new` lists, per annotation, only
 * the items it gained (an annotation that already had one and gets another lists just the new one); `resolved`
 * counts the annotations that ended with no item.
 */
export function issueChanges(refs: Refs, before: Project): Record<string, unknown> {
  const after = refs.project;
  const old = projectIssues(before);
  const next = projectIssues(after);
  const added = [...next.entries()].flatMap(([id, issues]) => {
    const gained = gainedIssues(old.get(id), issues);
    if (gained.length === 0) return [];
    return [
      {
        annotation: refs.ref('a', id),
        issues: gained.map((i) => ({
          code: i.code,
          ...(i.key ? { key: i.key } : {}),
          ...containerClassIssueView(i),
        })),
      },
    ];
  });
  const resolved = [...old.keys()].filter((id) => !next.has(id)).length;
  return { before: old.size, after: next.size, resolved, new: added };
}

/**
 * The specialization notices that the annotations created or changed by the batch come to have
 * (stage #486, decision 11), read with `changeNotices` (the proposal review no longer shows them),
 * grouped per notice (stage #2085, decision 7): one entry per specialization, type, place (`key`,
 * `column`), `kind` and `message`, with the number of distinct annotations of the batch that have it.
 * From the most serious to the least and, within the same `kind`, in the order they first appear.
 */
export function noticeChanges(
  refs: Refs,
  changes: readonly Change[],
): Record<string, unknown> {
  const after = refs.project;
  const groups = new Map<
    string,
    { kind: SpecNotice['kind']; view: Record<string, unknown>; ids: Set<string> }
  >();
  for (const change of changes) {
    for (const usage of changeNotices(after, change, change.field ?? '')) {
      const id = JSON.stringify([
        usage.specId,
        usage.typeId,
        usage.key,
        usage.column,
        usage.notice.kind,
        usage.notice.message,
      ]);
      let group = groups.get(id);
      if (!group) {
        group = {
          kind: usage.notice.kind,
          ids: new Set(),
          view: {
            type: usage.typeId,
            kind: usage.notice.kind,
            message: usage.notice.message,
            ...(usage.key ? { key: usage.key } : {}),
            ...(usage.column ? { column: usage.column } : {}),
          },
        };
        groups.set(id, group);
      }
      group.ids.add(change.entityId);
    }
  }
  const entries = [...groups.values()];
  entries.sort((a, b) => NOTICE_KINDS.indexOf(a.kind) - NOTICE_KINDS.indexOf(b.kind));
  return { new: entries.map((e) => ({ ...e.view, annotations: e.ids.size })) };
}
