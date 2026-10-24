import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import {
  EMPTY_CATALOG,
  componentPaths,
  loadSpecComponents,
  packageDirOf,
  type ComponentCatalog,
  type Project,
  type ProjectSpecialization,
  type Spec,
  type SpecComponents,
} from '../model';
import { resolvePath, type LoadedFont } from '../model/components/library';
import { createFontRegistry, type FontRegistry, type FontStatus } from '../storage/fonts';
import { reportError } from '../utils/report';

// A biblioteca de componentes de um projeto aberto (etapa Biblioteca, B3): o catálogo e as
// fontes das especializações aplicadas, lidos dos pacotes `specs/<id>/` e guardados em
// memória. Estado da sessão, nunca do projeto: o `mapping.json` não guarda nada do desenho.
// Quem a cria é a sessão, que sabe ler o armazenamento e guarda os pacotes ainda não gravados.

export interface ComponentLibrary {
  /** Componentes das especializações aplicadas ao projeto confirmado (só as que já carregaram). */
  readonly catalog: ReadonlySignal<ComponentCatalog>;
  /** Sobe a cada registro de fontes terminado: os desenhos remedem. */
  readonly fontsEpoch: ReadonlySignal<number>;
  /** Situação de cada fonte declarada (para o Diagnóstico). */
  readonly fonts: ReadonlySignal<readonly FontStatus[]>;
  /** Resolve quando o que está pedido terminou de carregar (testes). */
  whenIdle(): Promise<void>;
  /**
   * Esquece o que foi lido: os pacotes são lidos de novo (uma recarga externa pode ter mudado
   * os arquivos sem mudar a versão). O catálogo atual fica até o novo chegar, sem piscar.
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
   * Pacote em memória da sessão (aplicar ou atualizar ainda não gravado; desfazer), por id e
   * versão: caminho relativo à pasta do pacote → texto ou `Blob`.
   */
  readonly cached?: (
    specId: string,
    version: number,
  ) => ReadonlyMap<string, string | Blob> | undefined;
  /** Padrão: `createFontRegistry()`. */
  readonly fonts?: FontRegistry;
}

const keyOf = (s: { readonly id: string; readonly version: number }): string =>
  `${s.id}@${s.version}`;

/** Especialização com pacote em pasta e conteúdo carregado: a única que tem componentes. */
function hasPackage(s: ProjectSpecialization): boolean {
  return s.spec !== null && packageDirOf(s.file) !== null;
}

/** Fonte declarada pela especialização (`spec.fonts`) como o registro de fontes a recebe (sem bytes). */
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

/** Fontes declaradas (`spec.fonts`) pelas especializações com pacote, na ordem do projeto. */
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
 * Lê os arquivos de componente que a especialização cita (`read` devolve o texto de um caminho
 * da raiz do projeto, ou `null`) e monta os componentes. Quem lê decide de onde: `specs/<id>/`,
 * a cópia em memória da sessão ou `proposals/<id>/` (catálogo do Proposto).
 */
export async function readSpecComponents(
  spec: Spec,
  specFile: string,
  version: number,
  read: (path: string) => Promise<string | null>,
): Promise<SpecComponents> {
  const texts = new Map<string, string>();
  for (const path of componentPaths(spec, specFile)) {
    const text = await read(path);
    if (text !== null) texts.set(path, text);
  }
  return loadSpecComponents(spec, specFile, version, (path) => texts.get(path));
}

/** Entrada vazia com o motivo: sem ela, cada edição do projeto tentaria ler de novo. */
export function failedComponents(
  specId: string,
  version: number,
  error: unknown,
): SpecComponents {
  reportError('components.load', error);
  return {
    specId,
    version,
    byType: new Map(),
    problems: [error instanceof Error ? error.message : String(error)],
  };
}

export function sameCatalog(a: ComponentCatalog, b: ComponentCatalog): boolean {
  if (a.size !== b.size) return false;
  for (const [id, components] of a) if (b.get(id) !== components) return false;
  return true;
}

export function createComponentLibrary(deps: ComponentLibraryDeps): ComponentLibrary {
  const registry = deps.fonts ?? createFontRegistry();
  /** Por `id@versão`: o desfazer de uma atualização volta a achar a anterior. */
  const entries = signal<ReadonlyMap<string, SpecComponents>>(new Map());
  const fontStatus = signal<readonly FontStatus[]>([]);
  const epoch = signal(0);
  /** Sobe em `invalidate`, para os efeitos lerem de novo. */
  const generation = signal(0);
  const loading = new Set<string>();
  /** Entradas lidas antes do último `invalidate`: valem até a nova chegar. */
  const stale = new Set<string>();
  const pending = new Set<Promise<unknown>>();
  let disposed = false;
  let current = 0;

  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    const done = () => void pending.delete(promise);
    promise.then(done, done);
    return promise;
  };

  /** Lê um arquivo do pacote: da cópia em memória da sessão e, senão, do armazenamento. */
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
    // Deixa a sessão terminar o que faz logo depois da action (guardar o pacote em memória).
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

  // Fontes: o conjunto declarado muda raramente; só então registra de novo.
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
  let fontRun = 0;
  let fontsRegistered = false;
  // Os registros correm um depois do outro: o de uma rodada velha nem começa.
  let registerChain: Promise<unknown> = Promise.resolve();

  async function syncFonts(
    declared: readonly DeclaredFont[],
    run: number,
  ): Promise<void> {
    await Promise.resolve();
    try {
      const fonts: LoadedFont[] = [];
      for (const { owner, font } of declared) {
        let bytes: ArrayBuffer | undefined;
        try {
          bytes = (await readBytes(owner, font.path)) ?? undefined;
        } catch (error) {
          reportError('components.font', error);
        }
        fonts.push(bytes ? { ...font, bytes } : font);
      }
      const task = registerChain.then(() =>
        disposed || run !== fontRun ? null : registry.register(fonts),
      );
      registerChain = task.catch(() => undefined);
      const status = await task;
      if (status === null || disposed || run !== fontRun) return;
      batch(() => {
        fontStatus.value = status;
        epoch.value++;
      });
    } catch (error) {
      reportError('components.fonts', error);
    }
  }

  const stopFonts = effect(() => {
    void fontsKey.value;
    void generation.value;
    const declared = declaredFonts(deps.project.peek());
    // Sem fontes e sem nada registrado antes: não há o que fazer nem o que remedir.
    if (declared.length === 0 && !fontsRegistered) return;
    fontsRegistered = declared.length > 0;
    fontRun += 1;
    void track(syncFonts(declared, fontRun));
  });

  return {
    catalog,
    fontsEpoch: epoch,
    fonts: fontStatus,
    async whenIdle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
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
