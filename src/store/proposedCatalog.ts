import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  EMPTY_CATALOG,
  isRecord,
  packageDirOf,
  proposalPackageDir,
  type ComponentCatalog,
  type Project,
  type Proposal,
  type Spec,
  type SpecComponents,
} from '../model';
import { createFontRegistry, type FontRegistry } from '../storage/fonts';
import {
  failedComponents,
  fontDeclaration,
  readSpecComponents,
  sameCatalog,
  type ComponentLibrary,
} from './componentLibrary';
import type { ComponentSources, ReviewView } from './derived';
import { createFontSync } from './fontSync';
import { createPendingTracker } from './pendingTracker';

// The component catalog of the Proposed view (Proposed with components stage, PC1): that of the
// applied library plus the packages the open proposal creates or updates, read from
// `proposals/<id>/<folder>/`. Read-only: nothing is written to `specs/`. It is review state, never
// project state; it is created by `createReviewState`, and the read happens when the proposal
// opens (not when the view changes or when a decision is made).

export interface ProposedComponents extends ComponentSources {
  /** Resolves when what was requested has finished loading (tests). */
  whenIdle(): Promise<void>;
  dispose(): void;
}

export interface ProposedComponentsDeps {
  /** The components of the applied specializations (the base, which holds outside Proposed). */
  readonly base: ComponentLibrary;
  /** The proposal open in the review; `null` outside it. */
  readonly proposal: ReadonlySignal<Proposal | null>;
  readonly view: ReadonlySignal<ReviewView>;
  /** The project in view (`review.derived.shownProject`): says which version each type uses. */
  readonly shown: ReadonlySignal<Project | null>;
  /** Bytes of a project file (`session.readImage`), or `null`. */
  readonly read: (path: string) => Promise<Blob | null>;
  /** Default: `createFontRegistry()`. */
  readonly fonts?: FontRegistry;
}

/** Package of a specialization that the proposal creates or updates and that is not yet applied. */
interface ProposedPackage {
  readonly proposalId: string;
  readonly specId: string;
  readonly version: number;
  /** `specs/<folder>`: where the package will be after being applied. */
  readonly dir: string;
  /** The specialization file (`specs/<folder>/x.spec.json`). */
  readonly file: string;
  readonly spec: Spec;
  /** Identity of the `spec` content: a `revise_proposal` that changes it without changing
   * `id@version` re-reads the package. */
  readonly signature: string;
}

const keyOf = (s: { readonly specId: string; readonly version: number }): string =>
  `${s.specId}@${s.version}`;

/** Packages of the not-yet-applied create/update `specialization` changes (rejected included). */
function proposedPackages(p: Proposal | null): ProposedPackage[] {
  const out: ProposedPackage[] = [];
  if (!p) return out;
  for (const c of p.changes) {
    if (c.entity !== 'specialization' || c.kind === 'remove' || !isRecord(c.to)) continue;
    if (Object.hasOwn(p.applied, c.id)) continue;
    const { id, version, file, spec } = c.to;
    if (typeof id !== 'string' || typeof version !== 'number') continue;
    if (typeof file !== 'string' || !isRecord(spec)) continue;
    const dir = packageDirOf(file);
    if (dir === null) continue;
    out.push({
      proposalId: p.id,
      specId: id,
      version,
      dir,
      file,
      spec: spec as unknown as Spec,
      signature: JSON.stringify(spec),
    });
  }
  return out;
}

/** Project path (`specs/<folder>/…`) of a package file → where it waits in `proposals/`. */
const stagedPath = (pkg: ProposedPackage, path: string): string | null =>
  path.startsWith(`${pkg.dir}/`)
    ? `${proposalPackageDir(pkg.proposalId, pkg.dir)}/${path.slice(pkg.dir.length + 1)}`
    : null;

export function createProposedComponents(
  deps: ProposedComponentsDeps,
): ProposedComponents {
  const { base } = deps;
  const registry = deps.fonts ?? createFontRegistry();
  const { track, whenIdle } = createPendingTracker();
  let disposed = false;

  // The open proposal's packages. The list only changes when what there is to read changes
  // (open proposal, new specialization change, applied): deciding does not swap the list.
  let lastPackages: readonly ProposedPackage[] = [];
  const packages = computed((): readonly ProposedPackage[] => {
    const next = proposedPackages(deps.proposal.value);
    const same =
      next.length === lastPackages.length &&
      next.every((pkg, i) => {
        const before = lastPackages[i];
        return (
          before !== undefined &&
          pkg.proposalId === before.proposalId &&
          keyOf(pkg) === keyOf(before) &&
          pkg.file === before.file &&
          pkg.signature === before.signature
        );
      });
    if (!same) lastPackages = next;
    return lastPackages;
  });

  /** What was already read, by `id@version`; forgets everything when another proposal opens. */
  const entries = signal<ReadonlyMap<string, SpecComponents>>(new Map());
  const loading = new Set<string>();
  /** The `spec` identity each `id@version` was read with (or is being read with) in this proposal. */
  const signatures = new Map<string, string>();
  let owner: string | null = null;
  /** Goes up on each finished font registration. */
  const epoch = signal(0);

  async function load(pkg: ProposedPackage, run: string): Promise<void> {
    const key = keyOf(pkg);
    let loaded: SpecComponents;
    try {
      loaded = await readSpecComponents(pkg.spec, pkg.file, pkg.version, async (path) => {
        const staged = stagedPath(pkg, path);
        const blob = staged === null ? null : await deps.read(staged);
        return blob === null ? null : blob.text();
      });
    } catch (error) {
      loaded = failedComponents(pkg.specId, pkg.version, error);
    } finally {
      loading.delete(`${run}|${key}`);
    }
    if (disposed || owner !== run || signatures.get(key) !== pkg.signature) return;
    entries.value = new Map(entries.peek()).set(key, loaded);
  }

  let fontsRegistered = false;
  const fontSync = createFontSync({
    registry,
    isDisposed: () => disposed,
    onRegistered: () => void epoch.value++,
  });

  /** Fonts declared by the packages in the list, with the package that holds them. */
  const packageFonts = (list: readonly ProposedPackage[]) =>
    list.flatMap((pkg) =>
      (pkg.spec.fonts ?? []).map((declared) => ({
        pkg,
        font: fontDeclaration(pkg.file, declared),
      })),
    );

  const stop = effect(() => {
    const list = packages.value;
    const proposalId = deps.proposal.peek()?.id ?? null;
    if (owner !== proposalId) {
      owner = proposalId;
      loading.clear();
      signatures.clear();
      if (entries.peek().size > 0) entries.value = new Map();
    }
    const run = owner ?? '';
    for (const pkg of list) {
      const key = keyOf(pkg);
      const stale = signatures.get(key) !== pkg.signature;
      if (!stale && (entries.peek().has(key) || loading.has(`${run}|${key}`))) continue;
      signatures.set(key, pkg.signature);
      loading.add(`${run}|${key}`);
      void track(load(pkg, run));
    }
    // Fonts follow the list (not the view or the decisions); with none and with nothing
    // registered before, there is nothing to do or to re-measure.
    const declares = list.some((pkg) => (pkg.spec.fonts ?? []).length > 0);
    if (!declares && !fontsRegistered) return;
    fontsRegistered = declares;
    void track(
      fontSync.start(
        declares ? packageFonts(list) : [],
        ({ font }) => font,
        async ({ pkg, font }) => {
          const staged = stagedPath(pkg, font.path);
          const blob = staged === null ? null : await deps.read(staged);
          return blob === null ? null : blob.arrayBuffer();
        },
      ),
    );
  });

  let lastCatalog: ComponentCatalog = EMPTY_CATALOG;
  const catalog = computed((): ComponentCatalog => {
    const from = base.catalog.value;
    // Current view, outside the review or without a proposed package: the base catalog itself.
    if (deps.view.value !== 'proposed' || packages.value.length === 0) return from;
    const shown = deps.shown.value;
    const loaded = entries.value;
    const next = new Map<string, SpecComponents>();
    if (shown) {
      for (const s of shown.specializations) {
        // The type comes from the proposed package when `id@version` is its; otherwise, the base
        // object (the same one, so the per-marking draw cache stays valid).
        const components =
          loaded.get(keyOf({ specId: s.id, version: s.version })) ?? from.get(s.id);
        if (components) next.set(s.id, components);
      }
    }
    if (sameCatalog(next, from)) return from;
    if (sameCatalog(next, lastCatalog)) return lastCatalog;
    lastCatalog = next.size === 0 ? EMPTY_CATALOG : next;
    return lastCatalog;
  });

  const fontsEpoch = computed(() => base.fontsEpoch.value + epoch.value);

  return {
    catalog,
    fontsEpoch,
    whenIdle,
    dispose() {
      disposed = true;
      stop();
      registry.clear();
    },
  };
}
