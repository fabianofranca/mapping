import { fail } from './errors';
import { memoByProject, projectIndex } from './projectIndex';
import { resolveCode } from './codeVariants';
import type { SpecCode, SpecField, SpecRepo } from './spec';
import type { DocRepo, PlatformRepo, Project } from './types';

// Instantiation code of specializations (stage 3b; schema v11): a type's `code` says
// which code creates an instance of it on each platform (`symbol` is what gets called),
// and `path` is the file that defines the `symbol`, relative to the root of the specialization's `repo`.
// This is where the platforms declared by the applied specializations live (each with the `repo`
// of its own library), the link to a type's file (through the `urlTemplate` of the `repo` of the
// specialization that owns the type), its local path (the project only stores where the clone is,
// `platformRepos[x].localPath`) and the search for types by file or symbol. The mapping knows
// nothing about the solution. Pure functions, no browser APIs: the app and the MCP server
// use the same ones.

// ---------------------------------------------------------------------------
// Paths

const DRIVE_RE = /^[A-Za-z]:/;

/** `true` if the text has a control character (line break, tab, NUL…). */
function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normalizes the path of a file in the repository: no leading or trailing spaces, `\` becomes
 * `/`, no leading `./` and no trailing `/`. `null` if it ends up empty.
 */
export function normalizeCodePath(path: string): string | null {
  let s = path.trim().replaceAll('\\', '/');
  while (s.startsWith('./')) s = s.slice(2);
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s === '' ? null : s;
}

/**
 * `true` for a path that is already normalized and relative to the repository root: non-empty
 * segments, no `.` or `..`, no leading `/` and no drive letter (`C:`).
 */
export function isValidCodePath(path: string): boolean {
  if (normalizeCodePath(path) !== path) return false;
  if (hasControlChar(path) || DRIVE_RE.test(path)) return false;
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** Normalizes the `localPath`: no leading or trailing spaces, `\` becomes `/`, no trailing `/`. */
export function normalizeLocalPath(path: string): string | null {
  let s = path.trim().replaceAll('\\', '/');
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s === '' ? null : s;
}

/** `true` for a `localPath` that is normalized and relative to the project folder (`..` is allowed). */
export function isValidLocalPath(path: string): boolean {
  if (normalizeLocalPath(path) !== path) return false;
  return !path.startsWith('/') && !DRIVE_RE.test(path) && !hasControlChar(path);
}

/** `true` for an `http(s)://…` `urlTemplate` with no spaces and with `{path}`. */
export function isValidUrlTemplate(template: string): boolean {
  return /^https?:\/\/\S+$/i.test(template) && template.includes('{path}');
}

/** Trimmed text; empty becomes `null`. */
function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Platforms

/** Platform declared by the specializations applied to the project. */
export interface ProjectPlatform {
  readonly id: string;
  readonly name: string;
  readonly language: string | null;
  /**
   * Applied specializations that declare it, in application order. With the same id,
   * it is the same platform: `name` and `language` come from the first (no error if they differ).
   */
  readonly specIds: readonly string[];
  /**
   * The applied specializations that declare `repo` for the platform, in
   * application order. Each declares the repository of its own library and they may differ.
   */
  readonly repos: readonly { readonly specId: string; readonly repo: SpecRepo }[];
}

/** Platforms of all applied specializations, without repeating ids, in application order. */
export const projectPlatforms: (p: Project) => readonly ProjectPlatform[] = memoByProject(
  (p) => {
    const byId = new Map<
      string,
      ProjectPlatform & { specIds: string[]; repos: { specId: string; repo: SpecRepo }[] }
    >();
    for (const s of p.specializations) {
      for (const platform of s.spec?.platforms ?? []) {
        let known = byId.get(platform.id);
        if (!known) {
          known = {
            id: platform.id,
            name: platform.name,
            language: platform.language ?? null,
            specIds: [],
            repos: [],
          };
          byId.set(platform.id, known);
        }
        if (!known.specIds.includes(s.id)) known.specIds.push(s.id);
        if (platform.repo && !known.repos.some((r) => r.specId === s.id)) {
          known.repos.push({ specId: s.id, repo: platform.repo });
        }
      }
    }
    return [...byId.values()];
  },
);

const platformIndex = memoByProject(
  (p) => new Map(projectPlatforms(p).map((platform) => [platform.id, platform])),
);

/** Platform declared with that id; `null` if no applied specialization declares it. */
export function findPlatform(p: Project, platformId: string): ProjectPlatform | null {
  return platformIndex(p).get(platformId) ?? null;
}

// ---------------------------------------------------------------------------
// Repository (specialization) and local clone (project)

/**
 * `repo` that the specialization `specId` declares for the platform; `null` if it is not
 * applied, has no valid copy, does not declare the platform or has no `repo`.
 */
export function specPlatformRepo(
  p: Project,
  specId: string,
  platformId: string,
): SpecRepo | null {
  return (
    findPlatform(p, platformId)?.repos.find((r) => r.specId === specId)?.repo ?? null
  );
}

/** Local override stored for the platform; `null` if there is none. */
export function platformRepoOf(p: Project, platformId: string): PlatformRepo | null {
  return Object.hasOwn(p.platformRepos, platformId)
    ? (p.platformRepos[platformId] ?? null)
    : null;
}

/** The project says where the platform's local clone is (`localPath` filled in). */
export function hasLocalPath(p: Project, platformId: string): boolean {
  return optionalText(platformRepoOf(p, platformId)?.localPath) !== null;
}

/** Properties to store. */
export interface PlatformRepoInput {
  readonly localPath: string | null;
}

/** Overrides without the `id` entry (platforms and document repositories). */
function withoutRepo<T>(
  repos: { readonly [id: string]: T },
  id: string,
): { readonly [id: string]: T } {
  return Object.fromEntries(Object.entries(repos).filter(([key]) => key !== id));
}

/** Local path normalized and validated; `null` = remove the entry. */
function checkedLocalPath(raw: string | null): string | null {
  const localPath = raw === null ? null : normalizeLocalPath(raw);
  if (localPath !== null && !isValidLocalPath(localPath)) {
    fail('invalid-local-path', localPath);
  }
  return localPath;
}

/**
 * Says where the local clone of a platform declared by some applied specialization
 * is. Empty text or `null` removes the entry (the file does not store empty configuration).
 */
export function setPlatformRepo(
  p: Project,
  platformId: string,
  input: PlatformRepoInput,
): Project {
  if (!findPlatform(p, platformId)) fail('unknown-platform', platformId);
  const current = platformRepoOf(p, platformId);
  const localPath = checkedLocalPath(input.localPath);
  if (localPath === null) {
    return current
      ? { ...p, platformRepos: withoutRepo(p.platformRepos, platformId) }
      : p;
  }
  if (current?.localPath === localPath) return p;
  return {
    ...p,
    platformRepos: { ...p.platformRepos, [platformId]: { localPath } },
  };
}

/** Removes the platform's local override (declared or not). */
export function removePlatformRepo(p: Project, platformId: string): Project {
  if (!Object.hasOwn(p.platformRepos, platformId)) fail('not-found', platformId);
  return { ...p, platformRepos: withoutRepo(p.platformRepos, platformId) };
}

// ---------------------------------------------------------------------------
// Link and local path

/**
 * Where a file is: the specialization that owns the type (which gives the `repo`), the platform (which
 * gives the local clone) and the path relative to the repository root (the `code`'s `path`).
 */
export interface CodeLocation {
  readonly specId: string;
  readonly platform: string;
  readonly path: string | null;
}

/**
 * Without a line: drops the trailing fragment `#…{line}` (if it has no `{path}`); in any case, any
 * remaining `{line}` (in the query, for example) becomes empty.
 */
function withoutLine(template: string): string {
  if (!template.includes('{line}')) return template;
  const hash = template.lastIndexOf('#');
  if (hash >= 0) {
    const fragment = template.slice(hash);
    if (fragment.includes('{line}') && !fragment.includes('{path}')) {
      return template.slice(0, hash).replaceAll('{line}', '');
    }
  }
  return template.replaceAll('{line}', '');
}

/**
 * URL of the file, from the `urlTemplate` of the `repo` that the specialization `location.specId`
 * declares for the platform; `null` without `repo`, without `urlTemplate` (or invalid) or without
 * a valid path. Nothing from the project goes into the link.
 * - `{path}`: the path with each segment encoded (`encodeURIComponent`), keeping the `/`;
 * - `{line}`: the path has no line, so the part from the last `#` that contains
 *   `{line}` is removed (e.g. `…/{path}#L{line}` → `…/{path}`); if `{line}` is not in such a
 *   fragment, it becomes empty.
 */
export function codeLink(p: Project, location: CodeLocation): string | null {
  return repoLink(specPlatformRepo(p, location.specId, location.platform), location.path);
}

/** The same link as `codeLink`, from a specialization `repo` (e.g. from a package read outside the project). */
export function repoLink(
  repo: SpecRepo | null | undefined,
  filePath: string | null,
): string | null {
  const template = optionalText(repo?.urlTemplate);
  if (template === null || !isValidUrlTemplate(template)) return null;
  if (filePath === null || !isValidCodePath(filePath)) return null;
  const path = filePath.split('/').map(encodeURIComponent).join('/');
  return withoutLine(template).replaceAll('{path}', path);
}

/** Joins relative paths with `/`, resolving `.` and the `..` that can be resolved. */
function joinRelative(base: string, path: string): string {
  const out: string[] = [];
  for (const segment of `${base}/${path}`.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && out.length > 0 && out.at(-1) !== '..') out.pop();
    else out.push(segment);
  }
  return out.length > 0 ? out.join('/') : '.';
}

/**
 * Path of the file relative to the project folder: the `localPath` of the platform's clone
 * (project override, the same for any specialization) plus the `path` (e.g.
 * `../..` + `app/Main.kt` → `../../app/Main.kt`). `null` without `localPath` (or invalid) or without
 * a valid path. Does not check whether the file exists.
 */
export function codeLocalPath(p: Project, location: CodeLocation): string | null {
  const localPath = optionalText(platformRepoOf(p, location.platform)?.localPath);
  if (localPath === null || !isValidLocalPath(localPath)) return null;
  if (location.path === null || !isValidCodePath(location.path)) return null;
  return joinRelative(localPath, location.path);
}

// ---------------------------------------------------------------------------
// Types with `code`

/** An entry of the `code` of a type of an applied specialization. */
export interface TypeCodeEntry {
  readonly specId: string;
  readonly typeId: string;
  readonly platform: string;
  readonly code: SpecCode;
  /** Fields of the type (`resolveCode` needs the `default` of the variant's field). */
  readonly fields: readonly SpecField[];
}

/**
 * Entries of the `code` of all types of the applied specializations (with a valid copy),
 * in the order of the specializations, layers, types and `code`.
 */
export const projectTypeCode: (p: Project) => readonly TypeCodeEntry[] = memoByProject(
  (p) =>
    p.specializations.flatMap((s) =>
      (s.spec?.layers ?? []).flatMap((layer) =>
        layer.annotationTypes.flatMap((type) =>
          Object.entries(type.code ?? {}).map(([platform, code]) => ({
            specId: s.id,
            typeId: type.id,
            platform,
            code,
            fields: type.fields,
          })),
        ),
      ),
    ),
);

// ---------------------------------------------------------------------------
// Search by file or symbol

export interface CodeQuery {
  /** Whole path or only the last segments (e.g. `CheckoutScreen.kt`). */
  readonly path?: string | null;
  readonly symbol?: string | null;
}

/** `true` if `query` is the whole path or a suffix of it by whole segments. */
export function codePathMatches(path: string, query: string): boolean {
  return path === query || path.endsWith(`/${query}`);
}

/** Where an annotation of the found type is (to build the `mapping://` reference). */
export interface CodeAnnotationLocation {
  readonly containerId: string | null;
  readonly markingId: string;
  readonly annotationId: string;
}

/** Type whose `code` matched the search, with its annotations in the project. */
export interface CodeTypeMatch {
  readonly specId: string;
  readonly typeId: string;
  /** Platforms of the type's `code` that matched, in the order of the `code`. */
  readonly code: readonly { readonly platform: string; readonly code: SpecCode }[];
  /** Typed annotations of the type, in project order (empty if none uses it). */
  readonly annotations: readonly CodeAnnotationLocation[];
}

/** `true` if the (already resolved) `code` matches the search; with both, both on the same entry. */
function codeMatches(
  code: SpecCode,
  path: string | null,
  symbol: string | null,
): boolean {
  if (symbol !== null && code.symbol.trim() !== symbol) return false;
  if (path !== null) {
    const own = code.path === undefined ? null : normalizeCodePath(code.path);
    if (own === null || !codePathMatches(own, path)) return false;
  }
  return true;
}

/**
 * The entry matches if the base (the `code` without `variants`) or some resolved case matches the search.
 */
function entryMatches(
  entry: TypeCodeEntry,
  path: string | null,
  symbol: string | null,
): boolean {
  const { variants } = entry.code;
  if (variants === undefined) return codeMatches(entry.code, path, symbol);
  if (codeMatches(resolveCode(entry.code, null, []), path, symbol)) return true;
  return Object.keys(variants.cases).some((value) =>
    codeMatches(
      resolveCode(entry.code, { [variants.field]: value }, entry.fields),
      path,
      symbol,
    ),
  );
}

/**
 * Types of the applied specializations whose `code` (on some platform) matches the search,
 * with the annotations of those types. `path` matches `code.<platform>.path` by equality or
 * by a suffix of whole segments (`CheckoutScreen.kt` matches `app/…/CheckoutScreen.kt`,
 * `Screen.kt` does not); `symbol`, with `code.<platform>.symbol` by equality. With both, the
 * same `code` entry must match both; with neither, the list is empty. Case
 * sensitive.
 *
 * With `variants` (formatVersion 9), the type matches if the base or some case matches, and the
 * `annotations` are only those whose resolved code (by their values) matches on a
 * platform that matched; the result's `code` stays the raw one. Without `variants`, all the
 * annotations of the type.
 */
export function findByCode(p: Project, query: CodeQuery): CodeTypeMatch[] {
  const rawPath = query.path ? normalizeCodePath(query.path) : null;
  const path = rawPath?.replace(/^\/+/, '') || null;
  const symbol = optionalText(query.symbol);
  if (path === null && symbol === null) return [];
  const typeKey = (specId: string, typeId: string) => `${specId}\u0000${typeId}`;
  const matches = new Map<
    string,
    { specId: string; typeId: string; code: TypeCodeEntry[] }
  >();
  for (const entry of projectTypeCode(p)) {
    if (!entryMatches(entry, path, symbol)) continue;
    const key = typeKey(entry.specId, entry.typeId);
    const known = matches.get(key);
    if (known) known.code.push(entry);
    else matches.set(key, { specId: entry.specId, typeId: entry.typeId, code: [entry] });
  }
  if (matches.size === 0) return [];
  const annotations = new Map<string, CodeAnnotationLocation[]>();
  const { markings } = projectIndex(p);
  for (const a of p.annotations) {
    if (!a.type) continue;
    const key = typeKey(a.type.specId, a.type.typeId);
    const marking = markings.get(a.markingId);
    const match = matches.get(key);
    if (!match || !marking) continue;
    const applies = match.code.some(
      (e) =>
        e.code.variants === undefined ||
        codeMatches(resolveCode(e.code, a.values, e.fields), path, symbol),
    );
    if (!applies) continue;
    const list = annotations.get(key) ?? [];
    list.push({
      containerId: marking.containerId,
      markingId: marking.id,
      annotationId: a.id,
    });
    annotations.set(key, list);
  }
  return [...matches.entries()].map(([key, match]) => ({
    specId: match.specId,
    typeId: match.typeId,
    code: match.code.map((e) => ({ platform: e.platform, code: e.code })),
    annotations: annotations.get(key) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Document repositories (schema v14)

/** Document repository declared by some applied specialization (`docRepos`). */
const declaredDocRepoIds = memoByProject(
  (p) => new Set(projectDocRepos(p).map((r) => r.id)),
);

/** Document repository declared by the specializations applied to the project. */
export interface ProjectDocRepo {
  readonly id: string;
  /** Applied specializations that declare it, in application order. */
  readonly specIds: readonly string[];
  /** The address (`url`, `urlTemplate`, `ref`) that each one declares for it. */
  readonly repos: readonly { readonly specId: string; readonly repo: SpecRepo }[];
}

/** Document repositories of all applied specializations, without repeating ids, in application order. */
export const projectDocRepos: (p: Project) => readonly ProjectDocRepo[] = memoByProject(
  (p) => {
    const byId = new Map<
      string,
      ProjectDocRepo & { specIds: string[]; repos: { specId: string; repo: SpecRepo }[] }
    >();
    for (const s of p.specializations) {
      for (const { id, ...repo } of s.spec?.docRepos ?? []) {
        let known = byId.get(id);
        if (!known) {
          known = { id, specIds: [], repos: [] };
          byId.set(id, known);
        }
        if (known.specIds.includes(s.id)) continue;
        known.specIds.push(s.id);
        known.repos.push({ specId: s.id, repo });
      }
    }
    return [...byId.values()];
  },
);

/** Local clone stored for the document repository; `null` if there is none. */
export function docRepoOf(p: Project, docRepoId: string): DocRepo | null {
  return Object.hasOwn(p.docRepos, docRepoId) ? (p.docRepos[docRepoId] ?? null) : null;
}

/**
 * Says where the local clone of a document repository declared by some
 * applied specialization is. Empty text or `null` removes the entry.
 */
export function setDocRepo(
  p: Project,
  docRepoId: string,
  input: { readonly localPath: string | null },
): Project {
  if (!declaredDocRepoIds(p).has(docRepoId)) fail('unknown-doc-repo', docRepoId);
  const current = docRepoOf(p, docRepoId);
  const localPath = checkedLocalPath(input.localPath);
  if (localPath === null) {
    return current ? { ...p, docRepos: withoutRepo(p.docRepos, docRepoId) } : p;
  }
  if (current?.localPath === localPath) return p;
  return { ...p, docRepos: { ...p.docRepos, [docRepoId]: { localPath } } };
}

/** Removes the local clone of the document repository (declared or not). */
export function removeDocRepo(p: Project, docRepoId: string): Project {
  if (!Object.hasOwn(p.docRepos, docRepoId)) fail('not-found', docRepoId);
  return { ...p, docRepos: withoutRepo(p.docRepos, docRepoId) };
}
