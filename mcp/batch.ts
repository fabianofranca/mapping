import {
  ModelError,
  addAnnotation,
  addBackgroundContainer,
  addComponentMarking,
  addContainer,
  addLayer,
  addTableRow,
  addTypedAnnotation,
  annotationDeletionImpact,
  annotationShortLabel,
  applySpecialization,
  checkSpecApply,
  componentMinSize,
  componentPlacement,
  componentTypes,
  approximateMeasurer,
  confirmMarkingReview,
  createMarking,
  innermostContaining,
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
  removePlatformRepo,
  removeSpecialization,
  removeTableRow,
  renameAnnotation,
  renameContainer,
  renameLayer,
  renameMarking,
  replaceContainer,
  setAnnotationInherit,
  setAnnotationParent,
  setEntries,
  setFieldValue,
  setImageLocked,
  setContainerMarkingColor,
  setImageMarkingsLocked,
  setContainerPlacement,
  setImageSource,
  setLayerColor,
  setMarkingLocked,
  setMarkingParent,
  setMarkingRect,
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
  type Project,
  type RefValue,
  type Spec,
  type SpecField,
  type SpecUpdateImpact,
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
import { prepareImage } from './imagePrepare';
import { KIND_NOT_FOUND, KIND_WITH_ARTICLE, Refs } from './items';
import { MODEL_ERROR_MESSAGES } from './modelErrors';
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
  }[];
  /** Regras entre coleções violadas pelo resultado (não deveria acontecer). */
  readonly invariantIssues: readonly string[];
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

class Batch {
  private p: Project;
  private readonly aliases = new Map<string, AliasTarget>();
  /** Apelidos de operações que falharam: as que dependem delas dizem o porquê. */
  private readonly failedAliases = new Map<string, number>();
  private readonly imageFiles = new Map<string, Uint8Array>();
  private readonly packageFiles = new Map<string, Uint8Array>();
  private readonly libraryWarnings: LibraryWarning[] = [];
  private readonly deprecations: { index: number; op: string; message: string }[] = [];
  private readonly errors: OperationError[] = [];
  private readonly steps: { index: number; description: string }[] = [];
  private readonly created: CreatedItem[] = [];

  constructor(
    private readonly loaded: LoadedProject,
    private readonly io: BatchIo,
  ) {
    this.p = loaded.project;
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
        for (const [file, data] of step.imageFiles ?? []) this.imageFiles.set(file, data);
        this.takePackage(index, step);
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
      invariantIssues,
    };
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
      for (const key of [...this.packageFiles.keys()]) {
        if (dir !== null && packageDirOf(key) === dir) this.packageFiles.delete(key);
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
      const [, detail] = error.message.split(': ');
      return {
        index,
        op,
        code: error.code,
        message: MODEL_ERROR_MESSAGES[error.code],
        ...(detail ? { detail } : {}),
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

  /** Id de uma marcação, container ou anotação deste projeto: apelido, referência ou id. */
  private item(text: string, kind: ItemKind, p: Project = this.p): string {
    const wanted = text.trim();
    if (wanted.startsWith('$')) {
      const target = this.alias(wanted, kind);
      return 'id' in target ? target.id : '';
    }
    const parsed = parseRef(wanted);
    if (!parsed) {
      throw new ToolError('invalid-ref', `referência inválida: ${text}`);
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
    } else {
      throw new ToolError(
        'invalid-ref-value',
        `campo ${key}: informe "entry" (par), "key" + "row" (linha) ou "key" (campo)`,
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
    let next = p;
    for (const [key, value] of Object.entries(values)) {
      const annotation = projectIndex(next).annotations.get(annotationId)!;
      const resolved = typeOfAnnotation(next, annotation);
      const field: SpecField | null = resolved ? fieldOf(resolved.type, key) : null;
      if (field?.type === 'table') {
        next = this.setTable(next, annotationId, key, value, rowAliases);
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
    key: string,
    value: JsonValue,
    rowAliases: [string, AliasTarget][],
  ): Project {
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
        next = setTableCell(next, annotationId, key, rowId, column, cell);
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
      case 'add_container':
        return op.file !== undefined || op.base64 !== undefined
          ? this.addContainerFromFile(op, p)
          : this.addContainerWithBackground(op, p);
      case 'add_image':
        return this.addContainerFromFile(op, p);
      case 'add_blank_image':
        return this.addContainerWithBackground(op, p);
      case 'update_container':
        return this.updateContainerOp(op, this.item(op.container, 'i'), p);
      case 'update_image':
        return this.updateContainerOp(op, this.item(op.image, 'i'), p);
      case 'replace_container':
        return this.replaceContainerOp(op, this.item(op.container, 'i'), p);
      case 'replace_image':
        return this.replaceContainerOp(op, this.item(op.image, 'i'), p);
      case 'delete_container':
        return this.deleteContainerOp(this.item(op.container, 'i'), p);
      case 'delete_image':
        return this.deleteContainerOp(this.item(op.image, 'i'), p);
      case 'create_marking':
        return this.createMarkingOp(op);
      case 'move_marking': {
        const id = this.item(op.marking, 'm');
        const before = siblingPosition(p, id);
        return {
          project: reorderMarking(p, id, op.index),
          description: `Mover a marcação "${this.markingLabel(p, id)}" para a posição ${op.index} entre as ${before.count} irmãs (0 = por baixo)`,
        };
      }
      case 'update_marking': {
        const id = this.item(op.marking, 'm');
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
        if (op.parent !== undefined) {
          const parentId = op.parent === null ? null : this.item(op.parent, 'm', project);
          project = setMarkingParent(project, id, parentId);
          changes.push(
            parentId === null
              ? 'primeiro nível'
              : `pai "${this.markingLabel(project, parentId)}"`,
          );
        }
        if (op.move !== undefined) {
          project = moveMarking(project, id, op.move.dx, op.move.dy);
          changes.push(`mover (${op.move.dx}, ${op.move.dy}) com as filhas`);
        }
        if (op.rect !== undefined) {
          const { rect } = op;
          const minSize = componentMinSize(project, this.loaded.catalog, id);
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
        throw new ToolError(
          error.code,
          `retângulo menor que o tamanho mínimo do componente de ${what}: ${minSize.width}×${minSize.height} px`,
          { minSize: { width: minSize.width, height: minSize.height } },
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
    const image = await this.image(op, p);
    const id = crypto.randomUUID();
    let project = addContainer(p, {
      id,
      file: image.file,
      width: image.width,
      height: image.height,
      ...(op.center ? { center: op.center } : {}),
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
    const id = crypto.randomUUID();
    let project = addBackgroundContainer(p, {
      id,
      ...(op.name !== undefined ? { name: op.name } : {}),
      width,
      height,
      background,
      ...(op.center ? { center: op.center } : {}),
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
      changes.push(`posição (${next.x}, ${next.y}) escala ${next.scale}`);
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
      { confirmAspectChange: op.confirmAspectChange === true },
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

  private createMarkingOp(op: Extract<Operation, { op: 'create_marking' }>): Step {
    const p = this.p;
    const catalog = this.loaded.catalog;
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
    if (containerRef === undefined) {
      throw new ToolError(
        'invalid-arguments',
        '`container` é obrigatório em create_marking',
      );
    }
    const containerId = this.item(containerRef, 'i');
    const markingId = crypto.randomUUID();
    const parentGiven = op.parent !== undefined;
    const parentId =
      op.parent === undefined || op.parent === null ? null : this.item(op.parent, 'm');

    const typeRef = annotation ? this.type(annotation.type) : null;
    const component =
      typeRef === null
        ? null
        : (componentTypes(p, catalog).find(
            (t) => t.specId === typeRef.specId && t.typeId === typeRef.typeId,
          ) ?? null);
    if (op.rect === undefined && component === null) {
      throw new ToolError(
        'invalid-arguments',
        '`rect` é obrigatório (só um tipo de anotação com componente dispensa o retângulo: veja list_components)',
      );
    }
    const minSize = component?.component.minSize ?? null;
    const rowAliases: [string, AliasTarget][] = [];
    let project: Project;
    let annotationId: string | null = null;

    if (annotation && typeRef !== null && component !== null) {
      const newAnnotationId = crypto.randomUUID();
      annotationId = newAnnotationId;
      // Sem `rect` e sem `parent`: primeiro nível, no centro do container; com `rect`, a mais
      // interna que o contém (como na app).
      const effectiveParent = parentGiven
        ? parentId
        : op.rect === undefined
          ? null
          : (innermostContaining(p, containerId, op.rect)?.id ?? null);
      const rect =
        op.rect ??
        componentPlacement(
          p,
          catalog,
          { containerId: containerId, parentId: effectiveParent, ...typeRef },
          approximateMeasurer,
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
            containerId: containerId,
            parentId: effectiveParent,
            ...typeRef,
            rect,
            name: op.name ?? null,
          },
          approximateMeasurer,
        ),
      );
      if (annotation.name !== undefined) {
        project = renameAnnotation(project, newAnnotationId, annotation.name);
      }
      if (annotation.values !== undefined) {
        project = this.setValues(project, newAnnotationId, annotation.values, rowAliases);
      }
    } else {
      project = createMarking(p, {
        id: markingId,
        containerId: containerId,
        rect: op.rect!,
        name: op.name ?? null,
      });
      if (
        parentGiven &&
        projectIndex(project).markings.get(markingId)!.parentId !== parentId
      ) {
        project = setMarkingParent(project, markingId, parentId);
      }
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
    const { rect } = projectIndex(project).markings.get(markingId)!;
    return {
      project,
      description: `Criar a marcação "${this.markingLabel(project, markingId)}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}${
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
    if (op.inherit !== undefined) project = setAnnotationInherit(project, id, op.inherit);
    const owner = ownerId
      ? `, vinculada a ${annotationShortLabel(project, projectIndex(project).annotations.get(ownerId)!)}`
      : '';
    const layerName = projectIndex(project).layers.get(
      projectIndex(project).annotations.get(id)!.layerId,
    )!.name;
    return {
      project,
      description: `Criar a anotação ${this.annotationLabel(project, id)} na camada "${layerName}"${owner}${
        op.inherit ? ', herdada pelas descendentes' : ''
      }`,
      created: [{ kind: 'a', id }],
      rowAliases,
    };
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
    if (op.owner !== undefined) {
      const ownerId = op.owner === null ? null : this.item(op.owner, 'a', project);
      project = setAnnotationParent(project, id, ownerId);
      changes.push(
        ownerId === null
          ? 'sem dona'
          : `dona ${annotationShortLabel(project, projectIndex(project).annotations.get(ownerId)!)}`,
      );
    }
    if (op.inherit !== undefined) {
      project = setAnnotationInherit(project, id, op.inherit);
      changes.push(op.inherit ? 'herdada pelas descendentes' : 'não herdada');
    }
    return {
      project,
      description: `Alterar a anotação ${label}: ${changes.join(', ') || 'nada'}`,
      rowAliases,
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
  return {
    specializations: count(specs(before), specs(after)),
    layers: count(before.layers, after.layers),
    containers: count(before.containers, after.containers),
    markings: count(before.markings, after.markings),
    annotations: count(before.annotations, after.annotations),
    platformRepos: count(repos(before), repos(after)),
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
