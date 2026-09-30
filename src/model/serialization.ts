import { validateProject, type InvariantIssue } from './invariants';
import { migrate, migrations as defaultMigrations, type Migration } from './migrations';
import { projectSchema } from './schema';
import { SCHEMA_VERSION, type Project } from './types';

/**
 * Gera o texto do `mapping.json`: chaves sempre na mesma ordem, indentação de
 * 2 espaços e quebra de linha no final. Serializar o resultado de
 * `deserialize` produz exatamente o mesmo texto (round-trip sem perdas).
 */
export function serialize(p: Project): string {
  const canonical: Project = {
    schemaVersion: p.schemaVersion,
    app: p.app,
    coordinateSystem: p.coordinateSystem,
    project: {
      name: p.project.name,
      createdAt: p.project.createdAt,
      updatedAt: p.project.updatedAt,
    },
    layers: p.layers.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    images: p.images.map((i) => ({
      id: i.id,
      name: i.name,
      file: i.file,
      width: i.width,
      height: i.height,
      placement: { x: i.placement.x, y: i.placement.y, scale: i.placement.scale },
      markingColor: i.markingColor,
    })),
    markings: p.markings.map((m) => ({
      id: m.id,
      imageId: m.imageId,
      parentId: m.parentId,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      needsReview: m.needsReview,
    })),
    annotations: p.annotations.map((a) => ({
      id: a.id,
      markingId: a.markingId,
      layerId: a.layerId,
      name: a.name,
      inherit: a.inherit,
      parentAnnotationId: a.parentAnnotationId,
      entries: a.entries.map((e) => ({ key: e.key, value: e.value })),
    })),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
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
    }
  | { readonly ok: false; readonly error: DeserializeError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lê o texto do `mapping.json`: JSON → migrações → schema zod → invariantes.
 * Versão maior que a suportada: tenta ler como a versão atual em modo somente leitura.
 */
export function deserialize(
  text: string,
  registry: ReadonlyMap<number, Migration> = defaultMigrations,
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
  const issues = validateProject(parsed.data);
  if (issues.length > 0) {
    return { ok: false, error: { code: 'invariant-violation', issues } };
  }
  return { ok: true, project: parsed.data, readOnly, migratedFrom };
}
