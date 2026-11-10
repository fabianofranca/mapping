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
  componentMinSize,
  componentPlacement,
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
  setContainerDrawingMode,
  setContainerMarkingColor,
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

// Lote de `plan_changes`: aplica as operações em ordem sobre uma cópia do projeto, sempre pelas
// funções puras do `src/model/` (que impõem invariantes, travas, especializações e vínculos).
// Nada é gravado aqui: o resultado (projeto e arquivos novos) vai para `apply_changes`.

/** Leitura de arquivos citados pelo agente (imagens e especializações), dentro das raízes. */
export interface BatchIo {
  readSource(
    path: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly name: string }>;
  /**
   * Lê o que uma operação de especialização aponta: o arquivo de uma especialização v1 a v3,
   * ou a pasta de um pacote v4 (também a partir do arquivo da especialização dentro dela).
   */
  readSpecInput(path: string): Promise<SpecInput>;
  /** Arquivos que já existem em `images/` no disco (`images/…`), para não sobrescrever. */
  readonly takenImageFiles: ReadonlySet<string>;
  /**
   * Projeto lido da pasta, quando o lote parte de outro (a revisão da proposta parte do proposto
   * inteiro): o aviso das setas compara com ele, não com o que já foi proposto.
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
  /** Uma linha legível por operação válida. */
  readonly steps: readonly { readonly index: number; readonly description: string }[];
  readonly created: readonly CreatedItem[];
  readonly aliases: ReadonlyMap<string, AliasTarget>;
  /** Conteúdo das imagens novas, por arquivo (`images/…`). */
  readonly imageFiles: ReadonlyMap<string, Uint8Array>;
  /**
   * Arquivos dos pacotes de biblioteca aplicados ou atualizados, pelo caminho definitivo no
   * projeto (`specs/<pasta>/<relativo>`): a proposta os guarda em `proposals/<id>/…`.
   */
  readonly packageFiles: ReadonlyMap<string, Uint8Array>;
  /** Avisos da validação dos pacotes (não impedem nada). */
  readonly libraryWarnings: readonly LibraryWarning[];
  /** Operações antigas aceitas com aviso (ex: `add_blank_image` → `add_container`). */
  readonly deprecations: readonly {
    readonly index: number;
    readonly op: string;
    readonly message: string;
    /** Código do aviso no relatório; ausente = `deprecated-op`. */
    readonly code?: string;
  }[];
  /** Papéis que a troca de dono limpou sem o passo pedir (aviso `role-cleared`). */
  readonly rolesCleared: readonly RoleCleared[];
  /** Regras entre coleções violadas pelo resultado (não deveria acontecer). */
  readonly invariantIssues: readonly string[];
}

/** Papel limpo pela troca de dono de `update_annotation`: vira o aviso `role-cleared`. */
export interface RoleCleared {
  readonly index: number;
  readonly annotationId: string;
  readonly role: string;
  readonly roleName: string;
  readonly message: string;
}

/** Aviso do validador da biblioteca, com a operação e a especialização de origem. */
export interface LibraryWarning {
  readonly index: number;
  readonly specId: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

/** A especialização lida de uma operação e, se for pacote v4, o pacote já validado. */
interface LoadedSpec {
  readonly spec: Spec;
  /** Só na atualização: o impacto (o contrato já conferido). */
  readonly impact?: SpecUpdateImpact;
  readonly package?: {
    readonly pkg: ReadPackage;
    readonly specName: string;
    readonly warnings: readonly LibraryIssue[];
  };
}

interface Step {
  readonly project: Project;
  /** Papel que a troca de dono limpou sem o passo pedir. */
  readonly roleCleared?: Omit<RoleCleared, 'index'>;
  /** Avisos da operação (argumento ignorado…): vão para `warnings` da resposta. */
  readonly notes?: readonly string[];
  /** Pacote da biblioteca levado pela operação: pasta definitiva e arquivos dela. */
  readonly packageFiles?: readonly [string, Uint8Array][];
  readonly warnings?: readonly LibraryIssue[];
  readonly specId?: string;
  readonly description: string;
  readonly created?: readonly { kind: CreatedKind; id: string }[];
  readonly rowAliases?: readonly [string, AliasTarget][];
  readonly imageFiles?: readonly [string, Uint8Array][];
}

const KIND_LABEL: Record<CreatedKind, string> = {
  layer: 'uma camada',
  ...KIND_WITH_ARTICLE,
};

/** Operações antigas aceitas com aviso por uma versão (MCP 0.8.0), com o que usar no lugar. */
const DEPRECATED_OPS: Partial<Record<Operation['op'], string>> = {
  add_image: 'add_image é antiga: use add_container com `file` (ou `base64`)',
  add_blank_image:
    'add_blank_image é antiga: use add_container (mesmos campos: width, height e background)',
  update_image:
    'update_image é antiga: use update_container (o argumento `image` virou `container`)',
  replace_image:
    'replace_image é antiga: use replace_container (o argumento `image` virou `container`)',
  delete_image:
    'delete_image é antiga: use delete_container (o argumento `image` virou `container`)',
};

/** Minúsculas e sem acentos, para achar camadas e tipos pelo nome. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function quoted(text: string | null): string {
  return text === null ? '(sem nome)' : `"${text}"`;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Nome de arquivo seguro para `images/`: só o nome, sem pastas, controle nem ponto inicial. */
function safeFileName(input: string, fallback: string): string {
  const base = input.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned === '' || cleaned.startsWith('.') ? fallback : cleaned;
}

function decodeBase64(text: string): Uint8Array {
  const payload = text.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  // Antes de decodificar: o `Buffer` de um texto enorme já seria o pico de memória.
  if (payload.length > MAX_BASE64_LENGTH) {
    throw new ToolError(
      'image-too-large',
      `conteúdo base64 grande demais (${payload.length} caracteres; máximo ${MAX_BASE64_LENGTH}): envie imagens grandes por \`file\``,
    );
  }
  if (payload === '' || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(payload)) {
    throw new ToolError('invalid-base64', 'conteúdo base64 vazio ou inválido');
  }
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

/** `source` da operação → `ExternalSource` do modelo (`url` omitida = sem link). */
function toSource(
  input: { system: string; id: string; url?: string | null | undefined } | null,
): ExternalSource | null {
  return input === null
    ? null
    : { system: input.system, id: input.id, url: input.url ?? null };
}

/** Rótulo curto da origem nos resumos: `figma:3f2a` ou `sem origem`. */
function sourceLabel(source: ExternalSource | null): string {
  return source === null ? 'sem origem' : `origem ${source.system}:${source.id}`;
}

/** Catálogo sem a especialização `specId`. */
function withoutSpec(catalog: ComponentCatalog, specId: string): ComponentCatalog {
  if (!catalog.has(specId)) return catalog;
  const next = new Map(catalog);
  next.delete(specId);
  return next;
}

/**
 * Catálogo depois de aplicar ou atualizar uma especialização no lote: a entrada dela é refeita
 * com os arquivos do pacote que a operação levou (`packageFiles`, pelo caminho definitivo).
 * Especialização sem pacote (v1 a v3) não tem componente: a entrada some.
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
 * Nota do passo quando o tipo declara componente na especialização aplicada e o catálogo do
 * lote não o tem (arquivo ausente, ilegível ou com problema): a anotação nasce sem o preview
 * e sem o tamanho mínimo. `null` se o tipo não declara componente.
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
      : 'o lote não achou os arquivos de componente dessa especialização';
  return `o tipo ${label} declara componente, mas ${reason}: a anotação foi criada sem o preview e sem o tamanho mínimo`;
}

type CreateMarkingValues = NonNullable<
  Extract<Operation, { op: 'create_marking' }>['annotation']
>['values'];

class Batch {
  private p: Project;
  private readonly aliases = new Map<string, AliasTarget>();
  /** Contagem dos 8 primeiros caracteres (normalizados) dos ids de marcações e setas, da versão em `project`. */
  private prefixCounts: { project: Project; counts: Map<string, number> } | null = null;

  private componentTypes: {
    specs: Project['specializations'];
    catalog: ComponentCatalog;
    map: ReadonlyMap<string, ComponentType>;
  } | null = null;

  /** Apelidos de operações que falharam: as que dependem delas dizem o porquê. */
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
   * Catálogo de componentes do lote: parte do lido ao carregar o projeto e acompanha as
   * especializações que o próprio lote aplica, atualiza ou remove.
   */
  private catalog: ComponentCatalog;
  /** Mede o texto como o desenho do servidor: fonte embutida e, se houver, as `fonts` da biblioteca. */
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
      // Apelido da segunda criação da operação (a anotação de create_marking).
      const secondAlias = op.op === 'create_marking' ? op.annotationAs : undefined;
      try {
        for (const name of [alias, secondAlias]) {
          if (
            name !== undefined &&
            (this.aliases.has(name) || this.failedAliases.has(name))
          ) {
            throw new ToolError('duplicate-alias', `apelido repetido no lote: ${name}`);
          }
        }
        if (alias !== undefined && alias === secondAlias) {
          throw new ToolError('duplicate-alias', `apelido repetido no lote: ${alias}`);
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
            message: 'o argumento `image` de create_marking é antigo: use `container`',
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
              'o argumento `parent` foi ignorado: o pai da marcação sai da geometria (a mais interna que a contém)',
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
              'o argumento `inherit` saiu do formato (v13) e foi ignorado: a anotação vale só para a própria marcação',
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
          // O apelido da operação vale para o item principal (o primeiro criado); o segundo,
          // quando a operação cria dois (marcação e anotação), tem o dele.
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
    };
  }

  /** O apelido da operação não pode repetir um `_as` de linha da mesma operação. */
  private checkRowAliases(step: Step, names: readonly (string | undefined)[]): void {
    for (const [rowAlias] of step.rowAliases ?? []) {
      if (names.includes(rowAlias)) {
        throw new ToolError('duplicate-alias', `apelido repetido no lote: ${rowAlias}`);
      }
    }
  }

  /**
   * Refaz a entrada do catálogo da especialização que a operação mexeu, com o pacote que ela
   * já leu (sem ler o disco de novo): as operações seguintes veem os componentes da versão nova.
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
   * Guarda os arquivos do pacote da operação. Uma operação seguinte sobre a mesma pasta
   * (aplicar e depois atualizar no mesmo lote) substitui a anterior inteira, sem sobras.
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
  // Resolução do que o agente informou

  private alias(name: string, kind: AliasTarget['kind']): AliasTarget {
    const target = this.aliases.get(name);
    if (target) {
      if (target.kind !== kind) {
        throw new ToolError(
          'wrong-kind',
          `o apelido ${name} não é de ${kindLabel(kind)}`,
        );
      }
      return target;
    }
    const failed = this.failedAliases.get(name);
    if (failed !== undefined) {
      throw new ToolError(
        'alias-unavailable',
        `o apelido ${name} viria da operação ${failed}, que falhou`,
        { alias: name, failedOperation: failed },
      );
    }
    throw new ToolError(
      'unknown-alias',
      `apelido desconhecido: ${name} (crie o item com "as" numa operação anterior)`,
      { alias: name },
    );
  }

  /**
   * Container por referência/id ou, se não achar, pelo nome ou arquivo (como `list_markings`);
   * nome em mais de um container → `ambiguous-image`.
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
          `mais de um container se chama "${text}": use a referência`,
          { candidates: named.map((c) => this.refs(p).ref('i', c.id)) },
        );
      }
      throw error;
    }
  }

  /** Id de uma marcação, container ou anotação deste projeto: apelido, referência ou id. */
  private item(text: string, kind: ItemKind, p: Project = this.p): string {
    const wanted = text.trim();
    if (wanted.startsWith('$')) {
      const target = this.alias(wanted, kind);
      return 'id' in target ? target.id : '';
    }
    const parsed = parseRef(wanted);
    if (!parsed) {
      throw new ToolError('invalid-ref', `referência inválida: ${text}`, {
        hint: INVALID_REF_HINT,
      });
    }
    if (parsed.project !== null && parsed.project !== this.loaded.location.name) {
      throw new ToolError(
        'project-mismatch',
        `a referência é do projeto "${parsed.project}", não de "${this.loaded.location.name}"`,
      );
    }
    if (parsed.kind !== null && parsed.kind !== kind) {
      throw new ToolError(
        'wrong-kind',
        `a referência é de ${KIND_WITH_ARTICLE[parsed.kind]}, não de ${KIND_WITH_ARTICLE[kind]}`,
      );
    }
    const found = matchShortCode(p, kind, parsed.code);
    if (found.length === 1) return found[0]!.id;
    if (found.length === 0) {
      throw new ToolError('not-found', `${KIND_NOT_FOUND[kind]}: ${text}`);
    }
    throw new ToolError(
      'ambiguous-ref',
      `${found.length} itens começam com esse código: use a referência completa`,
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
      throw new ToolError('not-found', `a camada ${wanted} não existe mais`);
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
        ? `há ${byName.length} camadas chamadas "${text}": use o id`
        : `camada não encontrada: ${text}`,
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
        ? `"${text}" existe em mais de uma especialização: use specId/typeId`
        : `tipo de anotação não encontrado: ${text} (veja get_project e get_specialization)`,
      {
        types: [...projectIndex(p).types.values()]
          .slice(0, 50)
          .map(({ spec, type }) => `${spec.id}/${type.id}`),
      },
    );
  }

  /**
   * Lê o que `file` aponta: um arquivo de especialização v1 a v3, ou o pacote v4 (a pasta, ou o
   * arquivo da especialização dentro dela). O pacote é validado com os mesmos níveis de
   * `validate_library`: erro impede (`invalid-library`), aviso segue e volta no resultado.
   * Numa atualização, a cópia aplicada liga o contrato de versão (`previous`).
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

  /** Arquivos do pacote com o caminho definitivo, depois de o modelo escolher o `file`. */
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

  /** Opções do modelo: o pacote v4 guarda a cópia numa pasta, com o arquivo da especialização dentro. */
  private specOptions(loaded: LoadedSpec): { packageSpecName?: string } {
    return loaded.package ? { packageSpecName: loaded.package.specName } : {};
  }

  /** Lê e otimiza a imagem informada e escolhe o nome livre em `images/`. */
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
      throw new ToolError(
        'invalid-image-source',
        'informe `file` ou `base64`, não os dois',
      );
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
      throw new ToolError('invalid-image-source', 'informe `file` ou `base64` da imagem');
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
        ? `otimizada: ${original.width}×${original.height} → ${prepared.width}×${prepared.height}, WebP`
        : 'otimizada: WebP'
      : 'arquivo original';
    return {
      file,
      data: prepared.data,
      width: prepared.width,
      height: prepared.height,
      note,
    };
  }

  /** Referência de um campo `ref` no formato do agente → `RefValue` do modelo. */
  private refValue(input: JsonValue, key: string, p: Project): JsonValue {
    if (input === null || (typeof input === 'string' && input === '')) return null;
    if (!isRecord(input)) {
      throw new ToolError(
        'invalid-ref-value',
        `campo ${key}: a referência é um objeto com "annotation" (veja a descrição de values)`,
      );
    }
    const target = input.annotation ?? input.annotationId;
    if (typeof target !== 'string') {
      throw new ToolError('invalid-ref-value', `campo ${key}: falta "annotation"`);
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
          `campo ${key}: "entry" é a chave ou o id do par`,
        );
      }
      const found =
        annotation.entries.find((e) => e.id === entry) ??
        annotation.entries.find((e) => e.key === entry.trim());
      if (!found) {
        throw new ToolError(
          'not-found',
          `campo ${key}: a anotação não tem o par "${entry}"`,
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
      // Sem `entry`, `key` nem `row`: a anotação inteira (quarto formato).
      ref = { annotationId };
    } else {
      throw new ToolError(
        'invalid-ref-value',
        `campo ${key}: "row" exige "key" (a tabela); sem "entry", "key" nem "row", a referência é a anotação inteira`,
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
          `campo ${key}: a tabela ${field} não tem a linha ${row}`,
        );
      return found._id;
    }
    if (typeof row !== 'string') {
      throw new ToolError(
        'invalid-ref-value',
        `campo ${key}: "row" é o id, o apelido ou o índice da linha`,
      );
    }
    if (row.startsWith('$')) {
      const target = this.alias(row, 'row');
      if (target.kind === 'row') {
        if (target.annotationId !== annotation.id || target.key !== field) {
          throw new ToolError(
            'invalid-ref-value',
            `campo ${key}: a linha ${row} é de outra tabela`,
          );
        }
        return target.rowId;
      }
    }
    return row;
  }

  /** Define os valores de uma anotação tipada, campo a campo, pelas operações do modelo. */
  private setValues(
    p: Project,
    annotationId: string,
    values: Record<string, JsonValue>,
    rowAliases: [string, AliasTarget][],
  ): Project {
    const entries = Object.entries(values);
    if (entries.length === 0) return p;
    // O tipo da anotação não muda ao definir os valores: resolvido uma vez, não por campo.
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
        // Campos simples; tipo inexistente ou campo desconhecido: o modelo diz o porquê.
        next = setFieldValue(next, annotationId, key, value);
      }
    }
    return next;
  }

  /** Substitui as linhas da tabela: `_id` mantém uma linha existente, `_as` dá um apelido. */
  private setTable(
    p: Project,
    annotationId: string,
    tableField: Extract<SpecField, { type: 'table' }>,
    value: JsonValue,
    rowAliases: [string, AliasTarget][],
  ): Project {
    const key = tableField.key;
    if (value !== null && !Array.isArray(value)) {
      throw new ToolError(
        'invalid-value',
        `campo ${key}: uma tabela é uma lista de linhas`,
      );
    }
    const input = (value ?? []).map((row, i) => {
      if (!isRecord(row)) {
        throw new ToolError(
          'invalid-value',
          `campo ${key}: a linha ${i} não é um objeto`,
        );
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
          `campo ${key}: a linha ${String(given)} não existe`,
        );
      }
      const rowId = given ?? crypto.randomUUID();
      if (given === undefined) next = addTableRow(next, annotationId, key, rowId);
      for (const [column, cell] of Object.entries(row)) {
        if (column === '_id' || column === '_as') continue;
        const isRef = tableField.columns.find((c) => c.key === column)?.type === 'ref';
        // Célula `ref`: o mesmo valor do campo `ref` (apelidos incluídos) ou o formato gravado.
        const cellValue = isRef ? this.refValue(cell, column, next) : cell;
        next = setTableCell(next, annotationId, key, rowId, column, cellValue);
      }
      next = moveTableRow(next, annotationId, key, rowId, position);
      const alias = row._as;
      if (alias !== undefined) {
        if (typeof alias !== 'string' || !/^\$[A-Za-z0-9_-]+$/.test(alias)) {
          throw new ToolError(
            'invalid-alias',
            `campo ${key}: "_as" é um apelido como "$linha"`,
          );
        }
        if (this.aliases.has(alias) || rowAliases.some(([name]) => name === alias)) {
          throw new ToolError('duplicate-alias', `apelido repetido no lote: ${alias}`);
        }
        rowAliases.push([alias, { kind: 'row', annotationId, key, rowId }]);
      }
    });
    return next;
  }

  /** Pares novos com a mesma chave de um existente mantêm o id (e as referências a ele). */
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
  // Rótulos para o resumo

  private markingLabel(p: Project, id: string): string {
    return this.refs(p).markingPath(id).join(' › ');
  }

  /**
   * Rótulo da marcação recém-criada (`Container › Nome`), igual ao de `markingLabel`, sem montar o
   * índice nem ordenar os códigos de todo o projeto: o custo não cresce com ele, e um lote de
   * mil criações fica linear. Só vale para a marcação sem pai e sem outro id começando igual;
   * nos outros casos cai no `markingLabel` (que decide o nome e o código pelo projeto inteiro).
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
    const name = marking.name ?? `${typeName ?? 'Marcação'} ${fast}`;
    return [this.refs(project).imageLabelNoIndex(marking.containerId), name].join(' › ');
  }

  /**
   * Tipos com componente por `especialização/tipo`, montados uma vez por versão das
   * especializações e do catálogo (o `import_measured` cria uma marcação por nó).
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
      // O primeiro vence, como o `find` por especialização e tipo.
      const key = `${t.specId}/${t.typeId}`;
      if (!map.has(key)) map.set(key, t);
    }
    this.componentTypes = { specs: p.specializations, catalog, map };
    return map;
  }

  /**
   * Código curto do id novo se nenhum outro id de marcação ou seta começa com os mesmos 8
   * caracteres (o código é então o prefixo de 8, como `shortCode` daria); `null` se houver
   * colisão ou se o projeto não é o anterior mais uma marcação.
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
      ? `${annotationShortLabel(p, a)} em "${this.markingLabel(p, a.markingId)}"`
      : id;
  }

  // -------------------------------------------------------------------------
  // Operações

  private async apply(op: Operation): Promise<Step> {
    const p = this.p;
    switch (op.op) {
      case 'set_platform_repo': {
        if (op.urlTemplate !== undefined) {
          throw new ToolError(
            'unknown-field',
            'o endereço do repositório vem da especialização (`platforms[].repo`); o projeto só informa `localPath`',
          );
        }
        if (op.localPath === undefined) {
          throw new ToolError(
            'nothing-to-change',
            'informe `localPath` (ou use remove_platform_repo)',
          );
        }
        const project = setPlatformRepo(p, op.platform, { localPath: op.localPath });
        const repo = project.platformRepos[op.platform];
        return {
          project,
          description: repo?.localPath
            ? `Informar o clone local da plataforma "${op.platform}": localPath "${repo.localPath}"`
            : `Informar o clone local da plataforma "${op.platform}": localPath removido`,
        };
      }
      case 'remove_platform_repo':
        return {
          project: removePlatformRepo(p, op.platform),
          description: `Remover o clone local da plataforma "${op.platform}"`,
        };
      case 'set_doc_repo': {
        if (op.localPath === undefined) {
          throw new ToolError(
            'nothing-to-change',
            'informe `localPath` (ou use remove_doc_repo)',
          );
        }
        const project = setDocRepo(p, op.repo, { localPath: op.localPath });
        const repo = project.docRepos[op.repo];
        return {
          project,
          description: repo?.localPath
            ? `Informar o clone local do repositório de documentos "${op.repo}": localPath "${repo.localPath}"`
            : `Informar o clone local do repositório de documentos "${op.repo}": localPath removido`,
        };
      }
      case 'remove_doc_repo':
        return {
          project: removeDocRepo(p, op.repo),
          description: `Remover o clone local do repositório de documentos "${op.repo}"`,
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
          description: `Criar a camada "${op.name.trim()}"`,
          created: [{ kind: 'layer', id }],
        };
      }
      case 'update_layer': {
        const layer = this.layer(op.layer);
        let project = p;
        const changes: string[] = [];
        if (op.name !== undefined) {
          project = renameLayer(project, layer.id, op.name);
          changes.push(`nome "${op.name.trim()}"`);
        }
        if (op.color !== undefined) {
          project = setLayerColor(project, layer.id, op.color);
          changes.push(`cor ${op.color.toUpperCase()}`);
        }
        return {
          project,
          description: `Alterar a camada "${layer.name}": ${changes.join(', ') || 'nada'}`,
        };
      }
      case 'move_layer': {
        const layer = this.layer(op.layer);
        return {
          project: moveLayer(p, layer.id, op.index),
          description: `Mover a camada "${layer.name}" para a posição ${op.index}`,
        };
      }
      case 'delete_layer': {
        const layer = this.layer(op.layer);
        const impact = layerDeletionImpact(p, layer.id);
        return {
          project: removeLayer(p, layer.id),
          description: `Excluir a camada "${layer.name}" (${impact.annotations} anotação(ões)${
            impact.brokenRefs > 0
              ? `, ${impact.brokenRefs} referência(s) quebrada(s)`
              : ''
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
            `a especialização "${spec.id}" já está aplicada numa versão menor: use update_specialization`,
          );
        }
        const project = applySpecialization(p, spec, this.specOptions(loaded));
        const layers = project.layers.slice(p.layers.length);
        const warnings = loaded.package?.warnings.length ?? 0;
        return {
          project,
          description: `Aplicar a especialização "${spec.name}" (${spec.id} v${spec.version}): camadas ${layers
            .map((l) => `"${l.name}"`)
            .join(', ')}${
            loaded.package
              ? ` (pacote da biblioteca${warnings > 0 ? `, ${warnings} aviso(s) da validação` : ''})`
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
        if (warnings > 0) parts.push(`${warnings} aviso(s) da validação da biblioteca`);
        return {
          project,
          description: `Atualizar a especialização "${spec.id}" para a v${spec.version}${
            parts.length > 0 ? ` (${parts.join('; ')})` : ''
          }`,
          created: added.map((l) => ({ kind: 'layer' as const, id: l.id })),
          ...this.packageStep(loaded, project),
        };
      }
      case 'remove_specialization': {
        if (!projectIndex(p).specializations.has(op.specId)) {
          throw new ToolError('not-found', `especialização não aplicada: ${op.specId}`);
        }
        const impact = specializationRemovalImpact(p, op.specId, op.mode);
        const layers = p.layers.filter((l) => l.spec?.specId === op.specId).length;
        const broken =
          impact.brokenRefs > 0 ? `, ${impact.brokenRefs} referência(s) quebrada(s)` : '';
        return {
          project: removeSpecialization(p, op.specId, op.mode),
          description:
            op.mode === 'delete'
              ? `Remover a especialização "${op.specId}": excluir ${layers} camada(s) e ${impact.annotations} anotação(ões)${broken}`
              : `Remover a especialização "${op.specId}": ${layers} camada(s) e ${impact.annotations} anotação(ões) viram livres${broken}`,
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
            description: `A marcação "${label}" já está na posição ${op.index} entre as ${before.count} irmãs (no estado do lote neste ponto): nada muda`,
          };
        }
        return {
          project: reorderMarking(p, id, op.index),
          description: `Mover a marcação "${label}" para a posição ${op.index} entre as ${before.count} irmãs (0 = por baixo)`,
        };
      }
      case 'update_marking': {
        const id = this.item(op.marking, 'm');
        this.requireNotArrow(id, 'update_arrow');
        const label = this.markingLabel(p, id);
        let project = p;
        const changes: string[] = [];
        if (op.locked === false) {
          project = setMarkingLocked(project, id, false);
          changes.push('destrancar');
        }
        if (op.name !== undefined) {
          project = renameMarking(project, id, op.name);
          changes.push(`nome ${quoted(projectIndex(project).markings.get(id)!.name)}`);
        }
        if (op.source !== undefined) {
          project = setMarkingSource(project, id, toSource(op.source));
          changes.push(sourceLabel(projectIndex(project).markings.get(id)!.source));
        }
        if (op.move !== undefined) {
          project = moveMarking(project, id, op.move.dx, op.move.dy);
          changes.push(`mover (${op.move.dx}, ${op.move.dy}) com as filhas`);
        }
        if (op.floating !== undefined) {
          const minSize = componentMinSize(project, this.catalog, id);
          project = setMarkingFloating(
            project,
            id,
            op.floating,
            minSize ? { minSize } : undefined,
          );
          changes.push(op.floating ? 'flutuante' : 'deixar de ser flutuante');
        }
        if (op.container !== undefined) {
          if (op.rect === undefined) {
            throw new ToolError(
              'invalid-arguments',
              'trocar de `container` exige o `rect` nos pixels do container novo (no canvas, em unidades do canvas)',
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
            `${target === null ? 'ir para o canvas' : `ir para o container "${this.refs(project).imageLabel(target)}"`}, retângulo x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}`,
          );
        } else if (op.rect !== undefined) {
          const { rect } = op;
          const minSize = componentMinSize(project, this.catalog, id);
          project = this.checkMinSize(minSize, `"${label}"`, () =>
            setMarkingRect(project, id, rect, minSize ? { minSize } : undefined),
          );
          const r = op.rect;
          changes.push(`retângulo x ${r.x}, y ${r.y}, ${r.width}×${r.height}`);
        }
        if (op.confirmReview === true) {
          project = confirmMarkingReview(project, id);
          changes.push('confirmar a posição');
        }
        if (op.locked === true) {
          project = setMarkingLocked(project, id, true);
          changes.push('trancar');
        }
        return {
          project,
          description: `Alterar a marcação "${label}": ${changes.join(', ') || 'nada'}`,
        };
      }
      case 'delete_marking': {
        const id = this.item(op.marking, 'm');
        this.requireNotArrow(id, 'delete_arrow');
        const impact = markingDeletionImpact(p, id);
        return {
          project: removeMarking(p, id),
          description: `Excluir a marcação "${this.markingLabel(p, id)}" (${impact.descendants} descendente(s), ${impact.annotations} anotação(ões)${
            impact.brokenRefs > 0
              ? `, ${impact.brokenRefs} referência(s) quebrada(s)`
              : ''
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
          description: `Excluir a seta "${label}" (${impact.annotations} anotação(ões)${
            impact.brokenRefs > 0
              ? `, ${impact.brokenRefs} referência(s) quebrada(s)`
              : ''
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
          description: `Excluir a anotação ${this.annotationLabel(p, id)}${
            impact.annotations > 1 ? ` (com ${impact.annotations - 1} vinculada(s))` : ''
          }${impact.brokenRefs > 0 ? `, ${impact.brokenRefs} referência(s) quebrada(s)` : ''}`,
        };
      }
    }
  }

  /** Executa `run` e, se o retângulo ficou abaixo do mínimo do componente, diz qual é o mínimo. */
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
          `retângulo menor que o tamanho mínimo do componente de ${what}: ${minSize.width}×${minSize.height} px`,
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
   * `create_marking`: a marcação e, se pedido, a anotação tipada. Quando o tipo tem componente
   * (no catálogo lido ao carregar o projeto), o `rect` pode faltar (tamanho inicial do
   * componente) e vale o `minSize`; a anotação nasce como na paleta da app (`preview`), com os
   * `values` por cima. O servidor nunca arruma: os retângulos são os que o agente informou.
   */
  /** `update_project`: hoje só o modo do desenho. */
  private updateProjectOp(
    op: Extract<Operation, { op: 'update_project' }>,
    p: Project,
  ): Step {
    if (op.drawingMode === undefined) {
      return { project: p, description: 'Alterar o projeto: nada' };
    }
    return {
      project: setProjectDrawingMode(p, op.drawingMode),
      description:
        op.drawingMode === null
          ? 'Alterar o projeto: modo do desenho removido'
          : `Alterar o projeto: modo do desenho ${quoted(op.drawingMode)}`,
    };
  }

  /** `add_container` (com arquivo ou só com fundo) e o modo do desenho que ele fixa. */
  private async addContainerOp(
    op: Extract<Operation, { op: 'add_container' }>,
    p: Project,
  ): Promise<Step> {
    const step =
      op.file !== undefined || op.base64 !== undefined
        ? await this.addContainerFromFile(op, p)
        : this.addContainerWithBackground(op, p);
    const id = step.created?.find((c) => c.kind === 'i')?.id;
    if (op.drawingMode == null || id === undefined) return step;
    return {
      ...step,
      project: setContainerDrawingMode(step.project, id, op.drawingMode),
      description: `${step.description}, modo do desenho ${quoted(op.drawingMode)}`,
    };
  }

  /** `beside` do `add_container`: o id do container de referência; com `center` é `invalid-arguments`. */
  private besideId(
    op: { readonly beside?: string; readonly center?: unknown },
    p: Project,
  ): string | undefined {
    if (op.beside === undefined) return undefined;
    if (op.center !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`beside` e `center` são exclusivos: use `beside` para pôr o container ao lado de outro, ou `center` para um ponto do canvas',
      );
    }
    return this.containerItem(op.beside, p);
  }

  /** Container com arquivo de imagem: `add_container` com `file`/`base64` e a antiga `add_image`. */
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
        'add_container ambígua: com `file`/`base64` a largura e a altura vêm do arquivo; informe `file` ou `base64`, ou então `width`, `height` e `background`, nunca os dois grupos',
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
      description: `Adicionar o container com a imagem ${image.file} (${image.width}×${image.height} px, ${image.note}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'i', id }],
      imageFiles: [[image.file, image.data]],
    };
  }

  /** Container só com fundo: `add_container` sem arquivo e a antiga `add_blank_image`. */
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
        `add_container precisa de \`file\` (ou \`base64\`), ou de \`width\`, \`height\` e \`background\`; faltam: ${missing.join(', ')}`,
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
      description: `Adicionar o container "${this.refs(project).imageLabel(id)}" (${width}×${height} px, fundo ${background.toUpperCase()}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'i', id }],
    };
  }

  /** `update_container` e a antiga `update_image`. */
  private updateContainerOp(
    op: Extract<Operation, { op: 'update_container' | 'update_image' }>,
    id: string,
    p: Project,
  ): Step {
    let project = p;
    const changes: string[] = [];
    if (op.locked === false) {
      project = setImageLocked(project, id, false);
      changes.push('destrancar');
    }
    if (op.name !== undefined) {
      project = renameContainer(project, id, op.name);
      changes.push(`nome ${quoted(projectIndex(project).containers.get(id)!.name)}`);
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
      // O valor gravado, já sem ruído de ponto flutuante.
      const saved = projectIndex(project).containers.get(id)!.placement;
      changes.push(`posição (${saved.x}, ${saved.y}) escala ${saved.scale}`);
    }
    if (op.markingColor !== undefined) {
      project = setContainerMarkingColor(project, id, op.markingColor);
      changes.push(`cor das marcações ${op.markingColor ?? 'do tema'}`);
    }
    if (op.markingsLocked !== undefined) {
      project = setImageMarkingsLocked(project, id, op.markingsLocked);
      changes.push(
        op.markingsLocked
          ? 'trancar todas as marcações'
          : 'destrancar todas as marcações',
      );
    }
    if (
      op.background !== undefined ||
      op.width !== undefined ||
      op.height !== undefined
    ) {
      // Só o container sem arquivo: com arquivo o modelo recusa com `container-has-file`.
      project = setBackgroundContainer(project, id, {
        ...(op.background !== undefined ? { background: op.background } : {}),
        ...(op.width !== undefined ? { width: op.width } : {}),
        ...(op.height !== undefined ? { height: op.height } : {}),
      });
      const container = projectIndex(project).containers.get(id)!;
      changes.push(
        `tamanho ${container.width}×${container.height} px, fundo ${container.background}`,
      );
    }
    if (op.drawingMode !== undefined) {
      project = setContainerDrawingMode(project, id, op.drawingMode);
      changes.push(
        op.drawingMode === null
          ? 'modo do desenho do projeto'
          : `modo do desenho ${quoted(op.drawingMode)}`,
      );
    }
    if (op.locked === true) {
      project = setImageLocked(project, id, true);
      changes.push('trancar');
    }
    return {
      project,
      description: `Alterar o container "${this.refs(p).imageLabel(id)}": ${changes.join(', ') || 'nada'}`,
    };
  }

  /** `replace_container` e a antiga `replace_image`: troca o arquivo de imagem do container. */
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
      description: `Trocar a imagem do container "${this.refs(p).imageLabel(id)}": ${old.file} → ${image.file} (${image.width}×${image.height} px, ${image.note})`,
      imageFiles: [[image.file, image.data]],
    };
  }

  /** `delete_container` e a antiga `delete_image`. */
  private deleteContainerOp(id: string, p: Project): Step {
    const impact = containerDeletionImpact(p, id);
    return {
      project: removeContainer(p, id),
      description: `Excluir o container "${this.refs(p).imageLabel(id)}" (${impact.markings} marcação(ões), ${impact.annotations} anotação(ões))`,
    };
  }

  /** O id é de uma seta (as setas dividem o espaço de ids das marcações). */
  private requireArrow(id: string): void {
    if (!projectIndex(this.p).arrows.has(id)) {
      throw new ToolError('wrong-kind', 'a referência não é de uma seta', {
        hint: 'use o id ou a referência de uma seta (`arrows` de get_marking)',
      });
    }
  }

  /** O id é de uma seta numa tool de marcação: erro amigável apontando a tool certa. */
  private requireNotArrow(id: string, tool: 'update_arrow' | 'delete_arrow'): void {
    if (projectIndex(this.p).arrows.has(id)) {
      throw new ToolError(
        'wrong-kind',
        'a referência é de uma seta, não de uma marcação',
        {
          hint: `use ${tool} para a seta`,
        },
      );
    }
  }

  private noPoints(op: { readonly points?: unknown }): void {
    if (op.points !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`points` não é aceito: a rota da seta é da pessoa (o servidor só informa as pontas e o estilo)',
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
      description: `Criar a seta "${this.markingLabel(project, from)}" → "${this.markingLabel(project, to)}" (${projectIndex(project).arrows.get(id)!.style})`,
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
      changes.push('destrancar');
    }
    if (op.name !== undefined) {
      project = setArrowName(project, id, op.name);
      changes.push(`nome ${quoted(projectIndex(project).arrows.get(id)!.name)}`);
    }
    if (op.style !== undefined) {
      project = setArrowStyle(project, id, op.style);
      changes.push(`estilo ${op.style}`);
    }
    if (op.locked === true) {
      project = setArrowLocked(project, id, true);
      changes.push('trancar');
    }
    // A proposta só leva a criação e a remoção da seta: nome, estilo e trava de uma seta que já
    // existe no projeto são da pessoa e não viram mudança.
    const existing = (this.io.diskProject ?? this.loaded.project).arrows.some(
      (a) => a.id === id,
    );
    return {
      project,
      description: `Alterar a seta "${label}": ${changes.join(', ') || 'nada'}`,
      ...(existing && changes.length > 0
        ? {
            notes: [
              'a proposta só leva a criação e a remoção de setas: a mudança de nome, estilo ou trava de uma seta que já existe não entra na proposta (vale na prévia deste lote e numa seta criada nele)',
            ],
          }
        : {}),
    };
  }

  /**
   * Alvo do `near`: um container ou uma marcação (nunca uma seta), por apelido, referência ou id.
   */
  private nearTarget(text: string): FloatingNearTarget {
    const target = this.containerOrMarking(text);
    if (target.kind === 'marking' && projectIndex(this.p).arrows.has(target.id)) {
      throw new ToolError('invalid-arguments', '`near` não aceita uma seta', {
        hint: 'informe um container ou uma marcação',
      });
    }
    return target;
  }

  /** Container ou marcação (ou seta, que é uma marcação para a referência), por apelido, referência ou id. */
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
   * `wrap_items`: o `wrapItems` do modelo (o mesmo Envolver da app), com id novo, nome e origem
   * opcionais. Notas e setas não entram (aviso); sem nada que entre, `invalid-parent`.
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
        'nada para envolver: notas (flutuantes) e setas não entram; informe ao menos uma marcação não flutuante ou um container',
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
              `${ignored} item(ns) ignorado(s): notas (flutuantes) e setas não entram numa marcação pai`,
            ],
          }
        : {}),
      description: `Envolver ${entering.length} ${entering.length === 1 ? 'item' : 'itens'} numa marcação nova "${this.markingLabel(project, markingId)}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
        op.source ? `, ${sourceLabel(toSource(op.source))}` : ''
      })`,
      created: [{ kind: 'm', id: markingId }],
    };
  }

  /**
   * Cria uma marcação por nó com tipo da árvore medida, cada uma por `create_marking` (o pai sai
   * da geometria, nunca da árvore). Um nó que não cria (tamanho mínimo, por exemplo) vira aviso e
   * os outros seguem; a prova de desenho da CF10 olha o que o lote criou.
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
        notes.push(`${marking.path}: não criada (${error.message})`);
      }
    }
    const made = created.filter((c) => c.kind === 'm').length;
    return {
      project,
      notes,
      created,
      rowAliases,
      description: `Importar layout medido "${op.system}": ${made} marcação(ões) criada(s)${
        plan.markings.length > made
          ? `, ${plan.markings.length - made} não criada(s)`
          : ''
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
        '`annotationAs` só vale com `annotation` na mesma operação',
      );
    }
    if (op.container !== undefined && op.image !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        'informe `container` (a antiga `image` também é aceita), não os dois',
      );
    }
    const containerRef = op.container ?? op.image;
    // `inside`: o alvo (componente com slot) dá o container; o pai gravado continua da geometria.
    const inside = op.inside === undefined ? null : this.insideTarget(op, containerRef);
    // Sem `container`: marcação do canvas (rect em unidades do canvas, podendo ser negativo).
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
        '`inside` só vale com `annotation` de um tipo com componente (veja list_components)',
      );
    }
    if (op.rect === undefined && component === null) {
      throw new ToolError(
        'invalid-arguments',
        '`rect` é obrigatório (só um tipo de anotação com componente dispensa o retângulo: veja list_components)',
      );
    }
    // Com componente o mínimo é o `minSize` dele ou 1×1; sem componente, o de qualquer marcação (8).
    const minSize = component === null ? null : componentFileMinSize(component.component);
    // `near` (ME4): só um tipo flutuante; o lugar sai de `placeFloatingNear` e o `rect`, se vier,
    // dá só o tamanho. Nos outros casos o argumento é ignorado, com aviso.
    const notes: string[] = [];
    let nearRect: { x: number; y: number; width: number; height: number } | null = null;
    if (op.near !== undefined) {
      if (component?.floating === true && containerId === null) {
        const target = this.nearTarget(op.near);
        const size =
          op.rect ??
          componentPlacement(
            p,
            catalog,
            { containerId: null, parentId: null, ...typeRef! },
            this.measurer,
          );
        nearRect = placeFloatingNear(p, target, size);
      } else {
        notes.push(
          '`near` só vale para um tipo de anotação flutuante, sem `container`: foi ignorado (para colocar a marcação num container, use `container` e `rect`)',
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
      // O pai sai da geometria (o modelo assenta ao criar): sem `rect`, no centro do container.
      const rect =
        nearRect ??
        (inside ? this.insideRect(op, inside.id, containerId, typeRef, minSize) : null) ??
        op.rect ??
        componentPlacement(
          p,
          catalog,
          { containerId, parentId: null, ...typeRef },
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
          },
          this.measurer,
        ),
      );
      if (inside) this.noteInsideFit(notes, p, project, inside.id, markingId, rect);
      if (annotation.name !== undefined) {
        project = renameAnnotation(project, newAnnotationId, annotation.name);
      }
      if (annotation.values !== undefined) {
        project = this.setValues(project, newAnnotationId, annotation.values, rowAliases);
      }
    } else {
      project = createMarking(p, {
        id: markingId,
        containerId,
        rect: op.rect!,
        name: op.name ?? null,
      });
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
    // A marcação nova está no fim do array (o assentar não reordena): a busca de trás para frente é O(1).
    let created!: Marking;
    for (let i = project.markings.length - 1; i >= 0; i--) {
      if (project.markings[i]!.id === markingId) {
        created = project.markings[i]!;
        break;
      }
    }
    const { rect } = created;
    const label = this.createdMarkingLabel(p, project, created, component?.name ?? null);
    return {
      project,
      ...(notes.length > 0 ? { notes } : {}),
      description: `Criar a marcação "${label}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
        op.rect === undefined ? ', tamanho inicial do componente' : ''
      }${op.source ? `, ${sourceLabel(toSource(op.source))}` : ''})${
        typeRef ? ` com a anotação ${typeRef.specId}/${typeRef.typeId}` : ''
      }`,
      created: [
        { kind: 'm', id: markingId },
        ...(annotationId ? [{ kind: 'a' as const, id: annotationId }] : []),
      ],
      rowAliases,
    };
  }

  /**
   * Alvo do `inside` de `create_marking`: uma marcação (do lote ou do projeto) que desenha um
   * componente com slot. Só posiciona: o pai gravado sai da geometria. `container`, se vier,
   * precisa ser o do alvo.
   */
  private insideTarget(
    op: Extract<Operation, { op: 'create_marking' }>,
    containerRef: string | undefined,
  ): { id: string; containerId: string | null } {
    if (op.near !== undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`inside` e `near` são duas posições: informe só um',
      );
    }
    if (op.annotation === undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`inside` só vale com `annotation` de um tipo com componente (veja list_components)',
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
        '`inside` precisa ser uma marcação que desenha um componente com slot (veja list_components: só o componente com slot, como Column ou Row, recebe filhas)',
      );
    }
    if (
      containerRef !== undefined &&
      this.containerItem(containerRef, this.p) !== target.containerId
    ) {
      throw new ModelError(
        'invalid-parent',
        '`container` não é o container do alvo de `inside`: omita `container` (ele vem do alvo)',
      );
    }
    return { id, containerId: target.containerId };
  }

  /** Retângulo da filha no slot do alvo; o `rect` do passo dá só o tamanho (x e y são ignorados). */
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
      },
      this.measurer,
    );
  }

  /** Aviso de slot cheio: a filha não coube na área do slot (e, se o pai não é o alvo, em quem ficou). */
  private noteInsideFit(
    notes: string[],
    before: Project,
    after: Project,
    targetId: string,
    markingId: string,
    rect: Rect,
  ): void {
    if (placementFitsSlot(before, this.catalog, targetId, rect, this.measurer)) return;
    const parentId = after.markings.find((m) => m.id === markingId)?.parentId ?? null;
    const where =
      parentId !== null && parentId !== targetId
        ? `; ficou dentro de ${this.markingLabel(after, parentId)}`
        : '';
    notes.push(
      `a marcação não coube no slot de ${this.markingLabel(after, targetId)}: aumente o componente ou use Arrumar na app${where}`,
    );
  }

  /** Anotação tipada nova: camada do tipo (ou a informada), dona e valores campo a campo. */
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
            `a camada "${typeLayer.name}" da especialização não está no projeto`,
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
          'anotação livre: informe `layer` (ou `type` para uma anotação tipada)',
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
      ? `, vinculada a ${annotationShortLabel(project, ownerAnnotation)}${
          op.role ? ` (papel "${roleNameOf(project, ownerAnnotation, op.role)}")` : ''
        }`
      : '';
    const layerName = projectIndex(project).layers.get(
      projectIndex(project).annotations.get(id)!.layerId,
    )!.name;
    return {
      project,
      description: `Criar a anotação ${this.annotationLabel(project, id)} na camada "${layerName}"${owner}`,
      created: [{ kind: 'a', id }],
      rowAliases,
    };
  }

  /** Nome do papel que a anotação ocupa no dono, para a descrição do passo. */
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
      changes.push(`nome ${quoted(projectIndex(project).annotations.get(id)!.name)}`);
    }
    if (op.entries !== undefined) {
      project = setEntries(project, id, this.entries(project, id, op.entries));
      changes.push(`${op.entries.length} par(es)`);
    }
    if (op.values !== undefined) {
      project = this.setValues(project, id, op.values, rowAliases);
      changes.push(`campos ${Object.keys(op.values).join(', ')}`);
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
      changes.push(
        op.role === null ? 'sem papel' : `papel "${this.roleName(project, id)}"`,
      );
    }
    return {
      project,
      description: `Alterar a anotação ${label}: ${changes.join(', ') || 'nada'}`,
      rowAliases,
      ...(roleCleared ? { roleCleared } : {}),
    };
  }

  /**
   * Troca a dona (ou tira, com `null`). Se o papel da anotação sai junto e o passo não traz
   * `role` (`roleUnset`), a nota entra no texto do passo e o aviso `role-cleared` é devolvido.
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
        ? 'sem dona'
        : `dona ${annotationShortLabel(project, projectIndex(project).annotations.get(ownerId)!)}`;
    const cleared =
      roleId !== null &&
      roleUnset &&
      projectIndex(project).annotations.get(id)!.parentRole === null;
    if (!cleared) return { project, change: where };
    const reason =
      ownerId === null ? 'a anotação fica sem dona' : 'a nova dona não o oferece';
    return {
      project,
      change: `${where}; papel ${quoted(roleName)} limpo`,
      roleCleared: {
        annotationId: id,
        role: roleId,
        roleName,
        message: `o papel ${quoted(roleName)} de ${this.annotationLabel(p, id)} é limpo: ${reason}`,
      },
    };
  }
}

function kindLabel(kind: AliasTarget['kind']): string {
  return kind === 'row' ? 'uma linha de tabela' : KIND_LABEL[kind];
}

function fail(code: 'not-found', message: string): never {
  throw new ToolError(code, message);
}

/** Aplica o lote sobre o projeto carregado, sem gravar nada. */
export function runBatch(
  loaded: LoadedProject,
  operations: readonly Operation[],
  io: BatchIo,
): Promise<BatchResult> {
  return new Batch(loaded, io).run(operations);
}

/** Itens criados, alterados e excluídos, por coleção (comparando o antes e o depois). */
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

/** Pendências (anotações incompletas) que o lote cria ou resolve. */
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
 * Os avisos da especialização que as anotações criadas ou alteradas pelo lote passam a ter
 * (etapa #486, decisão 11), pelas mesmas mudanças que a revisão da proposta mostra
 * (`changeNotices`), do mais grave ao menos e, no mesmo `kind`, na ordem em que surgem.
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
