import { findByCode, normalizeCodePath, projectIndex } from '../src/model';
import { LocalFileChecker } from './codeFiles';
import { resolveCodeEntry } from './codeViews';
import { ToolError } from './errors';
import { Refs } from './items';
import type { Roots } from './paths';
import {
  discoverProjects,
  findProject,
  loadProject,
  type ProjectLocation,
} from './projects';

// `find_by_code`: do código para o mapeamento. Procura, em um projeto ou em todos os das
// raízes, as marcações cujos `codeRef` apontam para um arquivo ou símbolo. Só compara os
// textos gravados nos projetos: nenhum arquivo de código é aberto.

type Json = Record<string, unknown>;

/** Máximo de entradas devolvidas (o total vem sempre). */
const MAX_MATCHES = 200;

export interface FindByCodeArgs {
  readonly project?: string | undefined;
  readonly path?: string | undefined;
  readonly symbol?: string | undefined;
}

export async function findByCodeResult(
  roots: Roots,
  args: FindByCodeArgs,
): Promise<Json> {
  const path = args.path?.trim() ?? '';
  const symbol = args.symbol?.trim() ?? '';
  if (path === '' && symbol === '') {
    throw new ToolError(
      'missing-query',
      'informe `path` (arquivo inteiro ou só os últimos segmentos, ex: "CheckoutScreen.kt") e/ou `symbol`',
    );
  }
  if (path !== '' && normalizeCodePath(path) === null) {
    throw new ToolError('invalid-path', `caminho inválido: ${args.path}`);
  }

  const single = args.project !== undefined && args.project.trim() !== '';
  const locations: ProjectLocation[] = single
    ? [await findProject(roots, args.project!)]
    : await discoverProjects(roots);
  if (locations.length === 0) {
    throw new ToolError('project-not-found', 'nenhum projeto nas raízes configuradas');
  }

  const files = new LocalFileChecker(roots.workDir);
  const matches: Json[] = [];
  const searched: string[] = [];
  const unreadable: string[] = [];
  let total = 0;
  for (const location of locations) {
    let loaded;
    try {
      loaded = await loadProject(roots, location);
    } catch (error) {
      // Um projeto ilegível não esconde os outros; sozinho, o erro é do pedido.
      if (single || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    searched.push(location.name);
    const refs = new Refs(loaded);
    const index = projectIndex(loaded.project);
    for (const hit of findByCode(loaded.project, {
      path: path === '' ? null : path,
      symbol: symbol === '' ? null : symbol,
    })) {
      total++;
      if (matches.length >= MAX_MATCHES) continue;
      const marking = index.markings.get(hit.markingId);
      matches.push({
        project: location.name,
        marking: refs.ref('m', hit.markingId),
        markingName: marking?.name ?? null,
        image: refs.ref('i', hit.imageId),
        annotation: refs.ref('a', hit.annotationId),
        ...(await resolveCodeEntry({ refs, files }, hit.entry, hit.key)),
      });
    }
  }
  return {
    query: {
      ...(path !== '' ? { path } : {}),
      ...(symbol !== '' ? { symbol } : {}),
    },
    searched,
    ...(unreadable.length > 0 ? { unreadable } : {}),
    total,
    returned: matches.length,
    ...(total > matches.length ? { truncated: true } : {}),
    matches,
  };
}
