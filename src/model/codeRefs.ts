import { fail } from './errors';
import { memoByProject, projectIndex } from './projectIndex';
import { isRecord } from './refs';
import type { Spec, SpecField } from './spec';
import { typeOfAnnotation } from './specLookup';
import type {
  CodeRefEntry,
  JsonValue,
  PlatformRepo,
  PlatformRepos,
  Project,
} from './types';

// Referências de código (etapa 3b, schema v7): plataformas declaradas pelas
// especializações aplicadas, repositório de cada plataforma (`platformRepos`),
// entradas dos campos `codeRef`, link para o repositório, caminho local, busca por
// arquivo ou símbolo e o aviso de plataforma sem repositório. Funções puras, sem
// APIs de navegador: a app e o servidor MCP usam as mesmas.

// ---------------------------------------------------------------------------
// Caminhos

const DRIVE_RE = /^[A-Za-z]:/;

/** `true` se o texto tem caractere de controle (quebra de linha, tab, NUL…). */
function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normaliza o caminho de um arquivo no repositório: sem espaços nas pontas, `\` vira
 * `/`, sem `./` no começo e sem `/` no fim. `null` se ficar vazio.
 */
export function normalizeCodePath(path: string): string | null {
  let s = path.trim().replaceAll('\\', '/');
  while (s.startsWith('./')) s = s.slice(2);
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s === '' ? null : s;
}

/**
 * `true` para um caminho já normalizado e relativo à raiz do repositório: segmentos
 * não vazios, sem `.` nem `..`, sem `/` no começo nem letra de unidade (`C:`).
 */
export function isValidCodePath(path: string): boolean {
  if (normalizeCodePath(path) !== path) return false;
  if (hasControlChar(path) || DRIVE_RE.test(path)) return false;
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** Normaliza o `localPath`: sem espaços nas pontas, `\` vira `/`, sem `/` no fim. */
export function normalizeLocalPath(path: string): string | null {
  let s = path.trim().replaceAll('\\', '/');
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s === '' ? null : s;
}

/** `true` para um `localPath` normalizado e relativo à pasta do projeto (`..` vale). */
export function isValidLocalPath(path: string): boolean {
  if (normalizeLocalPath(path) !== path) return false;
  return !path.startsWith('/') && !DRIVE_RE.test(path) && !hasControlChar(path);
}

/** `true` para um `urlTemplate` `http(s)://…` sem espaços e com `{path}`. */
export function isValidUrlTemplate(template: string): boolean {
  return /^https?:\/\/\S+$/i.test(template) && template.includes('{path}');
}

/** `true` para um número de linha válido: inteiro ≥ 1. */
export function isCodeLine(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/** Texto aparado; vazio vira `null`. */
function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Plataformas

/** Plataforma declarada pelas especializações aplicadas ao projeto. */
export interface ProjectPlatform {
  readonly id: string;
  readonly name: string;
  readonly language: string | null;
  /**
   * Especializações aplicadas que a declaram, na ordem de aplicação. Com o mesmo id,
   * é a mesma plataforma: `name` e `language` vêm da primeira (sem erro se divergirem).
   */
  readonly specIds: readonly string[];
}

/** Plataformas de todas as especializações aplicadas, sem repetir id, na ordem de aplicação. */
export const projectPlatforms: (p: Project) => readonly ProjectPlatform[] = memoByProject(
  (p) => {
    const byId = new Map<string, ProjectPlatform & { specIds: string[] }>();
    for (const s of p.specializations) {
      for (const platform of s.spec?.platforms ?? []) {
        const known = byId.get(platform.id);
        if (known) {
          if (!known.specIds.includes(s.id)) known.specIds.push(s.id);
          continue;
        }
        byId.set(platform.id, {
          id: platform.id,
          name: platform.name,
          language: platform.language ?? null,
          specIds: [s.id],
        });
      }
    }
    return [...byId.values()];
  },
);

const platformIndex = memoByProject(
  (p) => new Map(projectPlatforms(p).map((platform) => [platform.id, platform])),
);

/** Plataforma declarada com esse id; `null` se nenhuma especialização aplicada a declara. */
export function findPlatform(p: Project, platformId: string): ProjectPlatform | null {
  return platformIndex(p).get(platformId) ?? null;
}

/**
 * Plataformas permitidas num campo `codeRef`: o `platforms` do campo ou, sem ele, todas
 * as declaradas pela especialização do tipo.
 */
export function codeRefPlatforms(spec: Spec, field: SpecField): string[] {
  const declared = (spec.platforms ?? []).map((platform) => platform.id);
  if (field.type !== 'codeRef' || !field.platforms) return declared;
  return field.platforms.filter((id) => declared.includes(id));
}

// ---------------------------------------------------------------------------
// Repositórios por plataforma

/** Configuração gravada para a plataforma (mesmo vazia); `null` se não houver. */
export function platformRepoOf(p: Project, platformId: string): PlatformRepo | null {
  return Object.hasOwn(p.platformRepos, platformId)
    ? (p.platformRepos[platformId] ?? null)
    : null;
}

/** Há repositório configurado: `urlTemplate` ou `localPath` preenchido. */
export function hasPlatformRepo(p: Project, platformId: string): boolean {
  const repo = platformRepoOf(p, platformId);
  return (
    optionalText(repo?.urlTemplate) !== null || optionalText(repo?.localPath) !== null
  );
}

/** Propriedades a gravar; as ausentes mantêm o valor atual. */
export interface PlatformRepoInput {
  readonly urlTemplate?: string | null;
  readonly localPath?: string | null;
}

function withoutRepo(repos: PlatformRepos, platformId: string): PlatformRepos {
  return Object.fromEntries(Object.entries(repos).filter(([id]) => id !== platformId));
}

/**
 * Configura o repositório de uma plataforma declarada por alguma especialização aplicada.
 * Propriedades ausentes mantêm o valor atual; texto vazio vira `null`. Sem `urlTemplate`
 * nem `localPath`, a configuração é removida (o arquivo não guarda configuração vazia).
 */
export function setPlatformRepo(
  p: Project,
  platformId: string,
  input: PlatformRepoInput,
): Project {
  if (!findPlatform(p, platformId)) fail('unknown-platform', platformId);
  const current = platformRepoOf(p, platformId);
  // Só as propriedades informadas são validadas: um valor antigo editado à mão não
  // impede de alterar a outra.
  let urlTemplate = optionalText(current?.urlTemplate);
  if (input.urlTemplate !== undefined) {
    urlTemplate = optionalText(input.urlTemplate);
    if (urlTemplate !== null && !isValidUrlTemplate(urlTemplate)) {
      fail('invalid-url-template', urlTemplate);
    }
  }
  let localPath = optionalText(current?.localPath);
  if (input.localPath !== undefined) {
    localPath = input.localPath === null ? null : normalizeLocalPath(input.localPath);
    if (localPath !== null && !isValidLocalPath(localPath)) {
      fail('invalid-local-path', localPath);
    }
  }
  if (urlTemplate === null && localPath === null) {
    return current
      ? { ...p, platformRepos: withoutRepo(p.platformRepos, platformId) }
      : p;
  }
  if (current?.urlTemplate === urlTemplate && current.localPath === localPath) return p;
  return {
    ...p,
    platformRepos: { ...p.platformRepos, [platformId]: { urlTemplate, localPath } },
  };
}

/** Remove a configuração do repositório da plataforma (declarada ou não). */
export function removePlatformRepo(p: Project, platformId: string): Project {
  if (!Object.hasOwn(p.platformRepos, platformId)) fail('not-found', platformId);
  return { ...p, platformRepos: withoutRepo(p.platformRepos, platformId) };
}

// ---------------------------------------------------------------------------
// Entradas de `codeRef`

/** Chaves de uma entrada, na ordem gravada. */
export const CODE_REF_KEYS = ['_id', 'platform', 'path', 'symbol', 'line'] as const;

/**
 * Lê uma entrada de `codeRef`; `null` se não tiver o formato: objeto com `_id` e
 * `platform` (texto não vazio), `path` e `symbol` texto ou `null`, `line` inteiro ≥ 1
 * ou `null`. Propriedades opcionais ausentes e texto vazio valem `null`.
 */
export function parseCodeRefEntry(value: JsonValue | undefined): CodeRefEntry | null {
  if (!isRecord(value)) return null;
  const { _id, platform, path = null, symbol = null, line = null } = value;
  if (typeof _id !== 'string' || _id === '') return null;
  if (typeof platform !== 'string' || platform === '') return null;
  if (path !== null && typeof path !== 'string') return null;
  if (symbol !== null && typeof symbol !== 'string') return null;
  if (line !== null && !isCodeLine(line)) return null;
  return {
    _id,
    platform,
    path: path === '' ? null : path,
    symbol: symbol === '' ? null : symbol,
    line,
  };
}

/** Entradas bem formadas de um valor de `codeRef` (as malformadas ficam de fora, como em `tableRows`). */
export function codeRefEntries(value: JsonValue | undefined): CodeRefEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: JsonValue) => {
    const entry = parseCodeRefEntry(item);
    return entry ? [entry] : [];
  });
}

/** Onde uma entrada de `codeRef` está no projeto (para montar a referência `mapping://`). */
export interface CodeRefLocation {
  readonly imageId: string;
  readonly markingId: string;
  readonly annotationId: string;
  /** Campo `codeRef` da anotação. */
  readonly key: string;
  readonly entry: CodeRefEntry;
}

/**
 * Todas as entradas de `codeRef` do projeto, na ordem do projeto (anotação, campo,
 * entrada): só os campos `codeRef` de tipos existentes e as entradas bem formadas.
 */
export const projectCodeRefs: (p: Project) => readonly CodeRefLocation[] = memoByProject(
  (p) => {
    const index = projectIndex(p);
    const result: CodeRefLocation[] = [];
    for (const a of p.annotations) {
      if (!a.values) continue;
      const type = typeOfAnnotation(p, a)?.type;
      const marking = index.markings.get(a.markingId);
      if (!type || !marking) continue;
      for (const field of type.fields) {
        if (field.type !== 'codeRef') continue;
        for (const entry of codeRefEntries(a.values[field.key])) {
          result.push({
            imageId: marking.imageId,
            markingId: marking.id,
            annotationId: a.id,
            key: field.key,
            entry,
          });
        }
      }
    }
    return result;
  },
);

// ---------------------------------------------------------------------------
// Link e caminho local

/** Sem `line`: tira o fragmento final `#…{line}` (se não tiver `{path}`); senão, `{line}` vira vazio. */
function withoutLine(template: string): string {
  if (!template.includes('{line}')) return template;
  const hash = template.lastIndexOf('#');
  if (hash >= 0) {
    const fragment = template.slice(hash);
    if (fragment.includes('{line}') && !fragment.includes('{path}')) {
      return template.slice(0, hash);
    }
  }
  return template.replaceAll('{line}', '');
}

/**
 * URL da entrada no repositório da plataforma, a partir do `urlTemplate`; `null` sem
 * repositório, sem `urlTemplate` (ou inválido) ou sem caminho válido.
 * - `{path}`: o caminho com cada segmento codificado (`encodeURIComponent`), mantendo as `/`;
 * - `{line}`: a linha; sem linha, o trecho a partir do último `#` que contém `{line}` é
 *   removido (ex: `…/{path}#L{line}` → `…/{path}`); se `{line}` não estiver num fragmento
 *   assim, vira vazio.
 */
export function codeLink(
  p: Project,
  entry: Pick<CodeRefEntry, 'platform' | 'path' | 'line'>,
): string | null {
  const template = optionalText(platformRepoOf(p, entry.platform)?.urlTemplate);
  if (template === null || !isValidUrlTemplate(template)) return null;
  if (entry.path === null || !isValidCodePath(entry.path)) return null;
  const path = entry.path.split('/').map(encodeURIComponent).join('/');
  const withLine = isCodeLine(entry.line)
    ? template.replaceAll('{line}', String(entry.line))
    : withoutLine(template);
  return withLine.replaceAll('{path}', path);
}

/** Junta caminhos relativos com `/`, resolvendo `.` e os `..` que dá para resolver. */
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
 * Caminho do arquivo relativo à pasta do projeto: o `localPath` da plataforma mais o
 * `path` da entrada (ex: `../..` + `app/Main.kt` → `../../app/Main.kt`). `null` sem
 * `localPath` (ou inválido) ou sem caminho válido. Não confere se o arquivo existe.
 */
export function codeLocalPath(
  p: Project,
  entry: Pick<CodeRefEntry, 'platform' | 'path'>,
): string | null {
  const localPath = optionalText(platformRepoOf(p, entry.platform)?.localPath);
  if (localPath === null || !isValidLocalPath(localPath)) return null;
  if (entry.path === null || !isValidCodePath(entry.path)) return null;
  return joinRelative(localPath, entry.path);
}

// ---------------------------------------------------------------------------
// Busca por arquivo ou símbolo

export interface CodeQuery {
  /** Caminho inteiro ou só os últimos segmentos (ex: `CheckoutScreen.kt`). */
  readonly path?: string | null;
  readonly symbol?: string | null;
}

/** `true` se `query` é o caminho inteiro ou um sufixo dele por segmentos inteiros. */
export function codePathMatches(path: string, query: string): boolean {
  return path === query || path.endsWith(`/${query}`);
}

/**
 * Entradas de `codeRef` que casam com a busca, na ordem do projeto. `path` casa por
 * igualdade ou por sufixo de segmentos inteiros (`CheckoutScreen.kt` casa com
 * `app/…/CheckoutScreen.kt`, `Screen.kt` não); `symbol`, por igualdade. Com os dois,
 * a entrada precisa casar com ambos; sem nenhum, a lista é vazia. Diferencia
 * maiúsculas de minúsculas.
 */
export function findByCode(p: Project, query: CodeQuery): CodeRefLocation[] {
  const rawPath = query.path ? normalizeCodePath(query.path) : null;
  const path = rawPath?.replace(/^\/+/, '') || null;
  const symbol = optionalText(query.symbol);
  if (path === null && symbol === null) return [];
  return projectCodeRefs(p).filter(({ entry }) => {
    if (symbol !== null && entry.symbol?.trim() !== symbol) return false;
    if (path === null) return true;
    const entryPath = entry.path === null ? null : normalizeCodePath(entry.path);
    return entryPath !== null && codePathMatches(entryPath, path);
  });
}

// ---------------------------------------------------------------------------
// Aviso de repositório ausente

/** Aviso (não é pendência): plataforma usada em `codeRef` sem repositório configurado. */
export interface PlatformRepoWarning {
  readonly code: 'missing-repo';
  readonly platform: string;
  /** Quantas entradas de `codeRef` usam a plataforma. */
  readonly entries: number;
}

/**
 * Avisos de repositório ausente, na ordem de `projectPlatforms`: plataformas declaradas
 * usadas por alguma entrada de `codeRef` e sem `urlTemplate` nem `localPath`. Entradas
 * de plataforma não declarada já são pendências e não entram aqui.
 */
export const platformRepoWarnings: (p: Project) => readonly PlatformRepoWarning[] =
  memoByProject((p) => {
    const counts = new Map<string, number>();
    for (const { entry } of projectCodeRefs(p)) {
      counts.set(entry.platform, (counts.get(entry.platform) ?? 0) + 1);
    }
    return projectPlatforms(p).flatMap((platform): PlatformRepoWarning[] => {
      const entries = counts.get(platform.id) ?? 0;
      if (entries === 0 || hasPlatformRepo(p, platform.id)) return [];
      return [{ code: 'missing-repo', platform: platform.id, entries }];
    });
  });
