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
 * v9 → v10 (container sem arquivo): imagens ganham `background: null` (a imagem com arquivo não
 * tem cor de fundo). Um valor já presente é preservado.
 */
export const migrateFrom9To10: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ background: null, ...i })),
});

/** O que a migração para o schema 11 descarta de uma entrada de `platformRepos`. */
export interface DiscardedUrlTemplate {
  readonly platform: string;
  readonly urlTemplate: string;
}

/**
 * Os `urlTemplate` não vazios de `platformRepos` de um JSON v10 ou anterior, na ordem do
 * objeto: o que a migração v10 → v11 descarta (o endereço dos arquivos passou a ser da
 * especialização). Lê o JSON cru, sem validar; sem `platformRepos` válido, lista vazia.
 */
export function discardedOnMigrationTo11(
  data: Record<string, unknown>,
): readonly DiscardedUrlTemplate[] {
  const repos = data.platformRepos;
  if (!isObject(repos)) return [];
  return Object.entries(repos).flatMap(([platform, repo]) => {
    const raw = isObject(repo) ? repo.urlTemplate : undefined;
    const urlTemplate = typeof raw === 'string' ? raw.trim() : '';
    return urlTemplate === '' ? [] : [{ platform, urlTemplate }];
  });
}

/**
 * v10 → v11 (código de instanciação): o repositório passa para a especialização
 * (`platforms[].repo`) e `platformRepos[x]` fica só com `localPath`. O `urlTemplate` é
 * descartado; a entrada que fica sem `localPath` (só tinha `urlTemplate`, ou `localPath`
 * nulo ou vazio) é removida. Sem `platformRepos` (ou algo que não seja objeto), nada muda.
 */
export const migrateFrom10To11: Migration = (data) => {
  const repos = data.platformRepos;
  if (!isObject(repos)) return data;
  const kept: Record<string, unknown> = {};
  for (const [platform, repo] of Object.entries(repos)) {
    const localPath = isObject(repo) ? repo.localPath : undefined;
    if (typeof localPath === 'string' && localPath.trim() !== '') {
      kept[platform] = { localPath };
    }
  }
  return { ...data, platformRepos: kept };
};

/**
 * v11 → v12 (container): a coleção `images` vira `containers` e a marcação troca `imageId` por
 * `containerId`. Só renomeia as chaves; nada é apagado nem muda de valor. Um valor já presente
 * na chave nova é preservado (a antiga é descartada).
 */
export const migrateFrom11To12: Migration = (data) => {
  const { images, ...rest } = data;
  return {
    ...rest,
    containers: data.containers ?? images,
    markings: mapItems(data.markings, (m) => {
      const { imageId, ...marking } = m;
      return { ...marking, containerId: marking.containerId ?? imageId };
    }),
  };
};

/** Uma anotação que tinha `inherit: true` e perdeu a herança na migração para o schema 13. */
export interface DiscardedInherit {
  readonly annotationId: string;
  readonly markingId: string;
  /** Nome da marcação, quando ela tem e o JSON a traz (a app mostra o id sem nome). */
  readonly markingName: string | null;
}

/**
 * As anotações com `inherit: true` de um JSON v12 ou anterior, na ordem do array: o que a
 * migração v12 → v13 deixa de herdar (a herança saiu do formato; a anotação continua na
 * própria marcação). Lê o JSON cru, sem validar; sem `annotations` válido, lista vazia.
 */
export function discardedOnMigrationTo13(
  data: Record<string, unknown>,
): readonly DiscardedInherit[] {
  if (!Array.isArray(data.annotations)) return [];
  const names = new Map<string, string | null>();
  if (Array.isArray(data.markings)) {
    for (const m of data.markings as unknown[]) {
      if (isObject(m) && typeof m.id === 'string') {
        names.set(m.id, typeof m.name === 'string' && m.name !== '' ? m.name : null);
      }
    }
  }
  return (data.annotations as unknown[]).flatMap((a) =>
    isObject(a) &&
    a.inherit === true &&
    typeof a.id === 'string' &&
    typeof a.markingId === 'string'
      ? [
          {
            annotationId: a.id,
            markingId: a.markingId,
            markingName: names.get(a.markingId) ?? null,
          },
        ]
      : [],
  );
}

/**
 * v12 → v13 (sem herança e com pertencimento por geometria): a anotação perde `inherit` ("vale
 * para todos os descendentes da marcação"); cada marcação ganha `floating: false` e cada
 * container `parentId: null`. Nenhuma anotação é apagada; cada uma continua na própria
 * marcação (quais tinham a herança ligada vai para o Diagnóstico, `discardedOnMigrationTo13`).
 * Não assenta: o `parentId` da marcação fica como está e o dos containers, `null` (nenhuma
 * marcação do canvas existe na v12); o pertencimento só se refaz na próxima operação de
 * geometria. Valores já presentes são preservados (um v13 da ME0 não tem os campos novos).
 */
export const migrateFrom12To13: Migration = (data) => ({
  ...data,
  containers: mapItems(data.containers, (c) => ({ parentId: null, ...c })),
  markings: mapItems(data.markings, (m) => ({ floating: false, ...m })),
  annotations: mapItems(data.annotations, (a) => {
    const { inherit, ...annotation } = a;
    void inherit;
    return annotation;
  }),
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
  [10, migrateFrom10To11],
  [11, migrateFrom11To12],
  [12, migrateFrom12To13],
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
