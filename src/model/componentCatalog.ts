import { findSlot } from './components/arrange';
import type { ComponentFile } from './components/componentFormat';
import { parseIconsText, type IconSet } from './components/icons';
import { resolvePathChecked } from './components/library';
import { parseComponentText } from './components/parseComponent';
import { resolveTokens, type HostFonts, type ResolvedTokens } from './components/tokens';
import { effectiveDensity, unitsToPixels } from './density';
import { MIN_STORED_MARKING_SIZE } from './geometry';
import {
  issueParts,
  modelMessage,
  type IssueLike,
  type ModelMessage,
} from './modelMessage';
import { projectIndex } from './projectIndex';
import type { Spec, SpecAnnotationType } from './spec';
import { findSpecType } from './specLookup';
import type { Annotation, Project } from './types';

// Component catalog (Library stage, B3): the components of the applied specializations
// (package `specs/<id>/`, `formatVersion` 4), read once and kept in memory. `mapping.json` never
// stores the drawing: the catalog is built by whoever reads the files (session, MCP) and handed
// to the model's pure functions. No DOM, no disk reads.

export interface SpecComponents {
  readonly specId: string;
  /** Version of the specialization the components were read from. */
  readonly version: number;
  /** Type id → valid component. */
  readonly byType: ReadonlyMap<string, ComponentFile>;
  /** `"type: reason"` of the components that did not load (pt-BR text; the MCP reads this one). */
  readonly problems: readonly string[];
  /** The same problems, with a code and parameters for the interface: same size and order. */
  readonly problemMessages: readonly ModelMessage[];
}

/** By specialization id. */
export type ComponentCatalog = ReadonlyMap<string, SpecComponents>;

export const EMPTY_CATALOG: ComponentCatalog = new Map();

/** Types of the specialization that cite a component, in the order of the layers and types. */
function typesWithComponent(
  spec: Spec,
): readonly { readonly id: string; readonly component: string }[] {
  const types: { id: string; component: string }[] = [];
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (type.component !== undefined) {
        types.push({ id: type.id, component: type.component });
      }
    }
  }
  return types;
}

/**
 * Paths (relative to the project root) of the component files cited by the specialization,
 * without repeats, in the order of the types. `specFile` is the specialization file
 * (`specs/material3/material3.spec.json`): the type's `component` is relative to it.
 */
export function componentPaths(spec: Spec, specFile: string): string[] {
  const paths = new Set<string>();
  for (const type of typesWithComponent(spec)) {
    const path = resolvePathChecked(specFile, type.component);
    if (path !== undefined) paths.add(path);
  }
  // The icon set (`icons`) is read along with them: the components depend on it to draw.
  const icons =
    spec.icons === undefined ? undefined : resolvePathChecked(specFile, spec.icons);
  if (icons !== undefined) paths.add(icons);
  return [...paths];
}

/** The load problems: the pt-BR text and the message with a code, always pushed together. */
export interface LoadProblems {
  readonly texts: string[];
  readonly messages: ModelMessage[];
}

/** The only place that records a problem (keeps `problems` and `problemMessages` paired). */
export function pushProblem(problems: LoadProblems, message: ModelMessage): void {
  problems.texts.push(message.text);
  problems.messages.push(message);
}

/** The component that failed to parse: the error comes from the parser (text); with no error, the default. */
function invalidComponent(typeId: string, issue: IssueLike | undefined): ModelMessage {
  if (issue === undefined) {
    return modelMessage(
      'components.invalidFallback',
      { typeId },
      `${typeId}: componente inválido`,
    );
  }
  const { at, reason, reasonParam, detail } = issueParts(issue);
  return modelMessage(
    'components.invalid',
    { typeId, at, ...reasonParam },
    `${typeId}: ${at}${reason}`,
    detail,
  );
}

/** The specialization's icon set; a missing or invalid file becomes an `icons: …` problem. */
function loadIcons(
  spec: Spec,
  specFile: string,
  readText: (projectPath: string) => string | undefined,
  problems: LoadProblems,
): IconSet | undefined {
  if (spec.icons === undefined) return undefined;
  const path = resolvePathChecked(specFile, spec.icons);
  if (path === undefined) {
    pushProblem(
      problems,
      modelMessage(
        'icons.outsideLibrary',
        { path: spec.icons },
        `icons: caminho fora da biblioteca: ${spec.icons}`,
      ),
    );
    return undefined;
  }
  const text = readText(path);
  if (text === undefined) {
    pushProblem(
      problems,
      modelMessage('icons.fileMissing', { path }, `icons: arquivo ausente (${path})`),
    );
    return undefined;
  }
  const parsed = parseIconsText(text);
  if (parsed.ok) return parsed.set;
  const issue = parsed.issues[0];
  if (issue === undefined) {
    pushProblem(
      problems,
      modelMessage('icons.invalidFallback', {}, 'icons: conjunto de ícones inválido'),
    );
    return undefined;
  }
  const { at, reason, reasonParam, detail } = issueParts(issue);
  pushProblem(
    problems,
    modelMessage(
      'icons.invalid',
      { at, ...reasonParam },
      `icons: ${at}${reason}`,
      detail,
    ),
  );
  return undefined;
}

/** What comes from outside the model on load: the host font and the drawing mode. */
export interface LoadOptions {
  /** The theme's `--font-sans`/`--font-mono` stack (or what the host uses); absent = generic. */
  readonly fonts?: HostFonts;
  /** Mode of the specialization's `tokens`; absent or undeclared = the first. */
  readonly mode?: string;
}

/** The token table of each declared mode (without `tokens`: none). */
function tokensByMode(
  spec: Spec,
  fonts: HostFonts,
): Readonly<Record<string, ResolvedTokens>> | undefined {
  if (spec.tokens === undefined) return undefined;
  return Object.fromEntries(
    spec.tokens.modes.map((mode) => [mode, resolveTokens(spec.tokens, fonts, mode)]),
  );
}

/**
 * Reads and validates the specialization's components. `readText` returns the text of a path
 * from the project root, or `undefined` if the file does not exist. A bad component becomes a
 * `"<type>: <reason>"` problem and the type is left with no component (its markings stay
 * ordinary). A v1 to v3 specialization, or one without `component`, gives an empty `byType`.
 */
export function loadSpecComponents(
  spec: Spec,
  specFile: string,
  version: number,
  readText: (projectPath: string) => string | undefined,
  options: LoadOptions = {},
): SpecComponents {
  const byType = new Map<string, ComponentFile>();
  const problems: LoadProblems = { texts: [], messages: [] };
  const fonts = options.fonts ?? {};
  const resolvedTokens = resolveTokens(spec.tokens, fonts, options.mode);
  const resolvedTokensByMode = tokensByMode(spec, fonts);
  if (spec.formatVersion >= 4) {
    const resolvedIcons = loadIcons(spec, specFile, readText, problems);
    for (const type of typesWithComponent(spec)) {
      const path = resolvePathChecked(specFile, type.component);
      if (path === undefined) {
        pushProblem(
          problems,
          modelMessage(
            'components.outsideLibrary',
            { typeId: type.id, path: type.component },
            `${type.id}: caminho fora da biblioteca: ${type.component}`,
          ),
        );
        continue;
      }
      const text = readText(path);
      if (text === undefined) {
        pushProblem(
          problems,
          modelMessage(
            'components.fileMissing',
            { typeId: type.id, path },
            `${type.id}: arquivo ausente (${path})`,
          ),
        );
        continue;
      }
      const parsed = parseComponentText(text);
      if (!parsed.ok) {
        pushProblem(problems, invalidComponent(type.id, parsed.issues[0]));
        continue;
      }
      byType.set(type.id, {
        ...parsed.component,
        resolvedTokens,
        resolvedTokensByMode,
        ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
      });
    }
  }
  return {
    specId: spec.id,
    version,
    byType,
    problems: problems.texts,
    problemMessages: problems.messages,
  };
}

export interface MarkingComponent {
  /** The typed annotation that draws the marking. */
  readonly annotation: Annotation;
  readonly specId: string;
  readonly typeId: string;
  readonly type: SpecAnnotationType;
  readonly component: ComponentFile;
}

/**
 * The annotation that draws the marking, or `null`: the **first** typed annotation owned by the
 * marking (in the order of `annotations`) whose type has a component in the catalog, with the
 * catalog version equal to the applied specialization's. Inherited ones do not draw (they are the
 * "template"). Without a component the marking is ordinary.
 */
export function markingComponent(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): MarkingComponent | null {
  if (catalog.size === 0) return null;
  const index = projectIndex(p);
  for (const annotation of index.annotationsByMarking.get(markingId) ?? []) {
    if (annotation.type === null || annotation.values === null) continue;
    const { specId, typeId } = annotation.type;
    const components = catalog.get(specId);
    if (components === undefined) continue;
    if (index.specializations.get(specId)?.version !== components.version) continue;
    const component = components.byType.get(typeId);
    if (component === undefined) continue;
    const resolved = findSpecType(p, annotation.type);
    if (resolved === null) continue;
    return { annotation, specId, typeId, type: resolved.type, component };
  }
  return null;
}

/**
 * Name of the type the marking draws: that of the first own annotation whose type declares a
 * component, or `null`. It does not use the component catalog (deliberately): the label of an
 * unnamed instance works anywhere that has the project, without reading files.
 */
export function markingTypeName(p: Project, markingId: string): string | null {
  for (const annotation of projectIndex(p).annotationsByMarking.get(markingId) ?? []) {
    if (annotation.type === null || annotation.values === null) continue;
    const resolved = findSpecType(p, annotation.type);
    if (resolved !== null && resolved.type.component !== undefined) {
      return resolved.type.name;
    }
  }
  return null;
}

/** Component with a slot: the component has a slot that receives child markings. */
export function hasSlotComponent(component: ComponentFile): boolean {
  return findSlot(component) !== undefined;
}

/**
 * Minimum of the component that draws the marking, in image pixels: its `minSize` (in units) ×
 * the container density, rounded up, or, without `minSize`, 1×1 (a marking with a component
 * accepts from 1 px); `null` on an ordinary marking (the 8 px minimum of the gestures applies).
 */
export function componentMinSize(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): { width: number; height: number } | null {
  const drawn = markingComponent(p, catalog, markingId);
  if (drawn === null) return null;
  const marking = projectIndex(p).markings.get(markingId);
  return componentFileMinSize(
    drawn.component,
    effectiveDensity(p, marking?.containerId ?? null),
  );
}

/** The minimum size of an instance of the component: its `minSize` or the smallest storable. */
export function componentFileMinSize(
  component: ComponentFile,
  density = 1,
): {
  width: number;
  height: number;
} {
  const { minSize } = component;
  return {
    width: minSize ? unitsToPixels(minSize.width, density) : MIN_STORED_MARKING_SIZE,
    height: minSize ? unitsToPixels(minSize.height, density) : MIN_STORED_MARKING_SIZE,
  };
}
