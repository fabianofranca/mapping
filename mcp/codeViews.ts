import {
  codeBlueprint,
  codeLink,
  codeLocalPath,
  findPlatform,
  projectPlatforms,
  typeOfAnnotation,
  type Annotation,
  type BlueprintAnnotation,
  type BlueprintNode,
  type CodeLocation,
  type SpecCode,
} from '../src/model';
import type { LocalFileChecker } from './codeFiles';
import { ToolError } from './errors';
import type { Refs } from './items';

// Visões em JSON do código das especializações (etapa 3b.4; etapa 9): o `code` das plataformas
// de cada tipo, com o `path` resolvido (a URL, o caminho local e a existência do arquivo), e o
// blueprint de `get_code_hints`. O servidor só monta caminhos e confere a existência
// (`codeFiles.ts`): nenhum arquivo de código é lido.

type Json = Record<string, unknown>;

/** O que as visões precisam para resolver o `path` de um tipo. */
export interface CodeContext {
  readonly refs: Refs;
  readonly files: LocalFileChecker;
}

/** Plataforma pedida em `platform`: precisa ser declarada por alguma especialização aplicada. */
export function assertPlatform(refs: Refs, platformId: string): void {
  const p = refs.project;
  if (findPlatform(p, platformId)) return;
  throw new ToolError(
    'unknown-platform',
    `plataforma não declarada pelas especializações aplicadas: ${platformId}`,
    { platform: platformId, platforms: projectPlatforms(refs.project).map((x) => x.id) },
  );
}

/** Onde um caminho de código está: a URL no repositório, o arquivo local e se ele existe. */
async function resolveCodeFile(
  ctx: CodeContext,
  location: CodeLocation,
  url: string | null,
): Promise<Json> {
  const local = await ctx.files.check(
    ctx.refs.loaded.location.dir,
    codeLocalPath(ctx.refs.project, location),
  );
  return {
    url,
    localFile: local.localFile,
    exists: local.exists,
    ...(local.problem ? { localFileProblem: local.problem } : {}),
  };
}

/** O `path` do `code` de um tipo, resolvido: `path` com `url`, `localFile` e `exists` ao lado. Vazio sem `path`. */
async function resolveDefinition(
  ctx: CodeContext,
  specId: string,
  platform: string,
  path: string | null | undefined,
  url: string | null = path
    ? codeLink(ctx.refs.project, { specId, platform, path })
    : null,
): Promise<Json> {
  if (path === null || path === undefined) return {};
  return { path, ...(await resolveCodeFile(ctx, { specId, platform, path }, url)) };
}

/**
 * `code` do tipo da anotação por plataforma (`symbol`, `path`, `params`, `values`, `notes`),
 * como na especialização; o `path` vem com `url`, `localFile` e `exists` ao lado. Com
 * `platform`, só ela. `null` se o tipo não tem `code` (para essa plataforma).
 */
export async function annotationCode(
  ctx: CodeContext,
  annotation: Annotation,
  platform?: string,
): Promise<Json | null> {
  const resolved = typeOfAnnotation(ctx.refs.project, annotation);
  const code = resolved?.type.code;
  if (!resolved || !code) return null;
  return typeCodeView(ctx, resolved.spec.id, code, platform);
}

/**
 * `code` de um tipo (ou só as plataformas de `only`) com o `path` resolvido; `null` se não
 * sobrar nenhuma plataforma. `get_marking`, `get_annotation` e `find_by_code` usam o mesmo.
 */
export async function typeCodeView(
  ctx: CodeContext,
  specId: string,
  code: Readonly<Record<string, SpecCode>>,
  only?: string | ReadonlySet<string>,
): Promise<Json | null> {
  const wanted = (id: string) =>
    only === undefined || (typeof only === 'string' ? id === only : only.has(id));
  const entries = await Promise.all(
    Object.entries(code)
      .filter(([id]) => wanted(id))
      .map(async ([id, entry]): Promise<[string, Json]> => {
        const { symbol, path, ...rest } = entry;
        return [id, { symbol, ...(await resolveDefinition(ctx, specId, id, path)), ...rest }];
      }),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

// ---------------------------------------------------------------------------
// get_code_hints

async function hintAnnotation(
  ctx: CodeContext,
  platform: string,
  annotation: BlueprintAnnotation,
): Promise<Json> {
  const { refs } = ctx;
  const definition = await resolveDefinition(
    ctx,
    annotation.specId,
    platform,
    annotation.path,
    annotation.pathUrl,
  );
  const linked = await Promise.all(
    annotation.linked.map((a) => hintAnnotation(ctx, platform, a)),
  );
  return {
    ref: refs.bare('a', annotation.annotationId),
    type: {
      specId: annotation.specId,
      typeId: annotation.typeId,
      name: annotation.type,
    },
    label: annotation.label,
    layer: annotation.layer,
    symbol: annotation.symbol,
    ...definition,
    ...(annotation.params.length > 0
      ? {
          params: annotation.params.map((param) => ({
            field: param.key,
            name: param.name,
            value: param.value,
          })),
        }
      : {}),
    ...(annotation.notes !== null ? { notes: annotation.notes } : {}),
    ...(Object.keys(annotation.values).length > 0 ? { values: annotation.values } : {}),
    ...(linked.length > 0 ? { linked } : {}),
  };
}

async function hintNode(
  ctx: CodeContext,
  platform: string,
  node: BlueprintNode,
  root: boolean,
): Promise<Json> {
  const { refs } = ctx;
  const annotations = await Promise.all(
    node.annotations.map((a) => hintAnnotation(ctx, platform, a)),
  );
  const children = await Promise.all(
    node.children.map((c) => hintNode(ctx, platform, c, false)),
  );
  return {
    ref: root ? refs.ref('m', node.markingId) : refs.bare('m', node.markingId),
    name: node.name,
    rect: node.rect,
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Tipos (`specId/typeId`) que aparecem na árvore sem `code` para a plataforma (`symbol: null`). */
function unmappedTypes(node: BlueprintNode): string[] {
  const found = new Set<string>();
  const visitAnnotation = (a: BlueprintAnnotation) => {
    if (a.symbol === null) found.add(`${a.specId}/${a.typeId}`);
    a.linked.forEach(visitAnnotation);
  };
  const visit = (n: BlueprintNode) => {
    n.annotations.forEach(visitAnnotation);
    n.children.forEach(visit);
  };
  visit(node);
  return [...found];
}

/** `get_code_hints`: o que implementar na plataforma, a partir da marcação e das descendentes. */
export async function codeHintsView(
  ctx: CodeContext,
  markingId: string,
  platformId: string,
): Promise<Json> {
  const { refs } = ctx;
  assertPlatform(refs, platformId);
  const blueprint = codeBlueprint(refs.project, markingId, platformId);
  const unmapped = unmappedTypes(blueprint.root);
  return {
    marking: refs.ref('m', markingId),
    platform: {
      id: blueprint.platform.id,
      name: blueprint.platform.name,
      language: blueprint.platform.language,
    },
    repo: blueprint.repo,
    ...(unmapped.length > 0
      ? {
          unmappedTypes: unmapped,
          hint: 'tipos com `symbol: null` não têm `code` nesta plataforma na especialização: não há componente mapeado para eles',
        }
      : {}),
    tree: await hintNode(ctx, platformId, blueprint.root, true),
  };
}
