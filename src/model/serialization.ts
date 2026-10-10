import { validateProject, type InvariantIssue } from './invariants';
import { migrate, migrations as defaultMigrations, type Migration } from './migrations';
import { repairProject, type RepairResult } from './repair';
import { projectSchema } from './schema';
import { parseSpecText, type Spec } from './spec';
import {
  SCHEMA_VERSION,
  type JsonValue,
  type Project,
  type ProjectFile,
  type ProjectSpecialization,
} from './types';

/** Cópia profunda com as chaves na ordem em que estão (valores das anotações tipadas). */
function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneJson(v)]));
  }
  return value;
}

/**
 * Gera o texto do `mapping.json`: chaves sempre na mesma ordem, indentação de
 * 2 espaços e quebra de linha no final. Serializar o resultado de
 * `deserialize` produz exatamente o mesmo texto (round-trip sem perdas).
 */
export function serialize(p: Project): string {
  const canonical: ProjectFile = {
    schemaVersion: p.schemaVersion,
    revision: p.revision,
    app: p.app,
    coordinateSystem: p.coordinateSystem,
    project: {
      name: p.project.name,
      createdAt: p.project.createdAt,
      updatedAt: p.project.updatedAt,
    },
    specializations: p.specializations.map((s) => ({
      id: s.id,
      version: s.version,
      file: s.file,
    })),
    platformRepos: Object.fromEntries(
      Object.entries(p.platformRepos).map(([platform, repo]) => [
        platform,
        { urlTemplate: repo.urlTemplate, localPath: repo.localPath },
      ]),
    ),
    layers: p.layers.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      spec: l.spec && { specId: l.spec.specId, layerId: l.spec.layerId },
    })),
    images: p.images.map((i) => ({
      id: i.id,
      name: i.name,
      file: i.file,
      width: i.width,
      height: i.height,
      placement: { x: i.placement.x, y: i.placement.y, scale: i.placement.scale },
      markingColor: i.markingColor,
      locked: i.locked,
      source: i.source && { system: i.source.system, id: i.source.id, url: i.source.url },
    })),
    markings: p.markings.map((m) => ({
      id: m.id,
      imageId: m.imageId,
      parentId: m.parentId,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      needsReview: m.needsReview,
      locked: m.locked,
      source: m.source && { system: m.source.system, id: m.source.id, url: m.source.url },
    })),
    annotations: p.annotations.map((a) => ({
      id: a.id,
      markingId: a.markingId,
      layerId: a.layerId,
      name: a.name,
      inherit: a.inherit,
      parentAnnotationId: a.parentAnnotationId,
      type: a.type && { specId: a.type.specId, typeId: a.type.typeId },
      values:
        a.values &&
        Object.fromEntries(Object.entries(a.values).map(([k, v]) => [k, cloneJson(v)])),
      entries: a.entries.map((e) => ({ id: e.id, key: e.key, value: e.value })),
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** Texto de `specs/<id>.json`: a especialização com indentação de 2 espaços. */
export function serializeSpec(spec: Spec): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/** Arquivos de `specs/` do projeto (caminho → texto), para gravar ou exportar. */
export function specFiles(p: Project): Map<string, string> {
  const files = new Map<string, string>();
  for (const s of p.specializations) {
    if (s.spec) files.set(s.file, serializeSpec(s.spec));
  }
  return files;
}

/**
 * Caminhos de `specs/` citados por um `mapping.json` ainda não validado, para o
 * armazenamento ler as cópias antes de `deserialize`. Vazio se não der para ler.
 */
export function referencedSpecFiles(text: string): string[] {
  try {
    const raw: unknown = JSON.parse(text);
    const list: unknown = isRecord(raw) ? raw.specializations : null;
    if (!Array.isArray(list)) return [];
    return list.flatMap((s: unknown) =>
      isRecord(s) && typeof s.file === 'string' ? [s.file] : [],
    );
  } catch {
    // Só descobre quais cópias de `specs/` ler; o JSON inválido é tratado em `deserialize`.
    return [];
  }
}

/** Problema com a cópia de uma especialização em `specs/` (não impede a abertura). */
export interface SpecFileWarning {
  readonly specId: string;
  readonly file: string;
  readonly problem: 'missing' | 'invalid' | 'id-mismatch' | 'version-mismatch';
  /** Erros de validação (`caminho: mensagem`), em `invalid`. */
  readonly errors?: readonly string[];
}

export type DeserializeError =
  | { readonly code: 'invalid-json' }
  | { readonly code: 'invalid-schema'; readonly details: string }
  | { readonly code: 'unsupported-version'; readonly version: unknown }
  | { readonly code: 'missing-migration'; readonly from: number }
  | { readonly code: 'invariant-violation'; readonly issues: readonly InvariantIssue[] };

export type DeserializeResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** Arquivo de uma versão mais nova que a suportada: abrir sem permitir edição. */
      readonly readOnly: boolean;
      /** Versão original, quando o arquivo passou por migrações. */
      readonly migratedFrom: number | null;
      /**
       * Cópias de especialização ausentes ou inválidas: o projeto abre, e as
       * anotações delas aparecem como pendências ("tipo inexistente").
       */
      readonly specWarnings: readonly SpecFileWarning[];
    }
  | {
      readonly ok: false;
      readonly error: DeserializeError;
      /**
       * Em `invariant-violation`, o reparo mecânico do projeto lido (`repairProject`),
       * com o que a leitura apurou. Ler nunca grava: quem aceita o reparo é a app, e a
       * sessão grava o backup do original e o reparado na primeira gravação.
       */
      readonly repair?: RepairedLoad;
    };

/** Projeto inconsistente reparado na leitura (ver `DeserializeResult`). */
export interface RepairedLoad extends RepairResult {
  readonly readOnly: boolean;
  readonly migratedFrom: number | null;
  readonly specWarnings: readonly SpecFileWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Junta ao `mapping.json` o conteúdo de cada `specs/<id>.json`. */
function attachSpecs(
  data: ProjectFile,
  files: ReadonlyMap<string, string>,
): { project: Project; warnings: SpecFileWarning[] } {
  const warnings: SpecFileWarning[] = [];
  const specializations = data.specializations.map((ref): ProjectSpecialization => {
    const base = { id: ref.id, version: ref.version, file: ref.file };
    const warn = (problem: SpecFileWarning['problem'], errors?: readonly string[]) =>
      warnings.push({
        specId: ref.id,
        file: ref.file,
        problem,
        ...(errors ? { errors } : {}),
      });
    const text = files.get(ref.file);
    if (text === undefined) {
      warn('missing');
      return { ...base, spec: null };
    }
    const parsed = parseSpecText(text);
    if (!parsed.ok) {
      warn('invalid', parsed.errors);
      return { ...base, spec: null };
    }
    if (parsed.spec.id !== ref.id) {
      warn('id-mismatch');
      return { ...base, spec: null };
    }
    if (parsed.spec.version !== ref.version) warn('version-mismatch');
    return { ...base, spec: parsed.spec };
  });
  return { project: { ...data, specializations }, warnings };
}

/**
 * Lê o texto do `mapping.json`: JSON → migrações → schema zod → invariantes.
 * `specs` traz o texto das cópias das especializações (caminho → texto, ex.:
 * `specs/sdui.json`). Versão maior que a suportada: tenta ler como a versão
 * atual em modo somente leitura.
 */
export function deserialize(
  text: string,
  registry: ReadonlyMap<number, Migration> = defaultMigrations,
  specs: ReadonlyMap<string, string> = new Map(),
): DeserializeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'invalid-json' } };
  }
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: { code: 'invalid-schema', details: 'root is not an object' },
    };
  }

  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: { code: 'unsupported-version', version } };
  }

  let data: Record<string, unknown> = raw;
  let migratedFrom: number | null = null;
  const readOnly = version > SCHEMA_VERSION;
  if (readOnly) {
    data = { ...raw, schemaVersion: SCHEMA_VERSION };
  } else if (version < SCHEMA_VERSION) {
    const migrated = migrate(raw, version, registry);
    if (!migrated.ok) {
      return {
        ok: false,
        error: { code: 'missing-migration', from: migrated.missingFrom },
      };
    }
    data = migrated.data;
    migratedFrom = version;
  }

  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) {
    if (readOnly) return { ok: false, error: { code: 'unsupported-version', version } };
    return {
      ok: false,
      error: { code: 'invalid-schema', details: parsed.error.message },
    };
  }
  const { project, warnings } = attachSpecs(parsed.data, specs);
  const issues = validateProject(project);
  if (issues.length > 0) {
    return {
      ok: false,
      error: { code: 'invariant-violation', issues },
      repair: {
        ...repairProject(project, issues),
        readOnly,
        migratedFrom,
        specWarnings: warnings,
      },
    };
  }
  return { ok: true, project, readOnly, migratedFrom, specWarnings: warnings };
}
