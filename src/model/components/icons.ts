import { isRecord } from '../isRecord';
import type { ModelMessageTemplateCode } from '../messages';
import { iconsFileCodeForText } from '../messages/textLookup';
/**
 * Conjunto de ícones da biblioteca (formato do componente 4, etapa "componentes fiéis", CF7).
 *
 * A especialização (`formatVersion` 15) aponta, em `icons`, para UM arquivo `.json` do pacote
 * (`"format": "mapping-icons"`): um `viewBox` padrão e os ícones por nome, cada um com seus
 * caminhos SVG. O nó `icon` do componente (`{ "type": "icon", "name": … }`) lê o conjunto no
 * lugar de um `$switch` com todos os caminhos dentro do componente.
 *
 * Funções puras, sem DOM: o arquivo chega já lido (texto ou JSON).
 */

export const ICONS_FORMAT = 'mapping-icons';
/** A versão atual do arquivo; a 1 (sem `mirror`) continua aceita. */
export const ICONS_FORMAT_VERSION = 2;
export const ICONS_FORMAT_VERSIONS: readonly number[] = [1, 2];
/** Padrão do nome de um ícone. */
export const ICON_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
/** Caixa usada quando não há conjunto para dizer o `viewBox` (ícone desconhecido). */
export const DEFAULT_ICON_VIEWBOX: readonly [number, number] = [24, 24];

export type IconCap = 'butt' | 'round' | 'square';
export type IconJoin = 'miter' | 'round' | 'bevel';

/** Um caminho de um ícone, no espaço do `viewBox`. */
export interface IconPath {
  readonly d: string;
  /** `true` = cor do nó; texto = cor própria; ausente com `stroke` ausente = cor do nó. */
  readonly fill?: boolean | string;
  /** `true` = cor do nó; texto = cor própria. Largura em unidades do `viewBox` (`width`). */
  readonly stroke?: boolean | string;
  readonly width?: number;
  readonly cap?: IconCap;
  readonly join?: IconJoin;
}

export interface IconDef {
  /** Sobrepõe o `viewBox` do conjunto. */
  readonly viewBox?: readonly [number, number];
  /** O ícone vira na horizontal em `rtl` (formatVersion 2 do arquivo; padrão `false`). */
  readonly mirror?: boolean;
  readonly paths: readonly IconPath[];
}

export interface IconSet {
  readonly viewBox: readonly [number, number];
  readonly icons: Readonly<Record<string, IconDef>>;
}

export interface IconsIssue {
  readonly path: string;
  readonly message: string;
  /** Código e parâmetros do catálogo (`src/model/messages/`): a interface traduz por eles. */
  readonly code?: ModelMessageTemplateCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** O problema com o código e os parâmetros que o catálogo acha pelo texto. */
function issue(path: string, message: string): IconsIssue {
  const hit = iconsFileCodeForText(message);
  if (hit === undefined) return { path, message };
  return hit.params === undefined
    ? { path, message, code: hit.code }
    : { path, message, code: hit.code, params: hit.params };
}

export type IconsParseResult =
  { ok: true; set: IconSet } | { ok: false; issues: IconsIssue[]; errors: string[] };

const join = (path: string, key: string | number): string =>
  path === ''
    ? String(key)
    : typeof key === 'number'
      ? `${path}[${key}]`
      : `${path}.${key}`;

function checkViewBox(value: unknown, path: string, out: IconsIssue[]): void {
  const ok =
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (!ok) out.push(issue(path, 'esperava [largura, altura] com números maiores que 0'));
}

function checkPaint(value: unknown, path: string, out: IconsIssue[]): void {
  if (typeof value === 'boolean') return;
  if (typeof value !== 'string' || value === '')
    out.push(issue(path, 'esperava true, false ou uma cor (texto)'));
}

function checkOneOf(
  value: unknown,
  allowed: readonly string[],
  path: string,
  out: IconsIssue[],
): void {
  if (typeof value !== 'string' || !allowed.includes(value))
    out.push(issue(path, `esperava um de: ${allowed.join(', ')}`));
}

const PATH_KEYS = ['d', 'fill', 'stroke', 'width', 'cap', 'join'];

function checkWidth(value: unknown, path: string, out: IconsIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    out.push(issue(path, 'esperava número maior ou igual a 0'));
}

function checkUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  out: IconsIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      out.push(issue(join(path, key), `chave desconhecida: ${key}`));
}

/** `fill`, `stroke`, `width`, `cap` e `join` de um caminho (todos opcionais). */
function checkPathStyle(
  value: Record<string, unknown>,
  path: string,
  out: IconsIssue[],
): void {
  if ('fill' in value) checkPaint(value.fill, join(path, 'fill'), out);
  if ('stroke' in value) checkPaint(value.stroke, join(path, 'stroke'), out);
  if ('width' in value) checkWidth(value.width, join(path, 'width'), out);
  if ('cap' in value)
    checkOneOf(value.cap, ['butt', 'round', 'square'], join(path, 'cap'), out);
  if ('join' in value)
    checkOneOf(value.join, ['miter', 'round', 'bevel'], join(path, 'join'), out);
}

function checkIconPath(value: unknown, path: string, out: IconsIssue[]): void {
  if (!isRecord(value)) return void out.push(issue(path, 'esperava objeto'));
  checkUnknownKeys(value, PATH_KEYS, path, out);
  if (typeof value.d !== 'string' || value.d.trim() === '')
    out.push(issue(join(path, 'd'), 'esperava os dados do caminho (texto)'));
  checkPathStyle(value, path, out);
}

function checkIcon(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!isRecord(value)) return void out.push(issue(path, 'esperava objeto'));
  checkUnknownKeys(value, ['viewBox', 'paths', 'mirror'], path, out);
  if ('mirror' in value) {
    const at = join(path, 'mirror');
    if (version === 1) out.push(issue(at, 'só é permitido com formatVersion 2'));
    else if (typeof value.mirror !== 'boolean')
      out.push(issue(at, 'esperava true ou false'));
  }
  if ('viewBox' in value) checkViewBox(value.viewBox, join(path, 'viewBox'), out);
  const at = join(path, 'paths');
  if (!Array.isArray(value.paths) || value.paths.length === 0)
    return void out.push(issue(at, 'esperava lista não vazia de caminhos'));
  value.paths.forEach((p: unknown, i) => checkIconPath(p, join(at, i), out));
}

function checkHeader(input: Record<string, unknown>, out: IconsIssue[]): void {
  if (input.format !== ICONS_FORMAT)
    out.push(issue('format', `deve ser "${ICONS_FORMAT}"`));
  if (!ICONS_FORMAT_VERSIONS.includes(input.formatVersion as number))
    out.push(issue('formatVersion', 'deve ser 1 ou 2'));
  if (!('viewBox' in input)) out.push(issue('viewBox', 'campo obrigatório'));
  else checkViewBox(input.viewBox, 'viewBox', out);
  for (const key of Object.keys(input))
    if (!['format', 'formatVersion', 'viewBox', 'icons'].includes(key))
      out.push(issue(key, `chave desconhecida: ${key}`));
}

function collectIssues(input: unknown): IconsIssue[] {
  if (!isRecord(input)) return [issue('', 'esperava um objeto')];
  const out: IconsIssue[] = [];
  checkHeader(input, out);
  if (!isRecord(input.icons) || Object.keys(input.icons).length === 0) {
    out.push(issue('icons', 'esperava um objeto com ao menos um ícone'));
    return out;
  }
  for (const [name, icon] of Object.entries(input.icons)) {
    const at = join('icons', name);
    if (!ICON_NAME_PATTERN.test(name))
      out.push(issue(at, 'nome inválido; use [a-z0-9][a-z0-9-_]*'));
    checkIcon(icon, at, input.formatVersion, out);
  }
  return out;
}

const formatIssue = (issue: IconsIssue): string =>
  issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`;

/** Valida o JSON do arquivo `mapping-icons` (não lança). */
export function parseIconsFile(input: unknown): IconsParseResult {
  const issues = collectIssues(input);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  return { ok: true, set: input as IconSet };
}

/** Valida o texto de um arquivo `mapping-icons` (JSON inválido vira um problema, sem lançar). */
export function parseIconsText(text: string): IconsParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues: IconsIssue[] = [
      {
        path: '',
        message: `JSON inválido: ${message}`,
        code: 'library.invalidJson',
        params: { detail: message },
      },
    ];
    return { ok: false, issues, errors: issues.map(formatIssue) };
  }
  return parseIconsFile(json);
}

/** O ícone e o `viewBox` que vale para ele (o do ícone, senão o do conjunto); `undefined` se não existe. */
export function resolveIcon(
  set: IconSet | undefined,
  name: string,
): { def: IconDef; viewBox: readonly [number, number] } | undefined {
  const def =
    set !== undefined && Object.hasOwn(set.icons, name) ? set.icons[name] : undefined;
  if (set === undefined || def === undefined) return undefined;
  return { def, viewBox: def.viewBox ?? set.viewBox };
}

/** Um nó `icon` do arquivo do componente: onde está e o `name` como foi escrito (literal ou expressão). */
export interface IconNodeRef {
  readonly path: string;
  readonly name: unknown;
}

/** Os nós `icon` de um template (pelos `children` dos quadros e `template` do `repeat`). */
export function iconNodes(template: unknown, path = 'template'): IconNodeRef[] {
  if (!isRecord(template)) return [];
  const out: IconNodeRef[] = [];
  if (template.type === 'icon')
    out.push({ path: join(path, 'name'), name: template.name });
  if (Array.isArray(template.children))
    template.children.forEach((child: unknown, i) =>
      out.push(...iconNodes(child, join(join(path, 'children'), i))),
    );
  if (template.type === 'repeat')
    out.push(...iconNodes(template.template, join(path, 'template')));
  return out;
}
