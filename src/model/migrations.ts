import { removedFieldKeys } from './spec';
import { isRecord } from './isRecord';
import { SCHEMA_VERSION } from './types';

/** What a migration can consult besides `mapping.json` itself. */
export interface MigrationContext {
  /** Text of the specialization copies (path in `specs/` → text), as read. */
  readonly specs: ReadonlyMap<string, string>;
}

const NO_CONTEXT: MigrationContext = { specs: new Map() };

/**
 * Converts a JSON of version N to version N + 1. Receives data not yet validated and the
 * reading context (the copies in `specs/`, which v8 → v9 consults; without it, none).
 */
export type Migration = (
  data: Record<string, unknown>,
  context?: MigrationContext,
) => Record<string, unknown>;

function mapItems(
  value: unknown,
  update: (item: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => (isRecord(item) ? update(item) : item));
}

/**
 * v1 → v2: images get `name: null`; annotations get `inherit: false` and
 * `parentAnnotationId: null`. Values already present are preserved.
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

/** v2 → v3: images get `markingColor: null` (marking border in the theme color). */
export const migrateFrom2To3: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ markingColor: null, ...i })),
});

/**
 * v3 → v4 (specializations): `specializations: []`; layers get `spec: null`;
 * annotations get `type: null` and `values: null`; each entry gets an `id`.
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

/** v4 → v5 (lock): images and markings get `locked: false`. */
export const migrateFrom4To5: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ locked: false, ...i })),
  markings: mapItems(data.markings, (m) => ({ locked: false, ...m })),
});

/** v5 → v6 (revision): `revision: 0`. A value already present is preserved. */
export const migrateFrom5To6: Migration = (data) => ({ revision: 0, ...data });

/**
 * v6 → v7 (code references): `platformRepos: {}`. A value already present is
 * preserved. Nothing else changes: the value of a code-type field is already free JSON in
 * `values`.
 */
export const migrateFrom6To7: Migration = (data) => ({ platformRepos: {}, ...data });

/**
 * v7 → v8 (external origin): images and markings get `source: null`. Values already
 * present are preserved.
 */
export const migrateFrom7To8: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ source: null, ...i })),
  markings: mapItems(data.markings, (m) => ({ source: null, ...m })),
});

/**
 * v8 → v9 (stage 9): the values of the fields of the removed type (`REMOVED_FIELD_TYPE`, where
 * the instance was implemented) leave `values`. Each field's type comes from the copy of the
 * applied specialization (`context.specs`, read raw, unvalidated): only the keys it declares
 * with that type, in its types, are removed. Without the copy (missing, unreadable JSON or of
 * another id), there is no way to know which keys were of that type and the values stay; with
 * the copy back, they appear as "key that does not exist in the type". Nothing else changes.
 */
export const migrateFrom8To9: Migration = (data, context = NO_CONTEXT) => {
  /** `specId` → `typeId` → removed keys. */
  const removed = new Map<string, Map<string, Set<string>>>();
  for (const ref of Array.isArray(data.specializations) ? data.specializations : []) {
    if (!isRecord(ref) || typeof ref.id !== 'string' || typeof ref.file !== 'string') {
      continue;
    }
    const text = context.specs.get(ref.file);
    if (text === undefined) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      // Unreadable copy: the reading warns (`SpecFileWarning`); the values stay.
      continue;
    }
    if (!isRecord(raw) || raw.id !== ref.id) continue;
    const keys = removedFieldKeys(raw);
    if (keys.size > 0) removed.set(ref.id, keys);
  }
  if (removed.size === 0) return data;
  return {
    ...data,
    annotations: mapItems(data.annotations, (a) => {
      const { type, values } = a;
      if (!isRecord(type) || !isRecord(values)) return a;
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
 * v9 → v10 (container without a file): images get `background: null` (an image with a file has
 * no background color). A value already present is preserved.
 */
export const migrateFrom9To10: Migration = (data) => ({
  ...data,
  images: mapItems(data.images, (i) => ({ background: null, ...i })),
});

/** What the migration to schema 11 discards from a `platformRepos` entry. */
export interface DiscardedUrlTemplate {
  readonly platform: string;
  readonly urlTemplate: string;
}

/**
 * The non-empty `urlTemplate`s of `platformRepos` of a v10 or earlier JSON, in object order:
 * what the v10 → v11 migration discards (the file address became the specialization's). Reads
 * the raw JSON, unvalidated; without a valid `platformRepos`, an empty list.
 */
export function discardedOnMigrationTo11(
  data: Record<string, unknown>,
): readonly DiscardedUrlTemplate[] {
  const repos = data.platformRepos;
  if (!isRecord(repos)) return [];
  return Object.entries(repos).flatMap(([platform, repo]) => {
    const raw = isRecord(repo) ? repo.urlTemplate : undefined;
    const urlTemplate = typeof raw === 'string' ? raw.trim() : '';
    return urlTemplate === '' ? [] : [{ platform, urlTemplate }];
  });
}

/**
 * v10 → v11 (instantiation code): the repository moves to the specialization
 * (`platforms[].repo`) and `platformRepos[x]` keeps only `localPath`. The `urlTemplate` is
 * discarded; an entry left without `localPath` (it only had `urlTemplate`, or a null or empty
 * `localPath`) is removed. Without `platformRepos` (or something that is not an object),
 * nothing changes.
 */
export const migrateFrom10To11: Migration = (data) => {
  const repos = data.platformRepos;
  if (!isRecord(repos)) return data;
  const kept: Record<string, unknown> = {};
  for (const [platform, repo] of Object.entries(repos)) {
    const localPath = isRecord(repo) ? repo.localPath : undefined;
    if (typeof localPath === 'string' && localPath.trim() !== '') {
      kept[platform] = { localPath };
    }
  }
  return { ...data, platformRepos: kept };
};

/**
 * v11 → v12 (container): the `images` collection becomes `containers` and the marking swaps
 * `imageId` for `containerId`. It only renames keys; nothing is deleted or changes value. A
 * value already present under the new key is preserved (the old one is discarded).
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

/** An annotation that had `inherit: true` and lost the inheritance in the migration to schema 13. */
export interface DiscardedInherit {
  readonly annotationId: string;
  readonly markingId: string;
  /** The marking's name, when it has one and the JSON carries it (the app shows the id without a name). */
  readonly markingName: string | null;
}

/**
 * The annotations with `inherit: true` of a v12 or earlier JSON, in array order: what the
 * v12 → v13 migration stops inheriting (inheritance left the format; the annotation stays on its
 * own marking). Reads the raw JSON, unvalidated; without a valid `annotations`, an empty list.
 */
export function discardedOnMigrationTo13(
  data: Record<string, unknown>,
): readonly DiscardedInherit[] {
  if (!Array.isArray(data.annotations)) return [];
  const names = new Map<string, string | null>();
  if (Array.isArray(data.markings)) {
    for (const m of data.markings as unknown[]) {
      if (isRecord(m) && typeof m.id === 'string') {
        names.set(m.id, typeof m.name === 'string' && m.name !== '' ? m.name : null);
      }
    }
  }
  return (data.annotations as unknown[]).flatMap((a) =>
    isRecord(a) &&
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
 * v12 → v13 (no inheritance and containment by geometry): the annotation loses `inherit`
 * ("applies to all descendants of the marking"); each marking gets `floating: false` and each
 * container `parentId: null`, and the project gets `arrows: []` (the arrows collection, ME4: the
 * migration never creates arrows). No annotation is deleted; each one stays on its own marking
 * (which ones had inheritance on goes to Diagnostics, `discardedOnMigrationTo13`). It does not
 * settle: the marking's `parentId` stays as it is and the containers', `null` (no canvas marking
 * exists in v12); containment is only redone on the next geometry operation. Values already
 * present are preserved (a v13 from ME0 does not have the new fields).
 */
export const migrateFrom12To13: Migration = (data) => ({
  ...data,
  arrows: data.arrows ?? [],
  containers: mapItems(data.containers, (c) => ({ parentId: null, ...c })),
  markings: mapItems(data.markings, (m) => ({ floating: false, ...m })),
  annotations: mapItems(data.annotations, (a) => {
    const { inherit, ...annotation } = a;
    void inherit;
    return annotation;
  }),
});

/**
 * v13 → v14 (roles on the link and external documents): every annotation gets `parentRole: null`
 * (existing links stay without a role; if an owner's type gains `childRoles`, the children show
 * `missing-role`) and the project gets `docRepos: {}`. Values already present are preserved.
 */
export const migrateFrom13To14: Migration = (data) => ({
  docRepos: {},
  ...data,
  annotations: mapItems(data.annotations, (a) => ({ parentRole: null, ...a })),
});

/**
 * v14 → v15 (link between annotations of the same layer): only the version changes. The file
 * format is the same; the new version exists so that an earlier app (which would refuse the link
 * in the same layer) opens the file read-only.
 */
export const migrateFrom14To15: Migration = (data) => data;

/**
 * v15 → v16 (perspectives): the project gets `project.id` (a new UUID; the identity keys what
 * stays in the browser, such as the open perspective and the "Only me" ones), `perspectives: []`
 * and `arrivals: []`. The migration never creates a perspective: the Main one is implicit and
 * shows everything, as before. Values already present are preserved (an already saved id is
 * never replaced).
 */
export const migrateFrom15To16: Migration = (data) => {
  const project = isRecord(data.project) ? data.project : {};
  return {
    ...data,
    project: { id: crypto.randomUUID(), ...project },
    perspectives: data.perspectives ?? [],
    arrivals: data.arrivals ?? [],
  };
};

/**
 * v16 → v17 (whole-annotation ref): only the version changes. The `ref` gains the
 * `{ annotationId }` format for the whole annotation; the new version exists so that an earlier
 * app opens the file read-only, instead of showing broken `ref`s.
 */
export const migrateFrom16To17: Migration = (data) => data;

/**
 * v17 → v18 (drawing mode): only the version changes. The project's and the container's
 * `drawingMode` is optional and absent means the first mode of each specialization; the new
 * version exists so that an earlier app opens the file read-only, instead of discarding the mode
 * on save.
 */
export const migrateFrom17To18: Migration = (data) => data;

/**
 * v18 → v19 (density): only the version changes. `containers[].density` is optional and absent
 * means 1; the new version exists so that an earlier app opens the file read-only, instead of
 * discarding the density on save.
 */
export const migrateFrom18To19: Migration = (data) => data;

/**
 * v19 → v20 (reading direction): only the version changes. `direction` (of the project and the
 * container) is optional and absent means `ltr`; the new version exists so that an earlier app
 * opens the file read-only, instead of discarding the direction on save.
 */
export const migrateFrom19To20: Migration = (data) => data;

/** Migration registry: the key is the source version. */
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
  [13, migrateFrom13To14],
  [14, migrateFrom14To15],
  [15, migrateFrom15To16],
  [16, migrateFrom16To17],
  [17, migrateFrom17To18],
  [18, migrateFrom18To19],
  [19, migrateFrom19To20],
]);

export type MigrationResult =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly missingFrom: number };

/** Applies the migrations in sequence, from `from` up to `target`. */
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
