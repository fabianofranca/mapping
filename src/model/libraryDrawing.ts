import type {
  ComponentFile,
  Direction,
  FieldValues,
  ResolvedComponentField,
} from './components/componentFormat';
import { attachResolvedComponents, resolvedFields } from './components/nesting';
import { type Box, approximateMeasurer, instantiate } from './components/instantiate';
import { isDirectionSensitive } from './components/direction';
import { containerReads, type InstanceContainer } from './components/container';
import type { SpecContainerClassSet } from './containerClasses';
import { type Library, type TextFile, loadLibrary } from './components/library';
import { type Origin, screenFromSource } from './components/origin';
import type { IconSet } from './components/icons';
import { isIntrinsicSize } from './components/layoutValues';
import { expressionPx, fitComponentSize, resolveSizing } from './components/sizing';
import { type ResolvedTokens, resolveTokens } from './components/tokens';
import type { LibraryIssue } from './library';
import { isRecord } from './isRecord';
import { imageFieldRefs } from './libraryImages';
import { isPackageImagePath } from './components/imagePath';
import { libraryIssue } from './libraryIssue';
import { modelMessage, rawMessage, type ModelMessage } from './modelMessage';
import {
  MODEL_MESSAGE_TEMPLATES,
  fillTemplate,
  isModelMessageTemplateCode,
  templateMessage,
  type ModelMessageTemplateCode,
} from './messages';
import type { Spec, SpecAnnotationType } from './spec';

// Level 3 of the library validator: the drawing proof. It instantiates each component with the
// values of the `preview` and of each values example, at the initial size, and passes each
// external-system example through the declaration (`origins`). Pure: receives everything already
// read (`library.ts` builds the context) and never reads disk or network.
//
// Order of the issues (fixed, the tests depend on it): types in the specialization's order
// (layers and types in order); in each type with a valid component, first the `preview` (or the
// default values, when the component has no `preview`), then each values example, always at the
// `size` (the `minSize` is not drawn: the warning about content larger than the box at it only
// serves whoever writes the component, not whoever views the preview); then the type's
// external-system examples; finally the example screens of each origin, in the order of
// `origins`.
//
// Text measurement is the approximate one (`approximateMeasurer`): whoever really draws uses the
// browser's, so the drawing engine's warnings carry `(approximate)` at the end.

/**
 * Size of the frame that receives the node of an external-system example (a component, not a
 * screen).
 */
const NODE_SCREEN = 1000;

/** Suffix of the warnings that depend on the text measurement. */
export const APPROXIMATE_SUFFIX = ' (approximate)';

export interface DrawingContext {
  readonly spec: Spec;
  readonly specPath: string;
  /** Path of a file cited by the specialization, relative to the package root. */
  readonly resolve: (ref: string) => string;
  /** Valid components, by resolved path. */
  readonly components: ReadonlyMap<string, ComponentFile>;
  /**
   * JSON already read from a file (external example), by resolved path; missing or invalid =
   * `undefined`.
   */
  readonly jsonOf: (path: string) => unknown;
  /** The package's `.json` files with text, the specialization first (feeds `loadLibrary`). */
  readonly textFiles: readonly TextFile[];
  /** The specialization's icon set (`icons`), when the file is valid. */
  readonly icons?: IconSet;
  /** Is the file (resolved path) in the package? Without it, no package image is reported missing. */
  readonly hasFile?: (path: string) => boolean;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The engine's "field not provided" for a field the type does not even declare: level 2 already
 * gave the error.
 */
const NOT_INFORMED_CODE: ModelMessageTemplateCode = 'engine.fieldMissing';

/**
 * The engine warning with the approximate-measure suffix (the warning goes in `detail`, which the
 * interface translates).
 */
const approximate = (message: ModelMessage): ModelMessage => {
  const params = { reason: message.text };
  const text = fillTemplate(MODEL_MESSAGE_TEMPLATES['engine.approximate'], params);
  return modelMessage('engine.approximate', params, text, message);
};

export function defaultValues(
  type: SpecAnnotationType,
): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {};
  for (const field of type.fields) {
    values[field.key] =
      field.type === 'table' || field.type === 'ref' ? null : (field.default ?? null);
  }
  return values;
}

/**
 * The warning that only appears in `rtl`: the engine's with the "in rtl" prefix (the warning goes
 * in `detail`, which the interface translates).
 */
const inRtl = (message: ModelMessage): ModelMessage => {
  const params = { reason: message.text };
  const text = fillTemplate(MODEL_MESSAGE_TEMPLATES['engine.inRtl'], params);
  return modelMessage('engine.inRtl', params, text, message);
};

/**
 * The warning that only a container class gives, with its prefix ("in container window=expanded: ..."): the
 * author sees which class to fix. The `container` is `<set>=<class>`.
 */
const inContainer = (message: ModelMessage, container: string): ModelMessage => {
  const params = { container, reason: message.text };
  const text = fillTemplate(MODEL_MESSAGE_TEMPLATES['engine.inContainer'], params);
  return modelMessage('engine.inContainer', params, text, message);
};

/** The case proved: one proof code per case and per whether there is a mode (see `drawCode`). */
type DrawKind = 'defaults' | 'preview' | 'example';

interface DrawCase {
  readonly kind: DrawKind;
  /** Name of the example (only in the `example` case). */
  readonly name?: string;
  readonly values: FieldValues;
  readonly file: string;
  readonly path: string;
}

function drawCases(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
): DrawCase[] {
  const defaults = defaultValues(type);
  const cases: DrawCase[] = [
    component.preview === undefined
      ? { kind: 'defaults', values: defaults, file: componentPath, path: '' }
      : {
          kind: 'preview',
          values: { ...defaults, ...component.preview },
          file: componentPath,
          path: 'preview',
        },
  ];
  (type.examples ?? []).forEach((example, index) => {
    if (example.values === undefined) return;
    cases.push({
      kind: 'example',
      name: example.name,
      values: { ...defaults, ...example.values },
      file: specPath,
      path: `${basePath}.examples[${index}]`,
    });
  });
  return cases;
}

const DRAW_CODES = {
  defaults: ['library.draw.defaults', 'library.draw.defaultsMode'],
  preview: ['library.draw.preview', 'library.draw.previewMode'],
  example: ['library.draw.example', 'library.draw.exampleMode'],
} as const satisfies Record<
  DrawKind,
  readonly [ModelMessageTemplateCode, ModelMessageTemplateCode]
>;

/**
 * The same cases drawn at the size fitted to the content (decision 10 of #898): "fitted size W×H".
 */
const FITTED_DRAW_CODES = {
  defaults: ['library.drawFitted.defaults', 'library.drawFitted.defaultsMode'],
  preview: ['library.drawFitted.preview', 'library.drawFitted.previewMode'],
  example: ['library.drawFitted.example', 'library.drawFitted.exampleMode'],
} as const satisfies Record<
  DrawKind,
  readonly [ModelMessageTemplateCode, ModelMessageTemplateCode]
>;

/**
 * The case's message code, with or without a mode (one code per variant, whole text in the
 * catalog).
 */
function drawCode(
  kind: DrawKind,
  withMode: boolean,
  fitted: boolean,
): ModelMessageTemplateCode {
  return (fitted ? FITTED_DRAW_CODES : DRAW_CODES)[kind][withMode ? 1 : 0];
}

/**
 * The modes in which the proof runs: each mode of `tokens` with its resolved table (as the
 * drawing does with `resolvedTokensByMode`); without `tokens`, a single pass, no mode in the message.
 */
function drawingModes(spec: Spec): DrawingMode[] {
  const tokens = spec.tokens;
  if (tokens === undefined || tokens.modes.length === 0) return [{}];
  return tokens.modes.map((mode) => ({ mode, tokens: resolveTokens(tokens, {}, mode) }));
}

type DrawingMode = { mode?: string; tokens?: ResolvedTokens };

const sameBox = (a: Box, b: Box): boolean => a.width === b.width && a.height === b.height;

/**
 * The fitted size fits the content by construction (it measures the content, and `min*` only
 * increases it): proving it is only worth it when something holds it back, the root's
 * `maxWidth`/`maxHeight` on a measured axis or the px that an expression gives the axis.
 * Without that, the case at `size` is already what matters, and the proof's cost does not double.
 */
function fitCanOverflow(
  component: ComponentFile,
  values: FieldValues,
  tokens?: ResolvedTokens,
): boolean {
  const sizing = resolveSizing(component, values, tokens);
  const root = component.template;
  const capped = {
    width: root.maxWidth !== undefined,
    height: root.maxHeight !== undefined,
  };
  return (['width', 'height'] as const).some((axis) => {
    const resolved = sizing[axis];
    const measured = resolved.spec === 'hug' || isIntrinsicSize(resolved.spec);
    return expressionPx(resolved) !== undefined || (measured && capped[axis]);
  });
}

/**
 * The case's fitted size (that of the fit, with the case's values and the tokens of the given
 * mode); `undefined` if the component has no axis that depends on the content or if the fit
 * gives `size` (the case at `size` already proves it).
 */
function fittedBox(
  component: ComponentFile,
  values: FieldValues,
  mode: DrawingMode | undefined,
): Box | undefined {
  try {
    const tokens = mode?.tokens;
    if (!fitCanOverflow(component, values, tokens)) return undefined;
    const fit = fitComponentSize(component, values, {
      measure: approximateMeasurer,
      ...(tokens === undefined ? {} : { tokens }),
    });
    if (fit === undefined) return undefined;
    const box: Box = { x: 0, y: 0, width: fit.width, height: fit.height };
    return sameBox(box, { x: 0, y: 0, ...component.size }) ? undefined : box;
  } catch {
    return undefined;
  }
}

/** The result of proving a case in a mode: the engine's warnings or the error of an exception. */
interface ModeResult {
  readonly mode: string | undefined;
  readonly box: Box;
  readonly texts: ModelMessage[];
  readonly error: string | undefined;
}

/**
 * Proves a case in each mode, at one size per mode, in `ltr` and then in `rtl`: the warning that
 * holds in every mode is reported once; an `rtl` one that the `ltr` of the same mode already gave
 * is not repeated, and what only `rtl` gives is reported with the "in rtl" prefix (a component
 * that overflows only in `rtl` is a problem of its own).
 */
function proveCase(
  type: SpecAnnotationType,
  component: ComponentFile,
  drawCase: DrawCase,
  modes: readonly DrawingMode[],
  boxes: readonly Box[],
  fitted: boolean,
  sets: readonly SpecContainerClassSet[],
  out: LibraryIssue[],
): void {
  const keys = new Set(type.fields.map((f) => f.key));
  const issue = (
    mode: string | undefined,
    box: Box,
    detail: ModelMessage,
    severity: 'warning' | 'error',
  ) =>
    libraryIssue(
      severity,
      drawCase.file,
      drawCase.path,
      drawCode(drawCase.kind, mode !== undefined, fitted),
      {
        typeId: type.id,
        ...(drawCase.name === undefined ? {} : { name: drawCase.name }),
        ...(mode === undefined ? {} : { mode }),
        size: `${box.width}×${box.height}`,
      },
      detail,
    );
  const run = (direction: Direction, container?: InstanceContainer): ModeResult[] =>
    modes.map(({ mode, tokens }, i): ModeResult => {
      try {
        const { messages } = instantiate(component, drawCase.values, boxes[i] as Box, {
          measure: approximateMeasurer,
          ...(tokens === undefined ? {} : { tokens }),
          ...(direction === 'rtl' ? { direction } : {}),
          ...(container === undefined ? {} : { container }),
        });
        // The `sizing` warning does not depend on the text measurement or the direction: it is
        // reported without the `(approximate)` suffix and only in the `ltr` pass.
        const sizing =
          fitted || direction === 'rtl'
            ? []
            : resolveSizing(component, drawCase.values, tokens, {
                ...(container === undefined ? {} : { container }),
              }).messages;
        return {
          mode,
          box: boxes[i] as Box,
          texts: [
            ...messages
              .filter((m) => {
                const key = String(m.params.key ?? '');
                return m.code !== NOT_INFORMED_CODE || key === '' || keys.has(key);
              })
              .map(approximate),
            ...sizing,
          ],
          error: undefined,
        };
      } catch (error) {
        return { mode, box: boxes[i] as Box, texts: [], error: messageOf(error) };
      }
    });
  // The warning that holds in every mode is reported once, without a mode; what depends on the mode
  // cites the mode.
  const emit = (perMode: readonly ModeResult[]): void => {
    const first = boxes[0] as Box;
    const common =
      modes.length > 1 && boxes.every((b) => sameBox(b, first))
        ? (perMode[0]?.texts ?? []).filter((t) =>
            perMode.every(
              (m) => m.error === undefined && m.texts.some((x) => x.text === t.text),
            ),
          )
        : [];
    for (const message of common) out.push(issue(undefined, first, message, 'warning'));
    for (const { mode, box, texts, error } of perMode) {
      if (error !== undefined) {
        out.push(
          issue(mode, box, templateMessage('library.drawFailed', { error }), 'error'),
        );
        continue;
      }
      for (const message of texts) {
        if (!common.some((c) => c.text === message.text))
          out.push(issue(mode, box, message, 'warning'));
      }
    }
  };
  const ltr = run('ltr');
  emit(ltr);
  // The `rtl` pass only runs on the direction-sensitive component (`isDirectionSensitive`): on
  // the others it would cost double to repeat, mirrored, the same warnings as `ltr`.
  if (isDirectionSensitive(component)) emit(beyond(ltr, run('rtl'), inRtl));
  // A component that reads the container is proved once per class of each set it reads (the sum, not the
  // product) beside the pass without a container; only what a class gives beyond that pass is reported.
  for (const pass of containerPasses(component, sets))
    emit(
      beyond(ltr, run('ltr', pass.container), (message) =>
        inContainer(message, pass.label),
      ),
    );
}

interface ContainerPass {
  /** `<set>=<class>`, what the message cites. */
  readonly label: string;
  readonly container: InstanceContainer;
}

/** One pass per class of each set (declared by the specialization) that the component reads. */
function containerPasses(
  component: ComponentFile,
  sets: readonly SpecContainerClassSet[],
): ContainerPass[] {
  const reads = containerReads(component);
  return sets
    .filter((set) => reads.has(set.id))
    .flatMap((set) =>
      set.classes.map((cls) => ({
        label: `${set.id}=${cls.id}`,
        container: { classes: { [set.id]: cls.id } },
      })),
    );
}

/**
 * What another pass (`rtl`, a container class) gives beyond the `ltr` pass of the same mode: new warnings with
 * the pass's prefix (`wrap`); an error only that pass throws likewise.
 */
function beyond(
  base: readonly ModeResult[],
  other: readonly ModeResult[],
  wrap: (message: ModelMessage) => ModelMessage,
): ModeResult[] {
  return other.map((r, i) => {
    const first = base[i] as ModeResult;
    if (r.error !== undefined) {
      return {
        ...r,
        error: undefined,
        texts:
          first.error === undefined
            ? [wrap(templateMessage('library.drawFailed', { error: r.error }))]
            : [],
      };
    }
    const seen = new Set(first.texts.map((t) => t.text));
    return { ...r, texts: r.texts.filter((t) => !seen.has(t.text)).map(wrap) };
  });
}

function typeDrawing(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
  modes: readonly DrawingMode[],
  sets: readonly SpecContainerClassSet[],
  out: LibraryIssue[],
): void {
  const box: Box = { x: 0, y: 0, ...component.size };
  for (const drawCase of drawCases(type, component, componentPath, specPath, basePath)) {
    proveCase(
      type,
      component,
      drawCase,
      modes,
      modes.map(() => box),
      false,
      sets,
      out,
    );
    // Component with an axis that depends on the content: the same case at the fitted size.
    // Each mode fits with its own tokens: a `padding` or a `sizing` from a token changes the size.
    const fits = modes.map((mode) => fittedBox(component, drawCase.values, mode));
    if (fits.some((fit) => fit !== undefined))
      proveCase(
        type,
        component,
        drawCase,
        modes,
        fits.map((fit) => fit ?? box),
        true,
        sets,
        out,
      );
  }
}

/**
 * Engine library to prove the external examples; `undefined` (and the reason) if it cannot be
 * built.
 */
function buildLibrary(ctx: DrawingContext): { library?: Library; reason?: string } {
  try {
    return { library: loadLibrary(ctx.textFiles) };
  } catch (error) {
    return { reason: messageOf(error) };
  }
}

/**
 * Library with the origin replaced by a synthetic one that reads the JSON `{ node }` as the sole
 * root of a large frame: only the node's drawing matters, not the declared origin's `screen`.
 */
export function nodeProbeLibrary(lib: Library, origin: Origin): Library {
  return {
    ...lib,
    origins: [
      {
        ...origin,
        screen: { width: NODE_SCREEN, height: NODE_SCREEN, roots: [{ path: 'node' }] },
      },
    ],
  };
}

/** Removes the `node.` that the synthetic frame puts in front of an origin warning's path. */
export const withoutNodePrefix = (message: string): string =>
  message.replace(/^node\.?/, '');

/** The translation error as `detail`: with a code, or the raw text (an engine exception). */
function errorDetail(
  result: { readonly error?: string; readonly errorMessage?: ModelMessage },
  strip: (text: string) => string = (text) => text,
): ModelMessage {
  return result.errorMessage ?? rawMessage(strip(result.error ?? ''));
}

/**
 * The origin warning without the `node.` that the synthetic frame puts in front of the path: the
 * parameter's `path` loses the prefix and the text is rebuilt (equal to `withoutNodePrefix(text)`).
 */
export function withoutNodePrefixMessage(message: ModelMessage): ModelMessage {
  const path = message.params.path;
  if (typeof path === 'string' && isModelMessageTemplateCode(message.code))
    return templateMessage(message.code, {
      ...message.params,
      path: withoutNodePrefix(path),
    });
  // Without `path` (or without translation): the text loses the prefix, as before, and no longer
  // has a code.
  const text = withoutNodePrefix(message.text);
  return text === message.text ? message : rawMessage(text);
}

/**
 * The valid components with the inner ones their `component` nodes draw (`resolvedComponents`,
 * decision 8 of #2093), by resolved path: level 3 draws a composed component as the app does.
 */
function nestedComponents(ctx: DrawingContext): ReadonlyMap<string, ComponentFile> {
  const byType = new Map<string, ComponentFile>();
  const paths = new Map<string, string>();
  const fields = new Map<string, ResolvedComponentField[]>();
  for (const layer of ctx.spec.layers)
    for (const type of layer.annotationTypes) {
      if (type.component === undefined) continue;
      const path = ctx.resolve(type.component);
      const component = ctx.components.get(path);
      if (component === undefined) continue;
      byType.set(type.id, component);
      paths.set(type.id, path);
      fields.set(type.id, resolvedFields(type.fields));
    }
  const attached = attachResolvedComponents(byType, (id) => fields.get(id));
  const out = new Map(ctx.components);
  for (const [id, component] of attached) out.set(paths.get(id) as string, component);
  return out;
}

/** A string that names a package image, from a value of the case (trimmed like the engine does). */
const imagePathOf = (value: unknown): string | undefined =>
  typeof value === 'string' && isPackageImagePath(value.trim())
    ? value.trim()
    : undefined;

/** The texts a field value offers to an image `src` bound to `ref`: its own, or a column of the table's rows. */
function imageValueTexts(
  values: Readonly<Record<string, unknown>>,
  ref: { readonly key: string; readonly table: string | undefined },
  prefix: string,
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const own = imagePathOf(values[ref.key]);
  if (own !== undefined) out.push({ path: `${prefix}.${ref.key}`, text: own });
  const rows = ref.table === undefined ? undefined : values[ref.table];
  if (Array.isArray(rows)) {
    rows.forEach((row: unknown, index) => {
      const text = isRecord(row) ? imagePathOf(row[ref.key]) : undefined;
      if (text !== undefined)
        out.push({ path: `${prefix}.${ref.table}[${index}].${ref.key}`, text });
    });
  }
  return out;
}

/**
 * Warning for each value of a case (`preview` or an example) that an image `src` reads, names a
 * package image and is not in the package: the drawing shows the placeholder.
 */
function missingImageValues(
  ctx: DrawingContext,
  component: ComponentFile,
  values: Readonly<Record<string, unknown>> | undefined,
  at: { readonly file: string; readonly prefix: string },
): LibraryIssue[] {
  const { hasFile } = ctx;
  if (hasFile === undefined || values === undefined) return [];
  const out: LibraryIssue[] = [];
  const seen = new Set<string>();
  for (const ref of imageFieldRefs(component.template)) {
    for (const { path, text } of imageValueTexts(values, ref, at.prefix)) {
      const target = ctx.resolve(text);
      if (hasFile(target) || seen.has(path)) continue;
      seen.add(path);
      out.push(
        libraryIssue('warning', at.file, path, 'library.imageValueMissing', {
          path: target,
        }),
      );
    }
  }
  return out;
}

export function drawingIssues(ctx: DrawingContext): LibraryIssue[] {
  const { spec, specPath } = ctx;
  const out: LibraryIssue[] = [];
  const nested = nestedComponents(ctx);
  const modes = drawingModes(spec);
  let built: { library?: Library; reason?: string } | undefined;
  const library = (): { library?: Library; reason?: string } => {
    built ??= buildLibrary(ctx);
    return built;
  };
  let warnedLibrary = false;
  const libraryOrWarn = (path: string): Library | undefined => {
    const { library: lib, reason } = library();
    if (lib === undefined && !warnedLibrary) {
      warnedLibrary = true;
      out.push(
        reason === undefined
          ? libraryIssue('warning', specPath, path, 'library.buildFailedUnknown')
          : libraryIssue('warning', specPath, path, 'library.buildFailed', { reason }),
      );
    }
    return lib;
  };

  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const basePath = `layers[${li}].annotationTypes[${ti}]`;
      if (type.component === undefined) return;
      const componentPath = ctx.resolve(type.component);
      const loaded = nested.get(componentPath);
      if (loaded === undefined) return;
      const component =
        ctx.icons === undefined ? loaded : { ...loaded, resolvedIcons: ctx.icons };
      typeDrawing(
        type,
        component,
        componentPath,
        specPath,
        basePath,
        modes,
        spec.containerClasses ?? [],
        out,
      );
      out.push(
        ...missingImageValues(ctx, component, component.preview, {
          file: componentPath,
          prefix: 'preview',
        }),
      );
      (type.examples ?? []).forEach((example, index) => {
        out.push(
          ...missingImageValues(ctx, component, example.values, {
            file: specPath,
            prefix: `${basePath}.examples[${index}].values`,
          }),
        );
      });

      (type.examples ?? []).forEach((example, index) => {
        if (example.system === undefined || example.file === undefined) return;
        const at = `${basePath}.examples[${index}].file`;
        const json = ctx.jsonOf(ctx.resolve(example.file));
        if (json === undefined) return;
        const lib = libraryOrWarn(at);
        const origin = lib?.origins.find((o) => o.system === example.system);
        if (lib === undefined || origin === undefined) return;
        // The example's node goes to a synthetic origin that reads it as the sole root of a large
        // frame: only the node's drawing matters, not the declared origin's `screen`.
        const probe = nodeProbeLibrary(lib, origin);
        const result = screenFromSource(
          probe,
          { node: json },
          { system: origin.system, measure: approximateMeasurer },
        );
        const params = { name: example.name, system: origin.system };
        const systemIssue = (severity: 'error' | 'warning', detail: ModelMessage) =>
          libraryIssue(severity, specPath, at, 'library.systemExample', params, detail);
        if (result.error !== undefined) {
          out.push(systemIssue('error', errorDetail(result, withoutNodePrefix)));
          return;
        }
        for (const message of result.messages)
          out.push(systemIssue('warning', withoutNodePrefixMessage(message)));
        const root = result.screen?.instances.find((i) => i.parentId === undefined);
        if (root !== undefined && root.typeId !== type.id) {
          out.push(
            libraryIssue('warning', specPath, at, 'library.systemExampleType', {
              ...params,
              found: root.typeId,
              typeId: type.id,
            }),
          );
        }
      });
    });
  });

  (spec.origins ?? []).forEach((origin, oi) => {
    (origin.examples ?? []).forEach((example, ei) => {
      const at = `origins[${oi}].examples[${ei}].file`;
      const json = ctx.jsonOf(ctx.resolve(example.file));
      if (json === undefined) return;
      const lib = libraryOrWarn(at);
      if (lib === undefined) return;
      const result = screenFromSource(lib, json, {
        system: origin.system,
        measure: approximateMeasurer,
      });
      const params = { name: example.name, system: origin.system };
      const screenIssue = (severity: 'error' | 'warning', detail: ModelMessage) =>
        libraryIssue(severity, specPath, at, 'library.originScreen', params, detail);
      if (result.error !== undefined) {
        out.push(screenIssue('error', errorDetail(result)));
        return;
      }
      for (const message of result.messages) out.push(screenIssue('warning', message));
    });
  });
  return out;
}
