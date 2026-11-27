import { isRecord } from '../isRecord';
import type { ModelMessageTemplateCode } from '../messages';
import { componentCodeForText, iconsFileCodeForText } from '../messages/textLookup';
import { isFormatColor } from './tokens';
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
/**
 * The file's current version; versions 1 (without `mirror`), 2 (without `fillRule`) and 3
 * (without the gradient `fill` and the `clip`) are still accepted.
 */
export const ICONS_FORMAT_VERSION = 4;
export const ICONS_FORMAT_VERSIONS: readonly number[] = [1, 2, 3, 4];
/** Pattern of an icon's name. */
export const ICON_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
/** Box used when there is no set to supply the `viewBox` (unknown icon). */
export const DEFAULT_ICON_VIEWBOX: readonly [number, number] = [24, 24];

export type IconCap = 'butt' | 'round' | 'square';
export type IconJoin = 'miter' | 'round' | 'bevel';
export type IconFillRule = 'nonzero' | 'evenodd';

/** A stop of an icon gradient: `offset` from 0 to 1 and a literal color (the file has no expressions). */
export interface IconGradientStop {
  readonly offset: number;
  readonly color: string;
}

/** Linear gradient by `angle` (0° left to right, 90° top to bottom), measured in the `viewBox`. */
export interface IconLinearAngleGradient {
  readonly type: 'linear';
  readonly angle: number;
  readonly stops: readonly IconGradientStop[];
}

/** Linear gradient between two points in `viewBox` units. */
export interface IconLinearPointsGradient {
  readonly type: 'linear';
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly stops: readonly IconGradientStop[];
}

/** Radial gradient (a circle): `center` in fractions of the `viewBox`, `radius` in its units. */
export interface IconRadialGradient {
  readonly type: 'radial';
  readonly center?: readonly [number, number];
  readonly radius?: number;
  readonly stops: readonly IconGradientStop[];
}

/** Angular (sweep) gradient: `center` in fractions of the `viewBox`, `angle` as in the linear one. */
export interface IconAngularGradient {
  readonly type: 'angular';
  readonly center?: readonly [number, number];
  readonly angle?: number;
  readonly stops: readonly IconGradientStop[];
}

/** A gradient `fill` of a path (file formatVersion 4). */
export type IconGradient =
  | IconLinearAngleGradient
  | IconLinearPointsGradient
  | IconRadialGradient
  | IconAngularGradient;

/** A path of an icon, in the `viewBox` space. */
export interface IconPath {
  readonly d: string;
  /**
   * `true` = the node's color; text = its own color; absent with `stroke` absent = the node's color;
   * a gradient (file formatVersion 4) = its own paint, which the node's color does not tint.
   */
  readonly fill?: boolean | string | IconGradient;
  /** `true` = the node's color; text = its own color. Width in `viewBox` units (`width`). */
  readonly stroke?: boolean | string;
  readonly width?: number;
  readonly cap?: IconCap;
  readonly join?: IconJoin;
  /** The fill rule (file formatVersion 3; default `nonzero`). The stroke does not change. */
  readonly fillRule?: IconFillRule;
}

/** The clip of an icon (file formatVersion 4), in `viewBox` units. */
export interface IconClip {
  readonly d: string;
  /** Default `nonzero`. */
  readonly fillRule?: IconFillRule;
}

export interface IconDef {
  /** Overrides the set's `viewBox`. */
  readonly viewBox?: readonly [number, number];
  /** Clips every path of the icon, fill and stroke (file formatVersion 4). */
  readonly clip?: IconClip;
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

/** The issue with the code and parameters that the catalog finds by the text (the icons', then the component's). */
function issue(path: string, message: string): IconsIssue {
  const hit = iconsFileCodeForText(message) ?? componentCodeForText(message);
  if (hit === undefined) return { path, message };
  return hit.params === undefined
    ? { path, message, code: hit.code }
    : { path, message, code: hit.code, params: hit.params };
}

export type IconsParseResult =
  | { ok: true; set: IconSet; warnings: IconsIssue[] }
  | { ok: false; issues: IconsIssue[]; errors: string[] };

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

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRange = (value: unknown, min: number, max: number): boolean =>
  isNumber(value) && value >= min && value <= max;

/** A point of `from`/`to`: two finite numbers, in `viewBox` units. */
function checkPoint(value: unknown, path: string, out: IconsIssue[]): void {
  const ok = Array.isArray(value) && value.length === 2 && value.every(isNumber);
  if (!ok) out.push(issue(path, 'expected two finite numbers'));
}

function checkStop(stop: unknown, path: string, out: IconsIssue[]): void {
  if (!isRecord(stop)) return void out.push(issue(path, 'expected an object'));
  checkUnknownKeys(stop, ['offset', 'color'], path, out);
  if (!isRange(stop.offset, 0, 1))
    out.push(issue(join(path, 'offset'), 'expected a number between 0 and 1'));
  if (typeof stop.color !== 'string' || stop.color === '')
    out.push(issue(join(path, 'color'), 'expected a color (non-empty text)'));
}

function checkStops(value: unknown, path: string, out: IconsIssue[]): void {
  const at = join(path, 'stops');
  if (!Array.isArray(value)) return void out.push(issue(at, 'expected a list of stops'));
  if (value.length < 2) out.push(issue(at, 'expected at least 2 stops'));
  value.forEach((stop: unknown, i) => checkStop(stop, join(at, i), out));
}

/** The `angle` or the `from`/`to` points of a linear gradient: one way, not both. */
function checkLinearDirection(
  value: Record<string, unknown>,
  path: string,
  out: IconsIssue[],
): void {
  const hasAngle = 'angle' in value;
  const hasPoints = 'from' in value || 'to' in value;
  if (hasAngle && hasPoints) out.push(issue(path, 'use angle or from and to, not both'));
  else if (!hasAngle && !('from' in value && 'to' in value))
    out.push(issue(path, 'expected angle or from and to'));
  if (hasAngle) checkAngle(value.angle, join(path, 'angle'), out);
  for (const key of ['from', 'to'])
    if (key in value) checkPoint(value[key], join(path, key), out);
}

function checkAngle(value: unknown, path: string, out: IconsIssue[]): void {
  if (!isNumber(value)) out.push(issue(path, 'expected a number'));
}

function checkCenter(value: unknown, path: string, out: IconsIssue[]): void {
  const ok =
    Array.isArray(value) && value.length === 2 && value.every((n) => isRange(n, 0, 1));
  if (!ok) out.push(issue(path, 'expected two numbers from 0 to 1'));
}

/** The keys each gradient type accepts, besides `type` and `stops`. */
const GRADIENT_KEYS: Readonly<Record<string, readonly string[]>> = {
  linear: ['angle', 'from', 'to'],
  radial: ['center', 'radius'],
  angular: ['center', 'angle'],
};

/** `center`, `radius` and `angle` of the radial and angular ones. */
function checkRoundGradient(
  type: string,
  value: Record<string, unknown>,
  path: string,
  out: IconsIssue[],
): void {
  if ('center' in value) checkCenter(value.center, join(path, 'center'), out);
  if (
    type === 'radial' &&
    'radius' in value &&
    !(isNumber(value.radius) && value.radius > 0)
  )
    out.push(issue(join(path, 'radius'), 'expected a number greater than 0'));
  if (type === 'angular' && 'angle' in value)
    checkAngle(value.angle, join(path, 'angle'), out);
}

/** A gradient `fill` (file formatVersion 4): the shapes of decision 4, measured in the `viewBox`. */
function checkGradient(
  value: Record<string, unknown>,
  path: string,
  out: IconsIssue[],
): void {
  const type = typeof value.type === 'string' ? value.type : '';
  const known = Object.hasOwn(GRADIENT_KEYS, type);
  checkUnknownKeys(
    value,
    ['type', 'stops', ...(known ? (GRADIENT_KEYS[type] ?? []) : [])],
    path,
    out,
  );
  if (!known)
    out.push(issue(join(path, 'type'), 'expected "linear", "radial" or "angular"'));
  else if (type === 'linear') checkLinearDirection(value, path, out);
  else checkRoundGradient(type, value, path, out);
  checkStops(value.stops, path, out);
}

/** A path `fill`: `true`, `false`, a color, or (formatVersion 4 only) a gradient. */
function checkFill(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!isRecord(value)) return checkPaint(value, path, out);
  if (typeof version === 'number' && version < 4)
    out.push(issue(path, 'only allowed with formatVersion 4'));
  else checkGradient(value, path, out);
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

const PATH_KEYS = ['d', 'fill', 'stroke', 'width', 'cap', 'join', 'fillRule'];

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
  version: unknown,
  out: IconsIssue[],
): void {
  if ('fill' in value) checkFill(value.fill, join(path, 'fill'), version, out);
  if ('stroke' in value) checkPaint(value.stroke, join(path, 'stroke'), out);
  if ('width' in value) checkWidth(value.width, join(path, 'width'), out);
  if ('cap' in value)
    checkOneOf(value.cap, ['butt', 'round', 'square'], join(path, 'cap'), out);
  if ('join' in value)
    checkOneOf(value.join, ['miter', 'round', 'bevel'], join(path, 'join'), out);
}

function checkFillRule(
  value: Record<string, unknown>,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!('fillRule' in value)) return;
  const at = join(path, 'fillRule');
  if (version === 1 || version === 2)
    out.push(issue(at, 'only allowed with formatVersion 3'));
  else checkOneOf(value.fillRule, ['nonzero', 'evenodd'], at, out);
}

function checkIconPath(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!isRecord(value)) return void out.push(issue(path, 'expected object'));
  checkUnknownKeys(value, PATH_KEYS, path, out);
  if (typeof value.d !== 'string' || value.d.trim() === '')
    out.push(issue(join(path, 'd'), 'expected the path data (text)'));
  checkPathStyle(value, path, version, out);
  checkFillRule(value, path, version, out);
}

/** The icon's `clip` (file formatVersion 4): `d` and an optional `fillRule`. */
function checkClip(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (typeof version === 'number' && version < 4)
    return void out.push(issue(path, 'only allowed with formatVersion 4'));
  if (!isRecord(value)) return void out.push(issue(path, 'expected object'));
  checkUnknownKeys(value, ['d', 'fillRule'], path, out);
  if (typeof value.d !== 'string' || value.d.trim() === '')
    out.push(issue(join(path, 'd'), 'expected the path data (text)'));
  if ('fillRule' in value)
    checkOneOf(value.fillRule, ['nonzero', 'evenodd'], join(path, 'fillRule'), out);
}

function checkIcon(
  value: unknown,
  path: string,
  version: unknown,
  out: IconsIssue[],
): void {
  if (!isRecord(value)) return void out.push(issue(path, 'expected object'));
  checkUnknownKeys(value, ['viewBox', 'paths', 'mirror', 'clip'], path, out);
  if ('clip' in value) checkClip(value.clip, join(path, 'clip'), version, out);
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
  value.paths.forEach((p: unknown, i) => checkIconPath(p, join(at, i), version, out));
}

function checkHeader(input: Record<string, unknown>, out: IconsIssue[]): void {
  if (input.format !== ICONS_FORMAT)
    out.push(issue('format', `must be "${ICONS_FORMAT}"`));
  if (!ICONS_FORMAT_VERSIONS.includes(input.formatVersion as number))
    out.push(issue('formatVersion', 'must be 1, 2, 3 or 4'));
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

/** The warning for a literal that is not a color of the format; `undefined` when it is one. */
function unknownColor(path: string, value: unknown): IconsIssue | undefined {
  if (typeof value !== 'string' || isFormatColor(value)) return undefined;
  return issue(
    path,
    `not a color of the format: ${JSON.stringify(value)} (use #rrggbb, rgb(), hsl(), transparent or none)`,
  );
}

/** The color warnings of one path: `fill` and `stroke` text, and the colors of the gradient stops. */
function pathColorWarnings(path: IconPath, at: string): IconsIssue[] {
  const found: (IconsIssue | undefined)[] = [];
  for (const key of ['fill', 'stroke'] as const) {
    const value = path[key];
    if (typeof value === 'object')
      value.stops.forEach((stop, i) =>
        found.push(
          unknownColor(`${join(join(at, key), 'stops')}[${i}].color`, stop.color),
        ),
      );
    else found.push(unknownColor(join(at, key), value));
  }
  return found.filter((w): w is IconsIssue => w !== undefined);
}

/** Warnings (not errors) of a valid file: a literal color that is not a color of the format. */
function colorWarnings(set: IconSet): IconsIssue[] {
  const out: IconsIssue[] = [];
  for (const [name, icon] of Object.entries(set.icons))
    icon.paths.forEach((path, i) =>
      out.push(...pathColorWarnings(path, `${join(join('icons', name), 'paths')}[${i}]`)),
    );
  return out;
}

/** Validates the JSON of the `mapping-icons` file (does not throw). */
export function parseIconsFile(input: unknown): IconsParseResult {
  const issues = collectIssues(input);
  if (issues.length > 0) return { ok: false, issues, errors: issues.map(formatIssue) };
  const set = input as IconSet;
  return { ok: true, set, warnings: colorWarnings(set) };
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
  if (template.type === 'text' && Array.isArray(template.runs))
    template.runs.forEach((run: unknown, i) => {
      if (isRecord(run) && 'icon' in run)
        out.push({ path: `${join(path, 'runs')}[${i}].icon`, name: run.icon });
    });
  if (Array.isArray(template.children))
    template.children.forEach((child: unknown, i) =>
      out.push(...iconNodes(child, join(join(path, 'children'), i))),
    );
  if (template.type === 'repeat')
    out.push(...iconNodes(template.template, join(path, 'template')));
  if (template.type === 'slot')
    out.push(...iconNodes(template.fallback, join(path, 'fallback')));
  return out;
}
