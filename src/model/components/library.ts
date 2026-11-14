/**
 * Component engine (Library stage): the library, read from files. The specialization
 * (`mapping-spec`) points, in each annotation type, to the component file (`component`, path
 * relative to the specialization file); each component is validated by `parseComponent`.
 *
 * The sources of the files (embedded examples, `<input type="file" multiple>`, folder via
 * `showDirectoryPicker`) become the same `{ path, text }` list before reaching here.
 */
import type { ComponentFile, FieldValue } from './componentFormat';
import { findSlot } from './arrange';
import {
  type FieldSource,
  type Origin,
  type OriginProblem,
  type TypeSource,
  originProblemText,
  parseFieldSources,
  parseOrigins,
  parsePath,
  parseTypeSources,
} from './origin';
import { parseIconsFile, type IconSet } from './icons';
import { parseComponent } from './parseComponent';
import { resolveTokens, type HostFonts, type SpecTokens } from './tokens';
import { isRecord } from '../isRecord';

export interface TextFile {
  /** Path relative to the chosen root, with `/`. */
  readonly path: string;
  /** Content of the `.json` files (absent in binary files). */
  readonly text?: string;
  /** Bytes of the font files (`.ttf`, `.otf`, `.woff`, `.woff2`). */
  readonly bytes?: ArrayBuffer;
}

/** Extensions read as bytes (design system fonts). */
export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const;

export function isFontPath(path: string): boolean {
  const lower = path.toLowerCase();
  return FONT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Font declared in the specialization (`fonts`), with the bytes when the file came along. */
export interface LoadedFont {
  readonly family: string;
  /** CSS weight: `"400"`, `"500"` or a variable-font range, `"100 900"`. */
  readonly weight: string;
  readonly style: 'normal' | 'italic';
  /** Resolved path, relative to the root. */
  readonly path: string;
  readonly bytes?: ArrayBuffer;
}

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'table' | 'ref';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly default?: FieldValue;
  readonly description?: string;
  /** Origins of the field (`sources`); in an executable origin the `path` is the path inside `props`. */
  readonly sources: readonly FieldSource[];
}

export interface TypeDef {
  readonly id: string;
  readonly name: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly layerColor: string;
  readonly labelField?: string;
  readonly fields: readonly FieldDef[];
  /** Path of the component file, as it is in the specialization. */
  readonly componentPath?: string;
  /** The loaded component (absent when the file was missing or invalid). */
  readonly component?: ComponentFile;
  /** Elements of external systems the type corresponds to (`sources`). */
  readonly sources: readonly TypeSource[];
}

export interface Library {
  readonly specId: string;
  readonly specName: string;
  readonly specPath: string;
  readonly types: readonly TypeDef[];
  /** Fonts declared by the specialization (`fonts`), with bytes when the file exists. */
  readonly fonts: readonly LoadedFont[];
  /** Declared executable origins (`origins`): how to read an external JSON as a screen. */
  readonly origins: readonly Origin[];
  /** `tokens` of the specialization (read without validating; the library validator checks them). */
  readonly tokens?: SpecTokens;
  /** The specialization's icon set (`icons`), when the file exists and is valid. */
  readonly icons?: IconSet;
  /** What did not load: missing file, invalid component, type without a component. */
  readonly problems: readonly string[];
}

function parseJson(file: TextFile): unknown {
  try {
    return JSON.parse(file.text ?? '');
  } catch (error) {
    throw new Error(
      `${file.path}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
}

/**
 * Resolves `ref` relative to the directory of `from` (`a/b/spec.json` + `components/x.json` →
 * `a/b/components/x.json`). Returns `undefined` when a `..` leaves the library root.
 */
export function resolvePathChecked(from: string, ref: string): string | undefined {
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts: string[] = [];
  for (const part of `${dir}${ref}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.join('/');
}

/**
 * Like `resolvePathChecked`, but a `..` that leaves the root is discarded. Whoever validates the
 * library (`loadLibrary`) uses the checked version and records the problem.
 */
export function resolvePath(from: string, ref: string): string {
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const parts: string[] = [];
  for (const part of `${dir}${ref}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

type PathResolver = (from: string, ref: string) => string | undefined;

/** Options of `loadLibrary`. */
export interface LoadLibraryOptions {
  /**
   * A `..` that leaves the root is discarded instead of becoming a problem (`resolvePath`). Only for
   * whoever loads by URL, where `../` is relative to the specialization's URL and not the library's.
   */
  readonly allowOutside?: boolean;
}

const outsideLibrary = (ref: string): string => `path outside the library: ${ref}`;

function readField(
  raw: unknown,
  path: string,
  problems: string[],
  systems: ReadonlySet<string>,
): FieldDef | undefined {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.type !== 'string') {
    problems.push(`${path}: field without key/type`);
    return undefined;
  }
  const type = raw.type as FieldType;
  const def = raw.default;
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === 'string')
    : undefined;
  const sourceProblems: OriginProblem[] = [];
  const sources = parseFieldSources(raw.sources, `${path}.sources`, sourceProblems);
  problems.push(...sourceProblems.map(originProblemText));
  sources.forEach((source, index) => {
    const at = `${path}.sources[${index}]`;
    if (source.values) {
      if (type !== 'enum') {
        problems.push(`${at}.values: only valid on an enum field`);
      } else {
        for (const [from, to] of Object.entries(source.values)) {
          if (!options?.includes(to)) {
            problems.push(`${at}.values.${from}: target outside options: ${to}`);
          }
        }
      }
    }
    // In an executable origin the `path` is the path inside `props` (without `[*]`) and is required.
    if (systems.has(source.system)) {
      if (source.path === undefined) {
        problems.push(`${at}.path: required in a system declared in origins`);
      } else {
        const parsed = parsePath(source.path);
        if (!parsed.ok || parsed.segments.includes(null)) {
          problems.push(`${at}.path: invalid path "${source.path}"`);
        }
      }
    }
  });
  return {
    key: raw.key,
    label: typeof raw.label === 'string' ? raw.label : raw.key,
    type,
    required: raw.required === true,
    options,
    default: typeof def === 'string' || typeof def === 'number' ? def : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    sources,
  };
}

/** Checks the `slot` of the type's origins against the component's slot. */
function checkTypeSources(
  id: string,
  sources: readonly TypeSource[],
  component: ComponentFile | undefined,
  problems: string[],
): void {
  if (!component) return;
  const slot = findSlot(component);
  sources.forEach((source, index) => {
    if (source.slot === undefined) return;
    const at = `${id}.sources[${index}].slot`;
    if (!slot) problems.push(`${at}: the component has no slot`);
    else if (slot.name !== source.slot) {
      problems.push(
        `${at}: the component's slot is "${slot.name ?? ''}", not "${source.slot}"`,
      );
    }
  });
}

/** The type's component: a file outside the library, missing or invalid becomes a problem. */
function loadComponent(
  typeId: string,
  componentPath: string,
  specPath: string,
  parsed: ReadonlyMap<string, unknown>,
  problems: string[],
  resolve: PathResolver,
): ComponentFile | undefined {
  const full = resolve(specPath, componentPath);
  if (full === undefined) {
    problems.push(`${typeId}: ${outsideLibrary(componentPath)}`);
    return undefined;
  }
  const json = parsed.get(full);
  if (json === undefined) {
    problems.push(`${typeId}: component file not found: ${full}`);
    return undefined;
  }
  const result = parseComponent(json);
  if (result.ok) return result.component;
  for (const issue of result.issues)
    problems.push(`${full}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  return undefined;
}

/** The `scrim` of each screen root must be a type of the library. */
function checkScrims(
  origins: readonly Origin[],
  typeIds: ReadonlySet<string>,
  problems: string[],
): void {
  origins.forEach((origin, oi) => {
    origin.screen.roots.forEach((root, ri) => {
      if (root.scrim !== undefined && !typeIds.has(root.scrim)) {
        problems.push(
          `origins[${oi}].screen.roots[${ri}].scrim: nonexistent type: ${root.scrim}`,
        );
      }
    });
  });
}

/**
 * Builds the library from the files. Finds the specialization (the file with
 * `"format": "mapping-spec"`; if there is more than one, uses the first and warns) and loads each
 * referenced component. Throws only when there is no specialization.
 */
export function loadLibrary(
  files: readonly TextFile[],
  options: LoadLibraryOptions = {},
): Library {
  const resolve = options.allowOutside ? resolvePath : resolvePathChecked;
  const problems: string[] = [];
  const parsed = new Map<string, unknown>();
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith('.json')) continue;
    try {
      parsed.set(file.path, parseJson(file));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  const specs = [...parsed].filter(
    ([, json]) => isRecord(json) && json.format === 'mapping-spec',
  );
  const first = specs[0];
  if (!first) {
    throw new Error(
      'No specialization found: the folder needs a file with "format": "mapping-spec".',
    );
  }
  if (specs.length > 1) {
    problems.push(`there are ${specs.length} specializations; using ${first[0]}`);
  }
  const [specPath, specJson] = first;
  const spec = specJson as Record<string, unknown>;
  const parsedOrigins = parseOrigins(spec.origins);
  problems.push(...parsedOrigins.problems.map(originProblemText));
  const origins = parsedOrigins.origins;
  const systems = new Set(origins.map((o) => o.system));
  const types: TypeDef[] = [];
  const layers = Array.isArray(spec.layers) ? spec.layers : [];
  layers.forEach((layer, li) => {
    if (!isRecord(layer)) return;
    const layerId = typeof layer.id === 'string' ? layer.id : `layer-${li}`;
    const layerName = typeof layer.name === 'string' ? layer.name : layerId;
    const layerColor = typeof layer.color === 'string' ? layer.color : '#1E88E5';
    const annotationTypes = Array.isArray(layer.annotationTypes)
      ? layer.annotationTypes
      : [];
    annotationTypes.forEach((type, ti) => {
      if (!isRecord(type) || typeof type.id !== 'string') {
        problems.push(`layers[${li}].annotationTypes[${ti}]: type without id`);
        return;
      }
      const fieldsRaw = Array.isArray(type.fields) ? type.fields : [];
      const fields = fieldsRaw
        .map((f, fi) => readField(f, `${type.id}.fields[${fi}]`, problems, systems))
        .filter((f): f is FieldDef => f !== undefined);
      const componentPath =
        typeof type.component === 'string' ? type.component : undefined;
      const component = componentPath
        ? loadComponent(type.id, componentPath, specPath, parsed, problems, resolve)
        : undefined;
      const sourceProblems: OriginProblem[] = [];
      const sources = parseTypeSources(
        type.sources,
        `${type.id}.sources`,
        sourceProblems,
      );
      problems.push(...sourceProblems.map(originProblemText));
      checkTypeSources(type.id, sources, component, problems);
      types.push({
        id: type.id,
        name: typeof type.name === 'string' ? type.name : type.id,
        layerId,
        layerName,
        layerColor,
        labelField: typeof type.labelField === 'string' ? type.labelField : undefined,
        fields,
        componentPath,
        component,
        sources,
      });
    });
  });
  checkScrims(origins, new Set(types.map((t) => t.id)), problems);
  const fonts = readFonts(spec.fonts, specPath, files, problems, resolve);
  return withHostTokens(
    {
      specId: typeof spec.id === 'string' ? spec.id : 'spec',
      specName: typeof spec.name === 'string' ? spec.name : 'Specialization',
      specPath,
      types,
      fonts,
      origins,
      tokens: readTokens(spec.tokens),
      icons: readIcons(spec.icons, specPath, parsed, problems, resolve),
      problems,
    },
    {},
  );
}

/** The set of icons pointed to by `icons` (a missing or invalid file becomes a problem). */
function readIcons(
  raw: unknown,
  specPath: string,
  parsed: ReadonlyMap<string, unknown>,
  problems: string[],
  resolve: PathResolver,
): IconSet | undefined {
  if (typeof raw !== 'string') return undefined;
  const path = resolve(specPath, raw);
  if (path === undefined) {
    problems.push(`icons: ${outsideLibrary(raw)}`);
    return undefined;
  }
  const json = parsed.get(path);
  if (json === undefined) {
    problems.push(`icon file not found: ${path}`);
    return undefined;
  }
  const result = parseIconsFile(json);
  if (result.ok) return result.set;
  for (const issue of result.issues)
    problems.push(`${path}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
  return undefined;
}

/** `tokens` of the specialization JSON, in the minimal form (text modes and text, number or per-mode values). */
function readTokens(raw: unknown): SpecTokens | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.modes) || !isRecord(raw.values))
    return undefined;
  const modes = raw.modes.filter((m): m is string => typeof m === 'string');
  return modes.length === 0
    ? undefined
    : { modes, values: raw.values as SpecTokens['values'] };
}

/**
 * The library with the components carrying the mode's tokens (`resolvedTokens`): `font-sans` and
 * `font-mono` take the host's font, unless the specialization redefines them.
 */
export function withHostTokens(
  library: Library,
  fonts: HostFonts,
  mode?: string,
): Library {
  const resolvedTokens = resolveTokens(library.tokens, fonts, mode);
  const resolvedIcons = library.icons;
  return {
    ...library,
    types: library.types.map((type) =>
      type.component === undefined
        ? type
        : {
            ...type,
            component: {
              ...type.component,
              resolvedTokens,
              ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
            },
          },
    ),
  };
}

/**
 * `fonts` of the specialization: `[{ "family": "Roboto", "file": "fonts/Roboto-Regular.ttf",
 * "weight": 400, "style": "normal" }]`. `weight` accepts a number or a range (`"100 900"`, variable
 * font). A missing file is not a library problem: it shows up in the font status.
 */
function readFonts(
  raw: unknown,
  specPath: string,
  files: readonly TextFile[],
  problems: string[],
  resolve: PathResolver,
): LoadedFont[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push('fonts: expected a list');
    return [];
  }
  const byPath = new Map(files.filter((f) => f.bytes).map((f) => [f.path, f.bytes]));
  // Files chosen loose ("Open files…") arrive with only the name: the file name counts.
  const byName = new Map(
    files
      .filter((f) => f.bytes)
      .map((f) => [f.path.slice(f.path.lastIndexOf('/') + 1), f.bytes]),
  );
  const out: LoadedFont[] = [];
  raw.forEach((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.family !== 'string' ||
      typeof entry.file !== 'string'
    ) {
      problems.push(`fonts[${index}]: needs family and file`);
      return;
    }
    const weight =
      typeof entry.weight === 'number'
        ? String(entry.weight)
        : typeof entry.weight === 'string' && entry.weight.trim() !== ''
          ? entry.weight.trim()
          : '400';
    const style = entry.style === 'italic' ? 'italic' : 'normal';
    const path = resolve(specPath, entry.file);
    if (path === undefined) {
      problems.push(`fonts[${index}]: ${outsideLibrary(entry.file)}`);
      return;
    }
    const bytes = byPath.get(path) ?? byName.get(path.slice(path.lastIndexOf('/') + 1));
    out.push({ family: entry.family, weight, style, path, bytes });
  });
  return out;
}

/** Initial values of a new instance: the component's `preview`, otherwise the field's `default`. */
export function initialValues(type: TypeDef): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of type.fields) {
    const preview = type.component?.preview?.[field.key];
    values[field.key] = preview !== undefined ? preview : (field.default ?? null);
  }
  return values;
}

/** Label of an instance: filled `labelField`, otherwise the type's name. */
export function instanceLabel(
  type: TypeDef,
  values: Readonly<Record<string, FieldValue>>,
): string {
  const key = type.labelField;
  const value = key ? values[key] : undefined;
  // Only text and number enter the label; a table value (list) counts as empty.
  const text =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text.trim() === '' ? type.name : text;
}
