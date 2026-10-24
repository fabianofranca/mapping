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
import type { LoadedFont } from '../model/components/library';
import { createFontRegistry, type FontRegistry } from '../storage/fonts';
import { reportError } from '../utils/report';
import {
  failedComponents,
  fontDeclaration,
  readSpecComponents,
  sameCatalog,
  type ComponentLibrary,
} from './componentLibrary';
import type { ComponentSources, ReviewView } from './derived';

// O catálogo de componentes da visão Proposto (etapa Proposto com componentes, PC1): o da
// biblioteca aplicada mais os pacotes que a proposta aberta cria ou atualiza, lidos de
// `proposals/<id>/<pasta>/`. Só leitura: nada é gravado em `specs/`. É estado da revisão, nunca
// do projeto; quem o cria é o `createReviewState`, e a leitura acontece quando a proposta
// abre (não quando a visão muda nem quando se decide).

export interface ProposedComponents extends ComponentSources {
  /** Resolve quando o que está pedido terminou de carregar (testes). */
  whenIdle(): Promise<void>;
  dispose(): void;
}

export interface ProposedComponentsDeps {
  /** Os componentes das especializações aplicadas (a base, que vale fora do Proposto). */
  readonly base: ComponentLibrary;
  /** A proposta aberta na revisão; `null` fora dela. */
  readonly proposal: ReadonlySignal<Proposal | null>;
  readonly view: ReadonlySignal<ReviewView>;
  /** O projeto à vista (`review.derived.shownProject`): diz que versão cada tipo usa. */
  readonly shown: ReadonlySignal<Project | null>;
  /** Bytes de um arquivo do projeto (`session.readImage`), ou `null`. */
  readonly read: (path: string) => Promise<Blob | null>;
  /** Padrão: `createFontRegistry()`. */
  readonly fonts?: FontRegistry;
}

/** Pacote de uma especialização que a proposta cria ou atualiza e que ainda não foi aplicado. */
interface ProposedPackage {
  readonly proposalId: string;
  readonly specId: string;
  readonly version: number;
  /** `specs/<pasta>`: onde o pacote ficará depois de aplicado. */
  readonly dir: string;
  /** Arquivo da especialização (`specs/<pasta>/x.spec.json`). */
  readonly file: string;
  readonly spec: Spec;
}

const keyOf = (s: { readonly specId: string; readonly version: number }): string =>
  `${s.specId}@${s.version}`;

/** Pacotes das mudanças `specialization` de criar ou atualizar ainda não aplicadas (rejeitadas inclusive). */
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
    });
  }
  return out;
}

/** Caminho do projeto (`specs/<pasta>/…`) de um arquivo do pacote → onde ele espera em `proposals/`. */
const stagedPath = (pkg: ProposedPackage, path: string): string | null =>
  path.startsWith(`${pkg.dir}/`)
    ? `${proposalPackageDir(pkg.proposalId, pkg.dir)}/${path.slice(pkg.dir.length + 1)}`
    : null;

export function createProposedComponents(
  deps: ProposedComponentsDeps,
): ProposedComponents {
  const { base } = deps;
  const registry = deps.fonts ?? createFontRegistry();
  const pending = new Set<Promise<unknown>>();
  let disposed = false;

  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    const done = () => void pending.delete(promise);
    promise.then(done, done);
    return promise;
  };

  // Os pacotes da proposta aberta. A lista só muda quando muda o que há para ler (proposta
  // aberta, mudança de especialização nova, aplicada): decidir não troca a lista.
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
          pkg.file === before.file
        );
      });
    if (!same) lastPackages = next;
    return lastPackages;
  });

  /** O que já foi lido, por `id@versão`; esquece tudo quando outra proposta abre. */
  const entries = signal<ReadonlyMap<string, SpecComponents>>(new Map());
  const loading = new Set<string>();
  let owner: string | null = null;
  /** Sobe a cada registro de fontes terminado. */
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
    if (disposed || owner !== run) return;
    entries.value = new Map(entries.peek()).set(key, loaded);
  }

  let fontRun = 0;
  let fontsRegistered = false;
  // Os registros correm um depois do outro: o de uma rodada velha nem começa.
  let registerChain: Promise<unknown> = Promise.resolve();

  async function syncFonts(list: readonly ProposedPackage[], run: number): Promise<void> {
    await Promise.resolve();
    try {
      const fonts: LoadedFont[] = [];
      for (const pkg of list) {
        for (const declared of pkg.spec.fonts ?? []) {
          const font = fontDeclaration(pkg.file, declared);
          const staged = stagedPath(pkg, font.path);
          let bytes: ArrayBuffer | undefined;
          try {
            const blob = staged === null ? null : await deps.read(staged);
            bytes = blob === null ? undefined : await blob.arrayBuffer();
          } catch (error) {
            reportError('components.font', error);
          }
          fonts.push(bytes ? { ...font, bytes } : font);
        }
      }
      const task = registerChain.then(() =>
        disposed || run !== fontRun ? null : registry.register(fonts),
      );
      registerChain = task.catch(() => undefined);
      const status = await task;
      if (status === null || disposed || run !== fontRun) return;
      epoch.value++;
    } catch (error) {
      reportError('components.fonts', error);
    }
  }

  const stop = effect(() => {
    const list = packages.value;
    const proposalId = deps.proposal.peek()?.id ?? null;
    if (owner !== proposalId) {
      owner = proposalId;
      loading.clear();
      if (entries.peek().size > 0) entries.value = new Map();
    }
    const run = owner ?? '';
    for (const pkg of list) {
      const key = keyOf(pkg);
      if (entries.peek().has(key) || loading.has(`${run}|${key}`)) continue;
      loading.add(`${run}|${key}`);
      void track(load(pkg, run));
    }
    // As fontes seguem a lista (não a visão nem as decisões); sem nenhuma e sem nada
    // registrado antes, não há o que fazer nem o que remedir.
    const declares = list.some((pkg) => (pkg.spec.fonts ?? []).length > 0);
    if (!declares && !fontsRegistered) return;
    fontsRegistered = declares;
    fontRun += 1;
    void track(syncFonts(declares ? list : [], fontRun));
  });

  let lastCatalog: ComponentCatalog = EMPTY_CATALOG;
  const catalog = computed((): ComponentCatalog => {
    const from = base.catalog.value;
    // Visão Atual, fora da revisão ou sem pacote proposto: o catálogo da base, o próprio objeto.
    if (deps.view.value !== 'proposed' || packages.value.length === 0) return from;
    const shown = deps.shown.value;
    const loaded = entries.value;
    const next = new Map<string, SpecComponents>();
    if (shown) {
      for (const s of shown.specializations) {
        // O tipo vem do pacote proposto quando `id@versão` é dele; senão, o objeto da base
        // (o mesmo, para o cache de desenho por marcação continuar valendo).
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
    async whenIdle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    dispose() {
      disposed = true;
      stop();
      registry.clear();
    },
  };
}
