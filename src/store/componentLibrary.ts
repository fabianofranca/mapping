import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  EMPTY_CATALOG,
  componentPaths,
  loadSpecComponents,
  rawMessage,
  packageDirOf,
  type ComponentCatalog,
  type Project,
  type ProjectSpecialization,
  type Spec,
  type SpecComponents,
} from '../model';
import { readHostFonts } from '../canvas/theme';
import { resolvePath, type LoadedFont } from '../model/components/library';
import { createFontRegistry, type FontRegistry, type FontStatus } from '../storage/fonts';
import { reportError } from '../utils/report';
import { createFontSync } from './fontSync';
import { createPendingTracker } from './pendingTracker';

// A project's component library (Library stage, B3): the catalog and the sources of the applied
// specializations, read from the `specs/<id>/` packages and kept in memory. Session state, never
// the project's: `mapping.json` stores nothing about the drawing.
// The session creates it, since it knows how to read storage and holds the packages not yet written.

export interface ComponentLibrary {
  /** Components of the specializations applied to the confirmed project (only those already loaded). */
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /** Sobe a cada registro de fontes terminado: os desenhos remedem. */
  readonly fontsEpoch: ReadonlySignal<number>;
  /** Status of each declared source (for Diagnostics). */
  readonly fonts: ReadonlySignal<readonly FontStatus[]>;
  /** Resolves when what was requested has finished loading (tests). */
  whenIdle(): Promise<void>;
  /**
   * Forgets what was read: the packages are read again (an external reload may have changed
   * the files without changing the version). The current catalog stays until the new one arrives, without flicker.
   */
  invalidate(): void;
  dispose(): void;
}

export interface ComponentLibraryDeps {
  /** O projeto confirmado (`store.committed`). */
  readonly project: ReadonlySignal<Project | null>;
  /** Texto de um arquivo do projeto (`specs/<id>/components/x.json`), ou `null`. */
  readonly readText: (path: string) => Promise<string | null>;
  /** Bytes de um arquivo do projeto (fontes), ou `null`. */
  readonly readBytes: (path: string) => Promise<ArrayBuffer | null>;
  /**
   * In-memory package of the session (apply or update not yet written; undo), by id and
   * version: path relative to the package folder → text or `Blob`.
   */
  readonly cached?: (
    specId: string,
    version: number,
  ) => ReadonlyMap<string, string | Blob> | undefined;
  /** Default: `createFontRegistry()`. */
  readonly fonts?: FontRegistry;
}

const keyOf = (s: { readonly id: string; readonly version: number }): string =>
  `${s.id}@${s.version}`;

/** Specialization with a folder package and loaded content: the only one that has components. */
function hasPackage(s: ProjectSpecialization): boolean {
  return s.spec !== null && packageDirOf(s.file) !== null;
}

/** Font declared by the specialization (`spec.fonts`) as the font registry receives it (no bytes). */
export function fontDeclaration(
  specFile: string,
  font: NonNullable<Spec['fonts']>[number],
): LoadedFont {
  const weight =
    typeof font.weight === 'number'
      ? String(font.weight)
      : typeof font.weight === 'string' && font.weight.trim() !== ''
        ? font.weight.trim()
        : '400';
  return {
    family: font.family,
    weight,
    style: font.style === 'italic' ? 'italic' : 'normal',
    path: resolvePath(specFile, font.file),
  };
}

interface DeclaredFont {
  readonly owner: ProjectSpecialization;
  readonly font: LoadedFont;
}

/** Fonts declared (`spec.fonts`) by the specializations with a package, in project order. */
function declaredFonts(p: Project | null): DeclaredFont[] {
  const out: DeclaredFont[] = [];
  if (!p) return out;
  for (const owner of p.specializations) {
    if (!hasPackage(owner)) continue;
    for (const font of owner.spec?.fonts ?? []) {
      out.push({ owner, font: fontDeclaration(owner.file, font) });
    }
  }
  return out;
}

/**
 * Reads the component files the specialization cites (`read` returns the text of a path
 * from the project root, or `null`) and builds the components. Whoever reads decides from where: `specs/<id>/`,
 * the session's in-memory copy or `proposals/<id>/` (the Proposed catalog).
 */
export async function readSpecComponents(
  spec: Spec,
  specFile: string,
  version: number,
  read: (path: string) => Promise<string | null>,
): Promise<SpecComponents> {
  const texts = new Map<string, string>();
  const paths = componentPaths(spec, specFile);
  const contents = await Promise.all(paths.map((path) => read(path)));
  paths.forEach((path, i) => {
    const text = contents[i];
    if (text !== null && text !== undefined) texts.set(path, text);
  });
  return loadSpecComponents(spec, specFile, version, (path) => texts.get(path), {
    fonts: readHostFonts(),
  });
}

/** Empty entry with the reason: without it, each project edit would try to read again. */
export function failedComponents(
  specId: string,
  version: number,
  error: unknown,
): SpecComponents {
  reportError('components.load', error);
  const message = error instanceof Error ? error.message : String(error);
  return {
    specId,
    version,
    byType: new Map(),
    problems: [message],
    problemMessages: [rawMessage(message)],
  };
}

export function sameCatalog(a: ComponentCatalog, b: ComponentCatalog): boolean {
  if (a.size !== b.size) return false;
  for (const [id, components] of a) if (b.get(id) !== components) return false;
  return true;
}

export function createComponentLibrary(deps: ComponentLibraryDeps): ComponentLibrary {
  const registry = deps.fonts ?? createFontRegistry();
  /** By `id@version`: undoing an update finds the previous one again. */
  const entries = signal<ReadonlyMap<string, SpecComponents>>(new Map());
  const fontStatus = signal<readonly FontStatus[]>([]);
  const epoch = signal(0);
  /** Sobe em `invalidate`, para os efeitos lerem de novo. */
  const generation = signal(0);
  const loading = new Set<string>();
  /** Entries read before the last `invalidate`: they apply until the new one arrives. */
  const stale = new Set<string>();
  const { track, whenIdle } = createPendingTracker();
  let disposed = false;
  let current = 0;

  /** Reads a package file: from the session's in-memory copy and, otherwise, from storage. */
  async function readText(
    owner: ProjectSpecialization,
    path: string,
  ): Promise<string | null> {
    const hit = cachedFile(owner, path);
    if (hit !== undefined) return typeof hit === 'string' ? hit : hit.text();
    return deps.readText(path);
  }

  async function readBytes(
    owner: ProjectSpecialization,
    path: string,
  ): Promise<ArrayBuffer | null> {
    const hit = cachedFile(owner, path);
    if (hit !== undefined) {
      return typeof hit === 'string'
        ? new TextEncoder().encode(hit).buffer
        : hit.arrayBuffer();
    }
    return deps.readBytes(path);
  }

  function cachedFile(
    owner: ProjectSpecialization,
    path: string,
  ): string | Blob | undefined {
    const dir = packageDirOf(owner.file);
    if (dir === null || !path.startsWith(`${dir}/`)) return undefined;
    return deps.cached?.(owner.id, owner.version)?.get(path.slice(dir.length + 1));
  }

  async function loadEntry(owner: ProjectSpecialization): Promise<void> {
    const key = keyOf(owner);
    const run = current;
    // Lets the session finish what it does right after the action (keeping the package in memory).
    await Promise.resolve();
    let loaded: SpecComponents;
    try {
      const spec = owner.spec;
      if (spec === null) return;
      loaded = await readSpecComponents(spec, owner.file, owner.version, (path) =>
        readText(owner, path),
      );
    } catch (error) {
      loaded = failedComponents(owner.id, owner.version, error);
    } finally {
      if (run === current) loading.delete(key);
    }
    if (disposed || run !== current) return;
    stale.delete(key);
    entries.value = new Map(entries.peek()).set(key, loaded);
  }

  const stopEntries = effect(() => {
    void generation.value;
    const p = deps.project.value;
    if (!p) return;
    const have = entries.peek();
    for (const owner of p.specializations) {
      if (!hasPackage(owner)) continue;
      const key = keyOf(owner);
      if ((have.has(key) && !stale.has(key)) || loading.has(key)) continue;
      loading.add(key);
      void track(loadEntry(owner));
    }
  });

  let lastCatalog: ComponentCatalog = EMPTY_CATALOG;
  const catalog = computed((): ComponentCatalog => {
    const p = deps.project.value;
    const loaded = entries.value;
    const next = new Map<string, SpecComponents>();
    if (p) {
      for (const owner of p.specializations) {
        const components = loaded.get(keyOf(owner));
        if (components) next.set(owner.id, components);
      }
    }
    if (sameCatalog(next, lastCatalog)) return lastCatalog;
    lastCatalog = next.size === 0 ? EMPTY_CATALOG : next;
    return lastCatalog;
  });

  // Fonts: the declared set rarely changes; only then does it register again.
  const fontsKey = computed(() =>
    JSON.stringify(
      declaredFonts(deps.project.value).map(({ owner, font }) => [
        keyOf(owner),
        font.family,
        font.weight,
        font.style,
        font.path,
      ]),
    ),
  );
  let fontsRegistered = false;
  const fontSync = createFontSync({
    registry,
    isDisposed: () => disposed,
    onRegistered(status) {
      batch(() => {
        fontStatus.value = status;
        epoch.value++;
      });
    },
  });

  const stopFonts = effect(() => {
    void fontsKey.value;
    void generation.value;
    const declared = declaredFonts(deps.project.peek());
    // No fonts and nothing registered before: there is nothing to do nor to re-measure.
    if (declared.length === 0 && !fontsRegistered) return;
    fontsRegistered = declared.length > 0;
    void track(
      fontSync.start(
        declared,
        ({ font }) => font,
        ({ owner, font }) => readBytes(owner, font.path),
      ),
    );
  });

  return {
    catalog,
    fontsEpoch: epoch,
    fonts: fontStatus,
    whenIdle,
    invalidate() {
      current += 1;
      loading.clear();
      for (const key of entries.peek().keys()) stale.add(key);
      generation.value++;
    },
    dispose() {
      disposed = true;
      stopEntries();
      stopFonts();
      registry.clear();
    },
  };
}
