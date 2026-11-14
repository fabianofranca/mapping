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
import { projectSignatureReader } from './signatureFiles';
import type { Roots } from './paths';
import {
  discoverProjects,
  findProject,
  loadProject,
  type ProjectLocation,
} from './projects';

// `find_by_code`: from code to mapping. Searches, in one project or in all those in the
// roots, the types of the applied specializations whose `code` points to a file
// (`code.<platform>.path`) or symbol (`code.<platform>.symbol`), and the annotations of those
// types ("I am in this file: which types use it and in which markings"). It only compares the texts
// of the specializations: no code file is opened (it only checks that the `path` exists).

type Json = Record<string, unknown>;

/** Maximum annotations returned, summing all the types (the totals always come). */
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
      'provide `path` (whole file or only the last segments, e.g. "CheckoutScreen.kt") and/or `symbol`',
    );
  }
  if (path !== '' && normalizeCodePath(path) === null) {
    throw new ToolError('invalid-path', `invalid path: ${args.path}`);
  }

  const single = args.project !== undefined && args.project.trim() !== '';
  const locations: ProjectLocation[] = single
    ? [await findProject(roots, args.project!)]
    : await discoverProjects(roots);
  if (locations.length === 0) {
    throw new ToolError('project-not-found', 'no project in the configured roots');
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
      // An unreadable project does not hide the others; alone, the error is the request's.
      if (single || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    searched.push(location.name);
    const refs = new Refs(loaded);
    const signatures = projectSignatureReader(roots, refs);
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
        path: location.path,
        type: {
          specId: hit.specId,
          typeId: hit.typeId,
          name: resolved?.type.name ?? hit.typeId,
        },
        code: await typeCodeView({ refs, files, signatures }, hit.specId, code),
        annotationCount: hit.annotations.length,
        annotations: shown.map((found) => {
          const annotation = index.annotations.get(found.annotationId);
          return {
            annotation: refs.ref('a', found.annotationId),
            title: annotation ? annotationShortLabel(p, annotation) : null,
            marking: refs.ref('m', found.markingId),
            markingName: index.markings.get(found.markingId)?.name ?? null,
            container:
              found.containerId === null ? null : refs.ref('i', found.containerId),
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
