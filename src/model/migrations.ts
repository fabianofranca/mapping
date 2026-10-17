import { removedFieldKeys } from './spec';
import { SCHEMA_VERSION } from './types';

/** O que uma migração pode consultar além do próprio `mapping.json`. */
export interface MigrationContext {
  /** Texto das cópias das especializações (caminho em `specs/` → texto), como na leitura. */
  readonly specs: ReadonlyMap<string, string>;
}

const NO_CONTEXT: MigrationContext = { specs: new Map() };

/**
 * Converte um JSON da versão N para a versão N + 1. Recebe dados ainda não validados e o
 * contexto da leitura (as cópias de `specs/`, que a v8 → v9 consulta; sem ele, nenhuma).
 */
export type Migration = (
  data: Record<string, unknown>,
  context?: MigrationContext,
) => Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
 * preservado. Nada mais muda: o valor de um campo do tipo de código já é JSON livre em
 * `values`.
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

/**
 * v8 → v9 (etapa 9): os valores dos campos do tipo removido (`REMOVED_FIELD_TYPE`, onde a
 * instância foi implementada) saem de `values`. O tipo de cada campo vem da cópia da
 * especialização aplicada (`context.specs`, lida crua, sem validar): só saem as chaves que
 * ela declara com esse tipo, nos tipos dela. Sem a cópia (ausente, JSON ilegível ou de outro
 * id), não há como saber quais chaves eram desse tipo e os valores ficam; com a cópia de
 * volta, eles aparecem como "chave que não existe no tipo". Nada mais muda.
 */
export const migrateFrom8To9: Migration = (data, context = NO_CONTEXT) => {
  /** `specId` → `typeId` → chaves removidas. */
  const removed = new Map<string, Map<string, Set<string>>>();
  for (const ref of Array.isArray(data.specializations) ? data.specializations : []) {
    if (!isObject(ref) || typeof ref.id !== 'string' || typeof ref.file !== 'string') {
      continue;
    }
    const text = context.specs.get(ref.file);
    if (text === undefined) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      // Cópia ilegível: a leitura avisa (`SpecFileWarning`); os valores ficam.
      continue;
    }
    if (!isObject(raw) || raw.id !== ref.id) continue;
    const keys = removedFieldKeys(raw);
    if (keys.size > 0) removed.set(ref.id, keys);
  }
  if (removed.size === 0) return data;
  return {
    ...data,
    annotations: mapItems(data.annotations, (a) => {
      const { type, values } = a;
      if (!isObject(type) || !isObject(values)) return a;
      const specId = typeof type.specId === 'string' ? type.specId : '';
      const typeId = typeof type.typeId === 'string' ? type.typeId : '';
      const keys = removed.get(specId)?.get(typeId);
      if (!keys || !Object.keys(values).some((k) => keys.has(k))) return a;
      return {
        ...a,
        values: Object.fromEntries(Object.entries(values).filter(([k]) => !keys.has(k))),
      };
    }),
  };
};

/**
 * v9 → v10 (tela em branco): imagens ganham `background: null` (a imagem com arquivo não
 * tem cor de fundo). Um valor já presente é preservado.
 */
export const migrateFrom9To10: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ background: null, ...i })),
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
  [8, migrateFrom8To9],
  [9, migrateFrom9To10],
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
  context: MigrationContext = NO_CONTEXT,
): MigrationResult {
  let current = data;
  for (let version = from; version < target; version++) {
    const step = registry.get(version);
    if (!step) return { ok: false, missingFrom: version };
    current = { ...step(current, context), schemaVersion: version + 1 };
  }
  return { ok: true, data: current };
}
