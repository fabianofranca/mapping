import {
  codeBlueprint,
  codeLink,
  codeLocalPath,
  codeRefEntries,
  findPlatform,
  projectPlatforms,
  typeOfAnnotation,
  type Annotation,
  type BlueprintAnnotation,
  type BlueprintNode,
  type CodeRefEntry,
  type JsonValue,
} from '../src/model';
import type { LocalFileChecker } from './codeFiles';
import { ToolError } from './errors';
import type { Refs } from './items';

// Visões em JSON das referências de código (etapa 3b.4): `codeRef` resolvidos (com a URL, o
// caminho local e a existência do arquivo), o `code` das plataformas de cada tipo e o blueprint
// de `get_code_hints`. O servidor só monta caminhos e confere a existência (`codeFiles.ts`):
// nenhum arquivo de código é lido.

type Json = Record<string, unknown>;

/** O que as visões precisam para resolver uma entrada de `codeRef`. */
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

/** Uma entrada de `codeRef` com a URL do repositório e o arquivo local. */
export async function resolveCodeEntry(
  ctx: CodeContext,
  entry: CodeRefEntry,
  field?: string,
): Promise<Json> {
  const p = ctx.refs.project;
  const local = await ctx.files.check(
    ctx.refs.loaded.location.dir,
    codeLocalPath(p, entry),
  );
  return {
    ...(field !== undefined ? { field } : {}),
    id: entry._id,
    platform: entry.platform,
    path: entry.path,
    symbol: entry.symbol,
    line: entry.line,
    url: codeLink(p, entry),
    localFile: local.localFile,
    exists: local.exists,
    ...(local.problem ? { localFileProblem: local.problem } : {}),
  };
}

/** Campos `codeRef` do tipo da anotação, na ordem do tipo (vazio para anotação livre). */
function codeRefFields(refs: Refs, annotation: Annotation): string[] {
  const resolved = typeOfAnnotation(refs.project, annotation);
  if (!resolved || !annotation.values) return [];
  return resolved.type.fields.flatMap((f) => (f.type === 'codeRef' ? [f.key] : []));
}

/** Chaves dos campos `codeRef` da anotação (para tirá-los de `values`, que passam a vir em `codeRefs`). */
export function codeRefKeys(refs: Refs, annotation: Annotation): ReadonlySet<string> {
  return new Set(codeRefFields(refs, annotation));
}

/**
 * Entradas de `codeRef` da anotação tipada, resolvidas, na ordem dos campos. Com `platform`,
 * só as dessa plataforma.
 */
export async function annotationCodeRefs(
  ctx: CodeContext,
  annotation: Annotation,
  platform?: string,
): Promise<Json[]> {
  const result: Json[] = [];
  for (const key of codeRefFields(ctx.refs, annotation)) {
    const value: JsonValue | undefined = annotation.values?.[key];
    for (const entry of codeRefEntries(value)) {
      if (platform !== undefined && entry.platform !== platform) continue;
      result.push(await resolveCodeEntry(ctx, entry, key));
    }
  }
  return result;
}

/**
 * `code` do tipo da anotação por plataforma (`symbol`, `params`, `values`, `notes`), como na
 * especialização. Com `platform`, só ela. `null` se o tipo não tem `code` (para essa plataforma).
 */
export function annotationCode(
  refs: Refs,
  annotation: Annotation,
  platform?: string,
): Json | null {
  const code = typeOfAnnotation(refs.project, annotation)?.type.code;
  if (!code) return null;
  const entries = Object.entries(code).filter(
    ([id]) => platform === undefined || id === platform,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

// ---------------------------------------------------------------------------
// get_code_hints

async function hintAnnotation(
  ctx: CodeContext,
  annotation: BlueprintAnnotation,
): Promise<Json> {
  const { refs } = ctx;
  const codeRefs = await Promise.all(
    annotation.codeRefs.map((c) => resolveCodeEntry(ctx, c.entry, c.key)),
  );
  const linked = await Promise.all(annotation.linked.map((a) => hintAnnotation(ctx, a)));
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
    ...(codeRefs.length > 0 ? { codeRefs } : {}),
    ...(linked.length > 0 ? { linked } : {}),
  };
}

async function hintNode(
  ctx: CodeContext,
  node: BlueprintNode,
  root: boolean,
): Promise<Json> {
  const { refs } = ctx;
  const annotations = await Promise.all(
    node.annotations.map((a) => hintAnnotation(ctx, a)),
  );
  const children = await Promise.all(node.children.map((c) => hintNode(ctx, c, false)));
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
    tree: await hintNode(ctx, blueprint.root, true),
  };
}
