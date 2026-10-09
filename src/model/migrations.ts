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

/** v2 → v3: imagens ganham `markingColor: null` (borda das marcações na cor do tema). */
export const migrateFrom2To3: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ markingColor: null, ...i })),
});

/**
 * v3 → v4 (especializações): `specializations: []`; camadas ganham `spec: null`;
 * anotações ganham `type: null` e `values: null`; cada tupla ganha um `id`.
 */
export const migrateFrom3To4: Migration = (data) => ({
  ...data,
  specializations: data.specializations ?? [],
  layers: mapItems(data.layers, (l) => ({ ...l, spec: l.spec ?? null })),
  annotations: mapItems(data.annotations, (a) => ({
    ...a,
    type: a.type ?? null,
    values: a.values ?? null,
    entries: mapItems(a.entries, (e) => ({ id: crypto.randomUUID(), ...e })),
  })),
});

/** v4 → v5 (trava): imagens e marcações ganham `locked: false`. */
export const migrateFrom4To5: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ locked: false, ...i })),
  markings: mapItems(data.markings, (m) => ({ locked: false, ...m })),
});

/** v5 → v6 (revisão): `revision: 0`. Um valor já presente é preservado. */
export const migrateFrom5To6: Migration = (data) => ({ revision: 0, ...data });

/**
 * v6 → v7 (referências de código): `platformRepos: {}`. Um valor já presente é
 * preservado. Nada mais muda: o valor de um campo `codeRef` já é JSON livre em `values`.
 */
export const migrateFrom6To7: Migration = (data) => ({ platformRepos: {}, ...data });

/**
 * v7 → v8 (origem externa): imagens e marcações ganham `source: null`. Valores já
 * presentes são preservados.
 */
export const migrateFrom7To8: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ source: null, ...i })),
  markings: mapItems(data.markings, (m) => ({ source: null, ...m })),
});

/** Registro de migrações: a chave é a versão de origem. */
export const migrations: ReadonlyMap<number, Migration> = new Map([
  [1, migrateFrom1To2],
  [2, migrateFrom2To3],
  [3, migrateFrom3To4],
  [4, migrateFrom4To5],
  [5, migrateFrom5To6],
  [6, migrateFrom6To7],
  [7, migrateFrom7To8],
]);

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
