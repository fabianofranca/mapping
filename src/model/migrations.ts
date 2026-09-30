import { SCHEMA_VERSION } from './types';

/** Converte um JSON da versão N para a versão N + 1. Recebe dados ainda não validados. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

function mapItems(
  value: unknown,
  update: (item: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? update(item as Record<string, unknown>)
      : item,
  );
}

/**
 * v1 → v2: imagens ganham `name: null`; anotações ganham `inherit: false` e
 * `parentAnnotationId: null`. Valores já presentes são preservados.
 */
export const migrateFrom1To2: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ name: null, ...i })),
  annotations: mapItems(data.annotations, (a) => ({
    inherit: false,
    parentAnnotationId: null,
    ...a,
  })),
});

/** Registro de migrações: a chave é a versão de origem. */
export const migrations: ReadonlyMap<number, Migration> = new Map([[1, migrateFrom1To2]]);

export type MigrationResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly missingFrom: number };

/** Aplica as migrações em sequência, de `from` até `target`. */
export function migrate(
  data: Record<string, unknown>,
  from: number,
  registry: ReadonlyMap<number, Migration> = migrations,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  let current = data;
  for (let version = from; version < target; version++) {
    const step = registry.get(version);
    if (!step) return { ok: false, missingFrom: version };
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return { ok: true, data: current };
}
