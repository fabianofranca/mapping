import { isRecord } from '../isRecord';
import type { ModelMessageTemplateCode } from '../messages';
import { iconsFileCodeForText } from '../messages/textLookup';
/**
 * Icon set of the library (component format 4, "faithful components" stage, CF7).
 *
 * The specialization (`formatVersion` 15) points, in `icons`, to ONE `.json` file of the
 * package (`"format": "mapping-icons"`): a default `viewBox` and the icons by name, each with
 * its SVG paths. The component's `icon` node (`{ "type": "icon", "name": … }`) reads the set
 * instead of a `$switch` with all the paths inside the component.
 *
 * Pure functions, no DOM: the file arrives already read (text or JSON).
 */

export const ICONS_FORMAT = 'mapping-icons';
/** The file's current version; version 1 (without `mirror`) is still accepted. */
export const ICONS_FORMAT_VERSION = 2;
export const ICONS_FORMAT_VERSIONS: readonly number[] = [1, 2];
/** Pattern of an icon's name. */
export const ICON_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
/** Box used when there is no set to supply the `viewBox` (unknown icon). */
export const DEFAULT_ICON_VIEWBOX: readonly [number, number] = [24, 24];

export type IconCap = 'butt' | 'round' | 'square';
export type IconJoin = 'miter' | 'round' | 'bevel';

/** A path of an icon, in the `viewBox` space. */
export interface IconPath {
  readonly d: string;
  /** `true` = the node's color; text = its own color; absent with `stroke` absent = the node's color. */
  readonly fill?: boolean | string;
  /** `true` = the node's color; text = its own color. Width in `viewBox` units (`width`). */
  readonly stroke?: boolean | string;
  readonly width?: number;
  readonly cap?: IconCap;
  readonly join?: IconJoin;
}

export interface IconDef {
  /** Overrides the set's `viewBox`. */
  readonly viewBox?: readonly [number, number];
  /** The icon flips horizontally in `rtl` (file formatVersion 2; default `false`). */
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
  /** Code and parameters of the catalog (`src/model/messages/`): the interface translates through them. */
  readonly code?: ModelMessageTemplateCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** The issue with the code and parameters that the catalog finds by the text. */
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
  if (!ok) out.push(issue(path, 'expected [width, height] with numbers greater than 0'));
}

function checkPaint(value: unknown, path: string, out: IconsIssue[]): void {
  if (typeof value === 'boolean') return;
  if (typeof value !== 'string' || value === '')
    out.push(issue(path, 'expected true, false or a color (text)'));
}

function checkOneOf(
  value: unknown,
  allowed: readonly string[],
  path: string,
  out: IconsIssue[],
): void {
  if (typeof value !== 'string' || !allowed.includes(value))
    out.push(issue(path, `expected one of: ${allowed.join(', ')}`));
}

const PATH_KEYS = ['d', 'fill', 'stroke', 'width', 'cap', 'join'];

function checkWidth(value: unknown, path: string, out: IconsIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    out.push(issue(path, 'expected a number greater than or equal to 0'));
}

function checkUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  out: IconsIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) out.push(issue(join(path, key), `unknown key: ${key}`));
}

/** `fill`, `stroke`, `width`, `cap` and `join` of a path (all optional). */
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
  if (!isRecord(value)) return void out.push(issue(path, 'expected object'));
  checkUnknownKeys(value, PATH_KEYS, path, out);
  if (typeof value.d !== 'string' || value.d.trim() === '')
    out.push(issue(join(path, 'd'), 'expected the path data (text)'));
  checkPathStyle(value, path, out);
}

function checkIcon(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!isRecord(value)) return void out.push(issue(path, 'expected object'));
  checkUnknownKeys(value, ['viewBox', 'paths', 'mirror'], path, out);
  if ('mirror' in value) {
    const at = join(path, 'mirror');
    if (version === 1) out.push(issue(at, 'only allowed with formatVersion 2'));
    else if (typeof value.mirror !== 'boolean')
      out.push(issue(at, 'expected true or false'));
  }
  if ('viewBox' in value) checkViewBox(value.viewBox, join(path, 'viewBox'), out);
  const at = join(path, 'paths');
  if (!Array.isArray(value.paths) || value.paths.length === 0)
    return void out.push(issue(at, 'expected a non-empty list of paths'));
  value.paths.forEach((p: unknown, i) => checkIconPath(p, join(at, i), out));
}

function checkHeader(input: Record<string, unknown>, out: IconsIssue[]): void {
  if (input.format !== ICONS_FORMAT)
    out.push(issue('format', `must be "${ICONS_FORMAT}"`));
  if (!ICONS_FORMAT_VERSIONS.includes(input.formatVersion as number))
    out.push(issue('formatVersion', 'must be 1 or 2'));
  if (!('viewBox' in input)) out.push(issue('viewBox', 'required field'));
  else checkViewBox(input.viewBox, 'viewBox', out);
  for (const key of Object.keys(input))
    if (!['format', 'formatVersion', 'viewBox', 'icons'].includes(key))
      out.push(issue(key, `unknown key: ${key}`));
}

function collectIssues(input: unknown): IconsIssue[] {
  if (!isRecord(input)) return [issue('', 'expected an object')];
  const out: IconsIssue[] = [];
  checkHeader(input, out);
  if (!isRecord(input.icons) || Object.keys(input.icons).length === 0) {
    out.push(issue('icons', 'expected an object with at least one icon'));
    return out;
  }
  for (const [name, icon] of Object.entries(input.icons)) {
    const at = join('icons', name);
    if (!ICON_NAME_PATTERN.test(name))
      out.push(issue(at, 'invalid name; use [a-z0-9][a-z0-9-_]*'));
    checkIcon(icon, at, input.formatVersion, out);
  }
  return out;
}

const formatIssue = (issue: IconsIssue): string =>
  issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`;

/** Validates the JSON of the `mapping-icons` file (does not throw). */
export function parseIconsFile(input: unknown): IconsParseResult {
  const issues = collectIssues(input);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  return { ok: true, set: input as IconSet };
}

/** Validates the text of a `mapping-icons` file (invalid JSON becomes an issue, without throwing). */
export function parseIconsText(text: string): IconsParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues: IconsIssue[] = [
      {
        path: '',
        message: `invalid JSON: ${message}`,
        code: 'library.invalidJson',
        params: { detail: message },
      },
    ];
    return { ok: false, issues, errors: issues.map(formatIssue) };
  }
  return parseIconsFile(json);
}

/** The icon and the `viewBox` that applies to it (the icon's, else the set's); `undefined` if it does not exist. */
export function resolveIcon(
  set: IconSet | undefined,
  name: string,
): { def: IconDef; viewBox: readonly [number, number] } | undefined {
  const def =
    set !== undefined && Object.hasOwn(set.icons, name) ? set.icons[name] : undefined;
  if (set === undefined || def === undefined) return undefined;
  return { def, viewBox: def.viewBox ?? set.viewBox };
}

/** An `icon` node of the component file: where it is and the `name` as written (literal or expression). */
export interface IconNodeRef {
  readonly path: string;
  readonly name: unknown;
}

/** The `icon` nodes of a template (through the frames' `children` and the `repeat`'s `template`). */
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
