import {
  annotationShortLabel,
  findByCode,
  findSpecType,
  normalizeCodePath,
  projectIndex,
} from '../src/model';
import { LocalFileChecker } from './codeFiles';
import { typeCodeView } from './codeViews';
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
// raízes, os tipos das especializações aplicadas cujo `code` aponta para um arquivo
// (`code.<plataforma>.path`) ou símbolo (`code.<plataforma>.symbol`), e as anotações desses
// tipos ("estou neste arquivo: que tipos o usam e em que marcações"). Só compara os textos
// das especializações: nenhum arquivo de código é aberto (só se confere se o `path` existe).

type Json = Record<string, unknown>;

/** Máximo de anotações devolvidas, somando todos os tipos (os totais vêm sempre). */
const MAX_ANNOTATIONS = 200;

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
  let annotationTotal = 0;
  let returned = 0;
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
    const p = loaded.project;
    const index = projectIndex(p);
    for (const hit of findByCode(p, {
      path: path === '' ? null : path,
      symbol: symbol === '' ? null : symbol,
    })) {
      const resolved = findSpecType(p, { specId: hit.specId, typeId: hit.typeId });
      const code = Object.fromEntries(hit.code.map((c) => [c.platform, c.code]));
      const room = Math.max(0, MAX_ANNOTATIONS - returned);
      const shown = hit.annotations.slice(0, room);
      annotationTotal += hit.annotations.length;
      returned += shown.length;
      matches.push({
        project: location.name,
        type: {
          specId: hit.specId,
          typeId: hit.typeId,
          name: resolved?.type.name ?? hit.typeId,
        },
        code: await typeCodeView({ refs, files }, code),
        annotationCount: hit.annotations.length,
        annotations: shown.map((found) => {
          const annotation = index.annotations.get(found.annotationId);
          return {
            annotation: refs.ref('a', found.annotationId),
            title: annotation ? annotationShortLabel(p, annotation) : null,
            marking: refs.ref('m', found.markingId),
            markingName: index.markings.get(found.markingId)?.name ?? null,
            image: refs.ref('i', found.imageId),
          };
        }),
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
    total: matches.length,
    annotationTotal,
    returned,
    ...(annotationTotal > returned ? { truncated: true } : {}),
    matches,
  };
}
