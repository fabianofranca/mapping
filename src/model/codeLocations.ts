import { fail } from './errors';
import { memoByProject, projectIndex } from './projectIndex';
import type { SpecCode, SpecRepo } from './spec';
import type { PlatformRepo, PlatformRepos, Project } from './types';

// Código de instanciação das especializações (etapa 3b; schema v11): o `code` de um tipo diz
// com que código se cria uma instância dele em cada plataforma (`symbol` é o que se chama),
// e `path` é o arquivo que define o `symbol`, relativo à raiz do `repo` da especialização.
// Aqui ficam as plataformas declaradas pelas especializações aplicadas (cada uma com o `repo`
// da própria biblioteca), o link do arquivo de um tipo (pelo `urlTemplate` do `repo` da
// especialização dona do tipo), o caminho local dele (o projeto só guarda onde está o clone,
// `platformRepos[x].localPath`) e a busca de tipos por arquivo ou símbolo. O mapeamento não
// sabe nada sobre a solução. Funções puras, sem APIs de navegador: a app e o servidor MCP
// usam as mesmas.

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
  /**
   * As especializações aplicadas que declaram `repo` para a plataforma, na ordem de
   * aplicação. Cada uma declara o repositório da própria biblioteca e eles podem diferir.
   */
  readonly repos: readonly { readonly specId: string; readonly repo: SpecRepo }[];
}

/** Plataformas de todas as especializações aplicadas, sem repetir id, na ordem de aplicação. */
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

/** Plataforma declarada com esse id; `null` se nenhuma especialização aplicada a declara. */
export function findPlatform(p: Project, platformId: string): ProjectPlatform | null {
  return platformIndex(p).get(platformId) ?? null;
}

// ---------------------------------------------------------------------------
// Repositório (especialização) e clone local (projeto)

/**
 * `repo` que a especialização `specId` declara para a plataforma; `null` se ela não está
 * aplicada, não tem cópia válida, não declara a plataforma ou não tem `repo`.
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

/** Sobreposição local gravada para a plataforma; `null` se não houver. */
export function platformRepoOf(p: Project, platformId: string): PlatformRepo | null {
  return Object.hasOwn(p.platformRepos, platformId)
    ? (p.platformRepos[platformId] ?? null)
    : null;
}

/** O projeto informa onde está o clone local da plataforma (`localPath` preenchido). */
export function hasLocalPath(p: Project, platformId: string): boolean {
  return optionalText(platformRepoOf(p, platformId)?.localPath) !== null;
}

/** Propriedades a gravar. */
export interface PlatformRepoInput {
  readonly localPath: string | null;
}

function withoutRepo(repos: PlatformRepos, platformId: string): PlatformRepos {
  return Object.fromEntries(Object.entries(repos).filter(([id]) => id !== platformId));
}

/**
 * Informa onde está o clone local de uma plataforma declarada por alguma especialização
 * aplicada. Texto vazio ou `null` remove a entrada (o arquivo não guarda configuração vazia).
 */
export function setPlatformRepo(
  p: Project,
  platformId: string,
  input: PlatformRepoInput,
): Project {
  if (!findPlatform(p, platformId)) fail('unknown-platform', platformId);
  const current = platformRepoOf(p, platformId);
  const localPath = input.localPath === null ? null : normalizeLocalPath(input.localPath);
  if (localPath !== null && !isValidLocalPath(localPath)) {
    fail('invalid-local-path', localPath);
  }
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

/** Remove a sobreposição local da plataforma (declarada ou não). */
export function removePlatformRepo(p: Project, platformId: string): Project {
  if (!Object.hasOwn(p.platformRepos, platformId)) fail('not-found', platformId);
  return { ...p, platformRepos: withoutRepo(p.platformRepos, platformId) };
}

// ---------------------------------------------------------------------------
// Link e caminho local

/**
 * Onde um arquivo está: a especialização dona do tipo (que dá o `repo`), a plataforma (que
 * dá o clone local) e o caminho relativo à raiz do repositório (o `path` do `code`).
 */
export interface CodeLocation {
  readonly specId: string;
  readonly platform: string;
  readonly path: string | null;
}

/** Sem linha: tira o fragmento final `#…{line}` (se não tiver `{path}`); senão, `{line}` vira vazio. */
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
 * URL do arquivo, a partir do `urlTemplate` do `repo` que a especialização `location.specId`
 * declara para a plataforma; `null` sem `repo`, sem `urlTemplate` (ou inválido) ou sem
 * caminho válido. Nada do projeto entra no link.
 * - `{path}`: o caminho com cada segmento codificado (`encodeURIComponent`), mantendo as `/`;
 * - `{line}`: o caminho não tem linha, então o trecho a partir do último `#` que contém
 *   `{line}` é removido (ex: `…/{path}#L{line}` → `…/{path}`); se `{line}` não estiver num
 *   fragmento assim, vira vazio.
 */
export function codeLink(p: Project, location: CodeLocation): string | null {
  return repoLink(specPlatformRepo(p, location.specId, location.platform), location.path);
}

/** O mesmo link de `codeLink`, a partir de um `repo` de especialização (ex: de um pacote lido fora do projeto). */
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
 * Caminho do arquivo relativo à pasta do projeto: o `localPath` do clone da plataforma
 * (sobreposição do projeto, igual para qualquer especialização) mais o `path` (ex:
 * `../..` + `app/Main.kt` → `../../app/Main.kt`). `null` sem `localPath` (ou inválido) ou sem
 * caminho válido. Não confere se o arquivo existe.
 */
export function codeLocalPath(p: Project, location: CodeLocation): string | null {
  const localPath = optionalText(platformRepoOf(p, location.platform)?.localPath);
  if (localPath === null || !isValidLocalPath(localPath)) return null;
  if (location.path === null || !isValidCodePath(location.path)) return null;
  return joinRelative(localPath, location.path);
}

// ---------------------------------------------------------------------------
// Tipos com `code`

/** Uma entrada do `code` de um tipo de uma especialização aplicada. */
export interface TypeCodeEntry {
  readonly specId: string;
  readonly typeId: string;
  readonly platform: string;
  readonly code: SpecCode;
}

/**
 * Entradas do `code` de todos os tipos das especializações aplicadas (com cópia válida),
 * na ordem das especializações, das camadas, dos tipos e do `code`.
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
          })),
        ),
      ),
    ),
);

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

/** Onde está uma anotação do tipo encontrado (para montar a referência `mapping://`). */
export interface CodeAnnotationLocation {
  readonly containerId: string;
  readonly markingId: string;
  readonly annotationId: string;
}

/** Tipo cujo `code` casou com a busca, com as anotações dele no projeto. */
export interface CodeTypeMatch {
  readonly specId: string;
  readonly typeId: string;
  /** Plataformas do `code` do tipo que casaram, na ordem do `code`. */
  readonly code: readonly { readonly platform: string; readonly code: SpecCode }[];
  /** Anotações tipadas do tipo, na ordem do projeto (vazio se nenhuma o usa). */
  readonly annotations: readonly CodeAnnotationLocation[];
}

/**
 * Tipos das especializações aplicadas cujo `code` (em alguma plataforma) casa com a busca,
 * com as anotações desses tipos. `path` casa com `code.<plataforma>.path` por igualdade ou
 * por sufixo de segmentos inteiros (`CheckoutScreen.kt` casa com `app/…/CheckoutScreen.kt`,
 * `Screen.kt` não); `symbol`, com `code.<plataforma>.symbol` por igualdade. Com os dois, a
 * mesma entrada do `code` precisa casar com ambos; sem nenhum, a lista é vazia. Diferencia
 * maiúsculas de minúsculas.
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
    if (symbol !== null && entry.code.symbol.trim() !== symbol) continue;
    if (path !== null) {
      const own =
        entry.code.path === undefined ? null : normalizeCodePath(entry.code.path);
      if (own === null || !codePathMatches(own, path)) continue;
    }
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
    if (!matches.has(key) || !marking) continue;
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
