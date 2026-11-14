import { hasSlotComponent } from './componentCatalog';
import { issueParts, modelMessage, type ModelMessage } from './modelMessage';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import { type TextMeasurer, instantiate } from './components/instantiate';
import { type Library, loadLibrary, resolvePath } from './components/library';
import { screenFromSource } from './components/origin';
import { parseComponentText, type ComponentIssue } from './components/parseComponent';
import { type FrameNode, baseNode, translate } from './components/scene';
import { renderOrder } from './components/screen';
import { fitComponentSize, followedAxes, resolveSizing } from './components/sizing';
import { resolveTokens } from './components/tokens';
import type { Size } from './geometry';
import { type LibraryFile, type LibraryReport, validateLibrary } from './library';
import {
  defaultValues,
  nodeProbeLibrary,
  withoutNodePrefixMessage,
} from './libraryDrawing';
import { resolveCode } from './codeVariants';
import { repoLink } from './codeLocations';
import { packageSpecNameOf } from './libraryPackage';
import {
  type FieldType,
  type Spec,
  type SpecAnnotationType,
  type SpecColumn,
  type SpecField,
  type SpecRefAccepts,
  type SpecTypeSource,
} from './spec';

// Library catalog (Library stage, B5): the specialization of a package read into memory,
// reorganized for the interface to show (layers, types, property table, code per platform,
// sources, examples) and to draw a type or an example. Pure: it receives the files already read
// (the same format as the validator) and never reads disk or network. Never throws: a broken
// package returns the `report` and whatever could be built.

/** A field ready for the property table. */
export interface CatalogField {
  readonly key: string;
  /** The field's `label` or, without it, the `key`. */
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** The `enum`'s options. */
  readonly options?: readonly string[];
  readonly default?: string | number;
  readonly description?: string;
  /** Columns of a `table` field. */
  readonly columns?: readonly CatalogField[];
  readonly rowLabel?: string;
  /** What a `ref` field accepts. */
  readonly accepts?: SpecRefAccepts;
}

/** A `variants` case already resolved over the base: the value's symbol (and file). */
export interface CatalogCodeVariantCase {
  /** Value of the variant's field (one of the `options`). */
  readonly value: string;
  readonly symbol: string;
  readonly path?: string;
}

/** The `code`'s `variants` for the interface: the field and the value → symbol table, in `options` order. */
export interface CatalogCodeVariants {
  readonly field: string;
  /** The field's `label` or, without it, the `key`. */
  readonly fieldLabel: string;
  readonly cases: readonly CatalogCodeVariantCase[];
}

/** The type's `code` on one platform. The UI builds the links with the specialization's `repo` (`codeLink`). */
export interface CatalogCode {
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly language?: string;
  };
  readonly symbol: string;
  readonly path?: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly notes?: string;
  /** Present with `variants` in the specialization: the rest is the base. */
  readonly variants?: CatalogCodeVariants;
}

/** Elements of an external system that the type corresponds to. */
export interface CatalogSourceGroup {
  readonly system: string;
  readonly items: readonly SpecTypeSource[];
}

/**
 * An example of a type. `values` mode: `values` directly. `system` mode: the node's JSON (`json`,
 * `undefined` if the file was missing or is not JSON) goes through the `origins` declaration.
 */
export interface CatalogExample {
  readonly name: string;
  readonly description?: string;
  readonly mode: 'values' | 'system';
  /** The example's values; for a `table` field, the rows, with `_id` like those of the `preview`. */
  readonly values?: FieldValues;
  readonly system?: string;
  readonly file?: string;
  readonly json?: unknown;
}

/** Document of a type that lives in a repository declared in `docRepos` (nothing is read here). */
export interface CatalogDocExternal {
  /** Id of the `docRepos` entry cited by `doc.repo`. */
  readonly repo: string;
  readonly path: string;
  /** `url` of the declared repository; `null` if the id does not exist in the specialization. */
  readonly repoUrl: string | null;
  /** Link to the file via the repository's `urlTemplate`; `null` without a repository or a valid template. */
  readonly url: string | null;
}

export interface CatalogEntry {
  readonly type: SpecAnnotationType;
  readonly layerId: string;
  readonly component: ComponentFile | null;
  /** Why there is no component (missing or invalid file); absent if the type does not declare `component`. */
  readonly componentProblem?: ModelMessage;
  readonly container: boolean;
  /** Text of the type's `.md`; `null` without `doc` or with the file missing. */
  readonly docText: string | null;
  /** Object `doc` (v11): the `.md` lives in a `docRepos` repository; `null` in the other cases. */
  readonly docExternal: CatalogDocExternal | null;
  readonly fields: readonly CatalogField[];
  readonly code: readonly CatalogCode[];
  readonly sources: readonly CatalogSourceGroup[];
  readonly examples: readonly CatalogExample[];
  /** The component's `preview` values over the fields' defaults; `null` without a component. */
  readonly previewValues: FieldValues | null;
}

export interface CatalogLayer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly entries: readonly CatalogEntry[];
}

export interface Catalog {
  readonly spec: Spec | null;
  readonly report: LibraryReport;
  readonly layers: readonly CatalogLayer[];
  /** The engine's library (origins for external-system examples); `null` if it was not built. */
  readonly library: Library | null;
}

/**
 * The rows of a table's `preview` get an `_id` (the playground form edits rows by `_id`); the
 * drawing ignores the `_id`.
 */
function withRowIds(values: FieldValues): FieldValues {
  const out: Record<string, FieldValues[string]> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = Array.isArray(value)
      ? value.map((row, i) => ({ _id: `preview-${i + 1}`, ...row }))
      : value;
  }
  return out;
}

function fieldOf(field: SpecField | SpecColumn): CatalogField {
  const base = {
    key: field.key,
    label: field.label ?? field.key,
    type: field.type,
    required: field.required === true,
    ...(field.description === undefined ? {} : { description: field.description }),
  };
  switch (field.type) {
    case 'enum':
      return {
        ...base,
        options: field.options,
        ...(field.default === undefined ? {} : { default: field.default }),
      };
    case 'table':
      return {
        ...base,
        columns: field.columns.map(fieldOf),
        ...(field.rowLabel === undefined ? {} : { rowLabel: field.rowLabel }),
      };
    case 'ref':
      return { ...base, accepts: field.accepts };
    default:
      return {
        ...base,
        ...(field.default === undefined ? {} : { default: field.default }),
      };
  }
}

/** The `code`'s `variants` for the Catalog table; `undefined` without `variants` or without an `enum` field. */
function variantsOf(
  type: SpecAnnotationType,
  code: NonNullable<SpecAnnotationType['code']>[string],
): CatalogCodeVariants | undefined {
  const { variants } = code;
  if (variants === undefined) return undefined;
  const field = type.fields.find((f) => f.key === variants.field);
  if (field?.type !== 'enum') return undefined;
  const cases = field.options.flatMap((value) => {
    if (!Object.hasOwn(variants.cases, value)) return [];
    const resolved = resolveCode(code, { [field.key]: value }, type.fields);
    return [
      {
        value,
        symbol: resolved.symbol,
        ...(resolved.path === undefined ? {} : { path: resolved.path }),
      },
    ];
  });
  return { field: field.key, fieldLabel: field.label ?? field.key, cases };
}

function codeOf(spec: Spec, type: SpecAnnotationType): CatalogCode[] {
  const platforms = new Map((spec.platforms ?? []).map((p) => [p.id, p]));
  const out: CatalogCode[] = [];
  for (const [id, code] of Object.entries(type.code ?? {})) {
    const platform = platforms.get(id);
    const variants = variantsOf(type, code);
    out.push({
      platform: {
        id,
        name: platform?.name ?? id,
        ...(platform?.language === undefined ? {} : { language: platform.language }),
      },
      symbol: code.symbol,
      ...(code.path === undefined ? {} : { path: code.path }),
      ...(code.params === undefined ? {} : { params: code.params }),
      ...(code.values === undefined ? {} : { values: code.values }),
      ...(code.notes === undefined ? {} : { notes: code.notes }),
      ...(variants === undefined ? {} : { variants }),
    });
  }
  return out;
}

function docExternalOf(spec: Spec, type: SpecAnnotationType): CatalogDocExternal | null {
  const doc = type.doc;
  if (doc === undefined || typeof doc === 'string') return null;
  const repo = spec.docRepos?.find((r) => r.id === doc.repo);
  return {
    repo: doc.repo,
    path: doc.path,
    repoUrl: repo?.url ?? null,
    url: repoLink(repo, doc.path),
  };
}

function sourcesOf(type: SpecAnnotationType): CatalogSourceGroup[] {
  const groups = new Map<string, SpecTypeSource[]>();
  for (const source of type.sources ?? []) {
    const list = groups.get(source.system) ?? [];
    list.push(source);
    groups.set(source.system, list);
  }
  return [...groups].map(([system, items]) => ({ system, items }));
}

function parseJsonOrUndefined(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Path of the specialization file inside the package. */
function locateSpecPath(texts: ReadonlyMap<string, unknown>, spec: Spec): string {
  const root = packageSpecNameOf(texts, spec.id);
  if (texts.has(root)) return root;
  for (const [path, text] of texts) {
    if (!path.toLowerCase().endsWith('.json') || typeof text !== 'string') continue;
    const json = parseJsonOrUndefined(text);
    if (typeof json !== 'object' || json === null) continue;
    if (
      Reflect.get(json, 'id') === spec.id &&
      /^mapp(ing|eador)-spec$/.test(String(Reflect.get(json, 'format')))
    ) {
      return path;
    }
  }
  return root;
}

/** Builds the package catalog (validation at all three levels included). Never throws. */
export function buildCatalog(files: readonly LibraryFile[]): Catalog {
  const report = validateLibrary({ files });
  const spec = report.spec ?? null;
  if (spec === null) return { spec: null, report, layers: [], library: null };

  const texts = new Map<string, string>();
  for (const file of files) if (file.text !== undefined) texts.set(file.path, file.text);
  const specPath = locateSpecPath(texts, spec);
  const resolve = (ref: string): string => resolvePath(specPath, ref);

  const library = ((): Library | null => {
    try {
      const textFiles = [...texts]
        .filter(([path]) => path.toLowerCase().endsWith('.json'))
        .sort(([a], [b]) => Number(b === specPath) - Number(a === specPath))
        .map(([path, text]) => ({ path, text }));
      return loadLibrary(textFiles);
    } catch {
      return null;
    }
  })();

  // Gallery and Playground draw with the tokens (default mode) and the specialization's icons,
  // like the canvas; without this the text comes out black on gray and every icon is unknown.
  const resolvedTokens = resolveTokens(library?.tokens, {});
  const resolvedIcons = library?.icons;
  const themed = (parsed: ComponentFile): ComponentFile => ({
    ...parsed,
    resolvedTokens,
    ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
  });

  const layers: CatalogLayer[] = spec.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    color: layer.color,
    entries: layer.annotationTypes.map((type): CatalogEntry => {
      let component: ComponentFile | null = null;
      let componentProblem: ModelMessage | undefined;
      if (type.component !== undefined) {
        const path = resolve(type.component);
        const text = texts.get(path);
        if (text === undefined) {
          componentProblem = modelMessage(
            'catalog.fileMissing',
            { path },
            `arquivo ausente (${path})`,
          );
        } else {
          const parsed = parseComponentText(text);
          if (parsed.ok) component = themed(parsed.component);
          else componentProblem = parseProblem(parsed.issues[0]);
        }
      }
      const examples = (type.examples ?? []).map((example): CatalogExample => {
        const base = {
          name: example.name,
          ...(example.description === undefined
            ? {}
            : { description: example.description }),
        };
        if (example.system !== undefined) {
          return {
            ...base,
            mode: 'system',
            system: example.system,
            ...(example.file === undefined
              ? {}
              : {
                  file: example.file,
                  json: parseJsonOrUndefined(texts.get(resolve(example.file))),
                }),
          };
        }
        return { ...base, mode: 'values', values: withRowIds(example.values ?? {}) };
      });
      return {
        type,
        layerId: layer.id,
        component,
        ...(componentProblem === undefined ? {} : { componentProblem }),
        container: component !== null && hasSlotComponent(component),
        docText:
          typeof type.doc === 'string' ? (texts.get(resolve(type.doc)) ?? null) : null,
        docExternal: docExternalOf(spec, type),
        fields: type.fields.map(fieldOf),
        code: codeOf(spec, type),
        sources: sourcesOf(type),
        examples,
        previewValues:
          component === null
            ? null
            : withRowIds({ ...defaultValues(type), ...(component.preview ?? {}) }),
      };
    }),
  }));
  return { spec, report, layers, library };
}

/** The entry of type `typeId` (in any layer), or `undefined`. */
export function findEntry(catalog: Catalog, typeId: string): CatalogEntry | undefined {
  let byId = entryIndexes.get(catalog);
  if (byId === undefined) {
    byId = new Map();
    for (const layer of catalog.layers) {
      for (const entry of layer.entries) {
        if (!byId.has(entry.type.id)) byId.set(entry.type.id, entry);
      }
    }
    entryIndexes.set(catalog, byId);
  }
  return byId.get(typeId);
}

/** The problem of a component that failed to parse: the parser's first error, with a translatable reason. */
function parseProblem(issue: ComponentIssue | undefined): ModelMessage {
  if (issue === undefined) {
    return modelMessage('catalog.invalidComponent', {}, 'invalid component');
  }
  const { at, reason, reasonParam, detail } = issueParts(issue);
  return modelMessage(
    'catalog.invalidProblem',
    { at, ...reasonParam },
    `${at}${reason}`,
    detail,
  );
}

/** Entries by type id, once per catalog (the catalog is immutable). */
const entryIndexes = new WeakMap<Catalog, Map<string, CatalogEntry>>();

// ---------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------

export interface CatalogDrawing {
  readonly root: FrameNode;
  readonly warnings: readonly ModelMessage[];
}

/** Playground range: from `minSize` (or 1×1) to twice the `size`. */
export function playgroundSizeRange(component: ComponentFile): {
  min: Size;
  max: Size;
} {
  const min = {
    width: component.minSize?.width ?? 1,
    height: component.minSize?.height ?? 1,
  };
  return {
    min,
    max: {
      width: Math.max(min.width, component.size.width * 2),
      height: Math.max(min.height, component.size.height * 2),
    },
  };
}

/** Clamps `size` (rounded) to the playground range. */
export function clampPlaygroundSize(component: ComponentFile, size: Size): Size {
  const { min, max } = playgroundSizeRange(component);
  const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  return {
    width: clamp(size.width, min.width, max.width),
    height: clamp(size.height, min.height, max.height),
  };
}

export interface Axes {
  readonly width: boolean;
  readonly height: boolean;
}

/**
 * Axes on which the component's `sizing` follows the content: `hug` (literal, or what the
 * expression evaluated with `values` says) or px given by an expression. Without `values`, only
 * the literal counts.
 */
export function hugAxes(component: ComponentFile, values: FieldValues = {}): Axes {
  const followed = followedAxes(resolveSizing(component, values));
  return { width: followed.width, height: followed.height };
}

/** Like `hugAxes`, for the catalog entry: the type's default values under the `values`. */
export function entryHugAxes(entry: CatalogEntry, values: FieldValues): Axes {
  if (entry.component === null) return { width: false, height: false };
  return hugAxes(entry.component, { ...defaultValues(entry.type), ...values });
}

/**
 * Drawing size that respects the `sizing`: on the `auto` axes (default: those where the
 * `sizing` evaluated with `values` says `hug` or px by expression) the size is the content's,
 * measured with `values`, or the expression's px; on the others the `base` stays (default: the
 * `size`). All clamped to the playground range. Without a component: 1×1.
 */
export function fittedSize(
  entry: CatalogEntry,
  values: FieldValues,
  measure: TextMeasurer,
  options: { readonly base?: Size; readonly auto?: Partial<Axes> } = {},
): Size {
  const component = entry.component;
  if (component === null) return { width: 1, height: 1 };
  const base = options.base ?? component.size;
  const all = { ...defaultValues(entry.type), ...values };
  try {
    const fit = fitComponentSize(
      component,
      all,
      { measure },
      { base, ...(options.auto === undefined ? {} : { auto: options.auto }) },
    );
    return clampPlaygroundSize(component, fit ?? base);
  } catch {
    return clampPlaygroundSize(component, base);
  }
}

/** Draws the entry's component with `values` at the given size (default: the component's `size`). `null` without a component. */
export function drawEntry(
  entry: CatalogEntry,
  values: FieldValues,
  measure: TextMeasurer,
  size?: Size,
): CatalogDrawing | null {
  if (entry.component === null) return null;
  const box = { x: 0, y: 0, ...(size ?? entry.component.size) };
  const drawn = instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values },
    box,
    { measure },
  );
  return { root: drawn.root, warnings: drawn.messages };
}

/**
 * Draws an example of the entry (`example` absent = the component's `preview`). `values` mode:
 * instantiates the component; `system` mode: passes the node's JSON through the `origins`
 * declaration and draws the resulting tree (the `size` does not apply: the size comes from the
 * node). `null` when there is nothing to draw (component, file or origin missing); never throws.
 */
export function exampleDrawing(
  catalog: Catalog,
  entry: CatalogEntry,
  example: CatalogExample | undefined,
  measure: TextMeasurer,
  size?: Size,
): CatalogDrawing | null {
  try {
    if (example === undefined) {
      const values = entry.previewValues ?? {};
      return drawEntry(
        entry,
        values,
        measure,
        size ?? fittedSize(entry, values, measure),
      );
    }
    if (example.mode === 'values') {
      const values = example.values ?? {};
      return drawEntry(
        entry,
        values,
        measure,
        size ?? fittedSize(entry, values, measure),
      );
    }
    return systemDrawing(catalog, example, measure);
  } catch {
    return null;
  }
}

function systemDrawing(
  catalog: Catalog,
  example: CatalogExample,
  measure: TextMeasurer,
): CatalogDrawing | null {
  const origin = catalog.library?.origins.find((o) => o.system === example.system);
  if (catalog.library === null || origin === undefined || example.json === undefined) {
    return null;
  }
  const result = screenFromSource(
    nodeProbeLibrary(catalog.library, origin),
    { node: example.json },
    { system: origin.system, measure },
  );
  const warnings: ModelMessage[] = result.messages.map(withoutNodePrefixMessage);
  if (result.error !== undefined) {
    return null;
  }
  const instances = result.screen === undefined ? [] : renderOrder(result.screen);
  const first = instances.find((i) => i.parentId === undefined);
  if (first === undefined) return null;
  const children: FrameNode[] = [];
  for (const instance of instances) {
    const entry = findEntry(catalog, instance.typeId);
    if (entry === undefined) {
      warnings.push(
        modelMessage(
          'catalog.typeOutside',
          { typeId: instance.typeId },
          `type "${instance.typeId}" is outside the specialization`,
        ),
      );
      continue;
    }
    const drawn = drawEntry(entry, instance.values, measure, {
      width: instance.box.width,
      height: instance.box.height,
    });
    if (drawn === null) {
      warnings.push(
        modelMessage(
          'catalog.typeNoComponent',
          { typeId: instance.typeId },
          `type "${instance.typeId}" has no component`,
        ),
      );
      continue;
    }
    warnings.push(...drawn.warnings);
    children.push({
      ...drawn.root,
      transform: translate(instance.box.x - first.box.x, instance.box.y - first.box.y),
    });
  }
  const root: FrameNode = {
    ...baseNode({
      id: 'example',
      name: example.name,
      width: first.box.width,
      height: first.box.height,
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  };
  return { root, warnings };
}
