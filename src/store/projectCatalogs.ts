import { signal, type ReadonlySignal } from '@preact/signals';
import {
  buildCatalog,
  packageDirOf,
  type Catalog,
  type Project,
  type ProjectSpecialization,
} from '../model';
import type { LibraryFile } from '../model/library';
import { reportError } from '../utils/report';

// Catálogos (página de cada componente) das especializações com pacote do projeto aberto
// (etapa Biblioteca, B5). Estado em memória da sessão, nunca do projeto, e sob demanda: nada
// é lido nem montado enquanto a janela Catálogo não pede (`request`). Quem sabe ler o
// pacote (cópia em memória da sessão ou `specs/<id>/`) entrega os arquivos em `read`.

export interface ProjectCatalog {
  readonly specId: string;
  readonly name: string;
  readonly version: number;
  readonly catalog: Catalog;
}

export interface ProjectCatalogs {
  /** Catálogos prontos; `null` até a primeira leitura pedida terminar. */
  readonly entries: ReadonlySignal<readonly ProjectCatalog[] | null>;
  /** Sobe a cada `invalidate`: quem mostra os catálogos pede de novo. */
  readonly stamp: ReadonlySignal<number>;
  /** Lê e monta o que falta (a mesma versão não é montada duas vezes). Sem custo se nada mudou. */
  request(): void;
  /** Os arquivos podem ter mudado por fora: a próxima `request` lê de novo. */
  invalidate(): void;
  /** Resolve quando o que foi pedido terminou (testes). */
  whenIdle(): Promise<void>;
  dispose(): void;
}

export interface ProjectCatalogsDeps {
  /** O projeto confirmado (`store.committed`). */
  readonly project: ReadonlySignal<Project | null>;
  /** Arquivos do pacote (caminhos relativos à pasta dele); `null` se não há o que ler. */
  readonly read: (owner: ProjectSpecialization) => Promise<readonly LibraryFile[] | null>;
}

export function createProjectCatalogs(deps: ProjectCatalogsDeps): ProjectCatalogs {
  const entries = signal<readonly ProjectCatalog[] | null>(null);
  const stamp = signal(0);
  const pending = new Set<Promise<unknown>>();
  let doneKey: string | null = null;
  let run = 0;
  let disposed = false;

  const withPackage = (p: Project): ProjectSpecialization[] =>
    p.specializations.filter((s) => s.spec !== null && packageDirOf(s.file) !== null);

  async function load(owners: readonly ProjectSpecialization[], mine: number) {
    // Deixa a interface pintar antes do trabalho síncrono de montar o catálogo.
    await Promise.resolve();
    const out: ProjectCatalog[] = [];
    for (const owner of owners) {
      try {
        const files = await deps.read(owner);
        if (files === null) continue;
        const catalog = buildCatalog(files);
        out.push({
          specId: owner.id,
          name: catalog.spec?.name ?? owner.spec?.name ?? owner.id,
          version: owner.version,
          catalog,
        });
      } catch (error) {
        reportError('catalog.load', error);
      }
    }
    if (disposed || mine !== run) return;
    entries.value = out;
  }

  return {
    entries,
    stamp,
    request() {
      const p = deps.project.peek();
      if (!p || disposed) return;
      const owners = withPackage(p);
      const key = owners.map((s) => `${s.id}@${s.version}`).join('|');
      if (key === doneKey) return;
      doneKey = key;
      run += 1;
      const task = load(owners, run);
      pending.add(task);
      const done = () => void pending.delete(task);
      task.then(done, done);
    },
    invalidate() {
      doneKey = null;
      stamp.value++;
    },
    async whenIdle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    dispose() {
      disposed = true;
      entries.value = null;
    },
  };
}
