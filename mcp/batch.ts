import {
  ModelError,
  addAnnotation,
  addImage,
  addLayer,
  addTableRow,
  addTypedAnnotation,
  annotationDeletionImpact,
  annotationShortLabel,
  applySpecialization,
  checkSpecApply,
  codeRefEntries,
  confirmMarkingReview,
  createMarking,
  extensionForMime,
  fieldOf,
  imageDeletionImpact,
  layerDeletionImpact,
  markingDeletionImpact,
  matchShortCode,
  moveLayer,
  moveMarking,
  moveTableRow,
  nextLayerColor,
  parseRef,
  parseSpecText,
  pastedFileName,
  projectIndex,
  projectIssues,
  projectLayerFor,
  removeAnnotation,
  removeImage,
  removeLayer,
  removeMarking,
  removePlatformRepo,
  removeSpecialization,
  removeTableRow,
  renameAnnotation,
  renameImage,
  renameLayer,
  renameMarking,
  replaceImage,
  setAnnotationInherit,
  setAnnotationParent,
  setEntries,
  setFieldValue,
  setImageLocked,
  setImageMarkingColor,
  setImageMarkingsLocked,
  setImagePlacement,
  setLayerColor,
  setMarkingLocked,
  setMarkingParent,
  setMarkingRect,
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
  type ItemKind,
  type JsonValue,
  type Layer,
  type Project,
  type RefValue,
  type Spec,
  type SpecField,
} from '../src/model';
import { ToolError } from './errors';
import { MIME, detectFormat } from './image/formats';
import { prepareImage } from './imagePrepare';
import { KIND_NAMES, Refs } from './items';
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
  /** Regras entre coleções violadas pelo resultado (não deveria acontecer). */
  readonly invariantIssues: readonly string[];
}

interface Step {
  readonly project: Project;
  readonly description: string;
  readonly created?: readonly { kind: CreatedKind; id: string }[];
  readonly rowAliases?: readonly [string, AliasTarget][];
  readonly imageFiles?: readonly [string, Uint8Array][];
}

const KIND_LABEL: Record<CreatedKind, string> = { layer: 'camada', ...KIND_NAMES };

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
  if (payload === '' || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(payload)) {
    throw new ToolError('invalid-base64', 'conteúdo base64 vazio ou inválido');
  }
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

class Batch {
  private p: Project;
  private readonly aliases = new Map<string, AliasTarget>();
  /** Apelidos de operações que falharam: as que dependem delas dizem o porquê. */
  private readonly failedAliases = new Map<string, number>();
  private readonly imageFiles = new Map<string, Uint8Array>();
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
      try {
        if (
          alias !== undefined &&
          (this.aliases.has(alias) || this.failedAliases.has(alias))
        ) {
          throw new ToolError('duplicate-alias', `apelido repetido no lote: ${alias}`);
        }
        const step = await this.apply(op);
        this.p = step.project;
        this.steps.push({ index, description: step.description });
        for (const [file, data] of step.imageFiles ?? []) this.imageFiles.set(file, data);
        for (const [name, target] of step.rowAliases ?? [])
          this.aliases.set(name, target);
        for (const [n, item] of (step.created ?? []).entries()) {
          // O apelido da operação vale para o item principal (o primeiro criado).
          const named = n === 0 ? alias : undefined;
          if (named !== undefined) this.aliases.set(named, item);
          this.created.push({ index, ...item, ...(named ? { alias: named } : {}) });
        }
      } catch (error) {
        if (alias !== undefined && !this.aliases.has(alias)) {
          this.failedAliases.set(alias, index);
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
      invariantIssues,
    };
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
          `o apelido ${name} não é de uma ${kindLabel(kind)}`,
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

  /** Id de uma marcação, imagem ou anotação deste projeto: apelido, referência ou id. */
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
        `a referência é de uma ${KIND_NAMES[parsed.kind]}, não de uma ${KIND_NAMES[kind]}`,
      );
    }
    const found = matchShortCode(p, kind, parsed.code);
    if (found.length === 1) return found[0]!.id;
    if (found.length === 0) {
      throw new ToolError('not-found', `${KIND_NAMES[kind]} não encontrada: ${text}`);
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

  private async spec(file: string): Promise<Spec> {
    const { bytes } = await this.io.readSource(file);
    const parsed = parseSpecText(Buffer.from(bytes).toString('utf8'));
    if (!parsed.ok) {
      throw new ToolError('invalid-spec', `especialização inválida: ${file}`, {
        errors: parsed.errors.slice(0, 20),
      });
    }
    return parsed.spec;
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
        if (op.urlTemplate === undefined && op.localPath === undefined) {
          throw new ToolError(
            'nothing-to-change',
            'informe `urlTemplate` e/ou `localPath` (ou use remove_platform_repo)',
          );
        }
        const project = setPlatformRepo(p, op.platform, {
          ...(op.urlTemplate !== undefined ? { urlTemplate: op.urlTemplate } : {}),
          ...(op.localPath !== undefined ? { localPath: op.localPath } : {}),
        });
        const repo = project.platformRepos[op.platform];
        const changes = [
          op.urlTemplate !== undefined
            ? `urlTemplate ${repo?.urlTemplate ? `"${repo.urlTemplate}"` : 'removido'}`
            : null,
          op.localPath !== undefined
            ? `localPath ${repo?.localPath ? `"${repo.localPath}"` : 'removido'}`
            : null,
        ].filter((change) => change !== null);
        return {
          project,
          description: `Configurar o repositório da plataforma "${op.platform}": ${changes.join(', ')}${
            repo ? '' : ' (sem urlTemplate nem localPath: configuração removida)'
          }`,
        };
      }
      case 'remove_platform_repo':
        return {
          project: removePlatformRepo(p, op.platform),
          description: `Remover o repositório da plataforma "${op.platform}"`,
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
        const spec = await this.spec(op.file);
        const check = checkSpecApply(p, spec);
        if (check === 'update') {
          throw new ToolError(
            'spec-already-applied',
            `a especialização "${spec.id}" já está aplicada numa versão menor: use update_specialization`,
          );
        }
        const project = applySpecialization(p, spec);
        const layers = project.layers.slice(p.layers.length);
        return {
          project,
          description: `Aplicar a especialização "${spec.name}" (${spec.id} v${spec.version}): camadas ${layers
            .map((l) => `"${l.name}"`)
            .join(', ')}`,
          created: layers.map((l) => ({ kind: 'layer' as const, id: l.id })),
        };
      }
      case 'update_specialization': {
        const spec = await this.spec(op.file);
        const project = updateSpecialization(p, spec);
        const before = new Set(p.layers.map((l) => l.id));
        const added = project.layers.filter((l) => !before.has(l.id));
        return {
          project,
          description: `Atualizar a especialização "${spec.id}" para a v${spec.version}${
            added.length > 0
              ? ` (camadas novas: ${added.map((l) => `"${l.name}"`).join(', ')})`
              : ''
          }`,
          created: added.map((l) => ({ kind: 'layer' as const, id: l.id })),
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
      case 'add_image': {
        const image = await this.image(op, p);
        const id = crypto.randomUUID();
        let project = addImage(p, {
          id,
          file: image.file,
          width: image.width,
          height: image.height,
          ...(op.center ? { center: op.center } : {}),
        });
        if (op.name !== undefined) project = renameImage(project, id, op.name);
        return {
          project,
          description: `Adicionar a imagem ${image.file} (${image.width}×${image.height} px, ${image.note})`,
          created: [{ kind: 'i', id }],
          imageFiles: [[image.file, image.data]],
        };
      }
      case 'update_image': {
        const id = this.item(op.image, 'i');
        let project = p;
        const changes: string[] = [];
        if (op.locked === false) {
          project = setImageLocked(project, id, false);
          changes.push('destrancar');
        }
        if (op.name !== undefined) {
          project = renameImage(project, id, op.name);
          changes.push(`nome ${quoted(projectIndex(project).images.get(id)!.name)}`);
        }
        if (op.x !== undefined || op.y !== undefined || op.scale !== undefined) {
          const { placement } = projectIndex(project).images.get(id)!;
          const next = {
            x: op.x ?? placement.x,
            y: op.y ?? placement.y,
            scale: op.scale ?? placement.scale,
          };
          project = setImagePlacement(project, id, next);
          changes.push(`posição (${next.x}, ${next.y}) escala ${next.scale}`);
        }
        if (op.markingColor !== undefined) {
          project = setImageMarkingColor(project, id, op.markingColor);
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
        if (op.locked === true) {
          project = setImageLocked(project, id, true);
          changes.push('trancar');
        }
        return {
          project,
          description: `Alterar a imagem "${this.refs(p).imageLabel(id)}": ${changes.join(', ') || 'nada'}`,
        };
      }
      case 'replace_image': {
        const id = this.item(op.image, 'i');
        const image = await this.image(op, p);
        const project = replaceImage(
          p,
          id,
          { file: image.file, width: image.width, height: image.height },
          { confirmAspectChange: op.confirmAspectChange === true },
        );
        const old = projectIndex(p).images.get(id)!;
        return {
          project,
          description: `Trocar o arquivo da imagem "${this.refs(p).imageLabel(id)}": ${old.file} → ${image.file} (${image.width}×${image.height} px, ${image.note})`,
          imageFiles: [[image.file, image.data]],
        };
      }
      case 'delete_image': {
        const id = this.item(op.image, 'i');
        const impact = imageDeletionImpact(p, id);
        return {
          project: removeImage(p, id),
          description: `Excluir a imagem "${this.refs(p).imageLabel(id)}" (${impact.markings} marcação(ões), ${impact.annotations} anotação(ões))`,
        };
      }
      case 'create_marking': {
        const imageId = this.item(op.image, 'i');
        const id = crypto.randomUUID();
        let project = createMarking(p, {
          id,
          imageId,
          rect: op.rect,
          name: op.name ?? null,
        });
        if (op.parent !== undefined) {
          const parentId = op.parent === null ? null : this.item(op.parent, 'm');
          if (projectIndex(project).markings.get(id)!.parentId !== parentId) {
            project = setMarkingParent(project, id, parentId);
          }
        }
        const { rect } = op;
        return {
          project,
          description: `Criar a marcação "${this.markingLabel(project, id)}" (x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height})`,
          created: [{ kind: 'm', id }],
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
          project = setMarkingRect(project, id, op.rect);
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
      const type = this.type(op.type);
      const typeLayer = projectIndex(p).types.get(
        typeKey(type.specId, type.typeId),
      )!.layer;
      const layer =
        op.layer !== undefined
          ? this.layer(op.layer)
          : (projectLayerFor(p, type.specId, typeLayer.id) ??
            fail(
              'not-found',
              `a camada "${typeLayer.name}" da especialização não está no projeto`,
            ));
      project = addTypedAnnotation(p, {
        id,
        markingId,
        layerId: layer.id,
        type,
        name: op.name ?? null,
        parentAnnotationId: ownerId,
      });
      if (op.values !== undefined)
        project = this.setValues(project, id, op.values, rowAliases);
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
      const before = project;
      project = this.setValues(project, id, op.values, rowAliases);
      changes.push(
        `campos ${Object.keys(op.values)
          .map((key) => `${key}${codeRefDiff(before, project, id, key)}`)
          .join(', ')}`,
      );
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

/**
 * Campo `codeRef`: o valor enviado substitui a lista, então o resumo diz quantas entradas
 * entram e quantas saem (` (+1, -2 entrada(s))`). Vazio para outros campos ou sem diferença.
 */
function codeRefDiff(before: Project, after: Project, annotationId: string, key: string) {
  const idsOf = (p: Project) => {
    const a = projectIndex(p).annotations.get(annotationId);
    const type = a ? typeOfAnnotation(p, a)?.type : undefined;
    return type && fieldOf(type, key)?.type === 'codeRef'
      ? new Set(codeRefEntries(a?.values?.[key]).map((e) => e._id))
      : null;
  };
  const [old, next] = [idsOf(before), idsOf(after)];
  if (old === null || next === null) return '';
  const added = [...next].filter((id) => !old.has(id)).length;
  const removed = [...old].filter((id) => !next.has(id)).length;
  if (added === 0 && removed === 0) return '';
  return ` (${[added > 0 ? `+${added}` : null, removed > 0 ? `-${removed}` : null]
    .filter((part) => part !== null)
    .join(', ')} entrada(s))`;
}

function kindLabel(kind: AliasTarget['kind']): string {
  return kind === 'row' ? 'linha de tabela' : KIND_LABEL[kind];
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
    images: count(before.images, after.images),
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
