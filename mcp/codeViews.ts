import {
  codeBlueprint,
  codeLocalPath,
  findPlatform,
  findSpecType,
  repoLink,
  resolveCode,
  specPlatformRepo,
  projectPlatforms,
  typeOfAnnotation,
  type Annotation,
  type BlueprintAnnotation,
  type BlueprintNode,
  type Spec,
  type SpecCode,
  type SpecRepo,
} from '../src/model';
import type { LocalFileChecker } from './codeFiles';
import { ToolError } from './errors';
import type { Refs } from './items';

// Visões em JSON do código de instanciação das especializações (etapa 3b.4; etapa 9; etapa
// Código de instanciação): o `code` das plataformas de cada tipo (`symbol`, o que se chama, e
// `definition`, o arquivo que o define, com a URL e a `ref` do `repo` da especialização e o
// caminho local da sobreposição do projeto) e as chamadas de `get_code_hints`. O servidor só monta caminhos e confere a existência
// (`codeFiles.ts`): nenhum arquivo de código é lido.

type Json = Record<string, unknown>;

/**
 * O que é o `code` de um tipo, repetido nas respostas que mostram plataformas
 * (`get_specialization`, `get_project`) para o conceito chegar ao agente por qualquer caminho.
 */
export const CODE_HINT =
  'O `code` de um tipo é o código de instanciação: `symbol` é o que se chama para criar uma instância do tipo nessa plataforma, `path` é o arquivo que define o `symbol` (leia a assinatura antes de escrever a chamada), `params` e `values` dizem como passar os campos, `notes` orienta. O repositório da biblioteca está em `platforms[].repo` da especialização; o clone local, em `platformRepos` do projeto. O mapeamento não guarda nada sobre a solução.';

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

/** Onde o arquivo está no clone local do cliente (`null`s sem `localPath` configurado). */
interface LocalPlace {
  readonly localFile: string | null;
  readonly exists: boolean | null;
  readonly problem?: string | undefined;
}

const NO_LOCAL: LocalPlace = { localFile: null, exists: null };

/**
 * `definition` de uma entrada de `code`: o arquivo que define o `symbol`, com a `url` e o
 * `ref` do `repo` da especialização e `localFile`/`exists` da sobreposição local do projeto.
 * `null` sem `path`.
 */
function definitionJson(
  path: string | null | undefined,
  repo: SpecRepo | null,
  local: LocalPlace,
): Json | null {
  if (path === null || path === undefined) return null;
  return {
    path,
    url: repoLink(repo, path),
    ref: repo?.ref ?? null,
    localFile: local.localFile,
    exists: local.exists,
    ...(local.problem ? { localFileProblem: local.problem } : {}),
  };
}

async function resolveDefinition(
  ctx: CodeContext,
  specId: string,
  platform: string,
  path: string | null | undefined,
): Promise<Json | null> {
  if (path === null || path === undefined) return null;
  const local = await ctx.files.check(
    ctx.refs.loaded.location.dir,
    codeLocalPath(ctx.refs.project, { specId, platform, path }),
  );
  return definitionJson(path, specPlatformRepo(ctx.refs.project, specId, platform), {
    localFile: local.localFile,
    exists: local.exists,
    problem: local.problem,
  });
}

/** Forma única de uma entrada de `code`: `symbol`, `definition` (ou `null`) e o resto (`params`, `values`, `notes`). */
function codeEntryJson(entry: SpecCode, definition: Json | null): Json {
  const { symbol, ...rest } = entry;
  delete (rest as { path?: string }).path;
  return { symbol, definition, ...rest };
}

/**
 * `code` do tipo da anotação por plataforma (`symbol`, `definition`, `params`, `values`,
 * `notes`), já resolvido pelos valores da anotação (o caso de `variants` aplicado; a saída
 * não traz `variants`). Com `platform`, só ela. `null` se o tipo não tem `code` (para essa
 * plataforma).
 */
export async function annotationCode(
  ctx: CodeContext,
  annotation: Annotation,
  platform?: string,
): Promise<Json | null> {
  const resolved = typeOfAnnotation(ctx.refs.project, annotation);
  const code = resolved?.type.code;
  if (!resolved || !code) return null;
  const { fields } = resolved.type;
  return typeCodeView(ctx, resolved.spec.id, code, platform, (entry) =>
    resolveCode(entry, annotation.values, fields),
  );
}

/**
 * `code` de um tipo (ou só as plataformas de `only`) na forma única, com a `definition`
 * resolvida; `null` se não sobrar nenhuma plataforma. `get_marking`, `get_annotation` e
 * `find_by_code` usam o mesmo. `resolveEntry` troca cada entrada antes (o código resolvido da
 * anotação); sem ele, o `code` cru do tipo (com `variants`).
 */
export async function typeCodeView(
  ctx: CodeContext,
  specId: string,
  code: Readonly<Record<string, SpecCode>>,
  only?: string | ReadonlySet<string>,
  resolveEntry?: (entry: SpecCode) => SpecCode,
): Promise<Json | null> {
  const wanted = (id: string) =>
    only === undefined || (typeof only === 'string' ? id === only : only.has(id));
  const entries = await Promise.all(
    Object.entries(code)
      .filter(([id]) => wanted(id))
      .map(async ([id, raw]): Promise<[string, Json]> => {
        const entry = resolveEntry ? resolveEntry(raw) : raw;
        return [
          id,
          codeEntryJson(entry, await resolveDefinition(ctx, specId, id, entry.path)),
        ];
      }),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * `code` de um tipo lido de um pacote (`get_component`): o `repo` vem da especialização do
 * pacote e, com `ctx` (pacote aplicado a um projeto), a sobreposição local também.
 */
export async function packageCodeView(
  spec: Spec,
  code: Readonly<Record<string, SpecCode>>,
  ctx: CodeContext | null,
): Promise<Json> {
  const entries = await Promise.all(
    Object.entries(code).map(async ([id, entry]): Promise<[string, Json]> => {
      const repo = spec.platforms?.find((x) => x.id === id)?.repo ?? null;
      let local = NO_LOCAL;
      if (ctx && entry.path) {
        const checked = await ctx.files.check(
          ctx.refs.loaded.location.dir,
          codeLocalPath(ctx.refs.project, {
            specId: spec.id,
            platform: id,
            path: entry.path,
          }),
        );
        local = {
          localFile: checked.localFile,
          exists: checked.exists,
          problem: checked.problem,
        };
      }
      return [id, codeEntryJson(entry, definitionJson(entry.path, repo, local))];
    }),
  );
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// get_code_hints

function hintAnnotation(
  annotation: BlueprintAnnotation,
  refs: Refs,
  codes: ReadonlyMap<string, Json>,
): Json {
  const linked = annotation.linked.map((a) => hintAnnotation(a, refs, codes));
  const code = codes.get(annotation.annotationId);
  return {
    ref: refs.bare('a', annotation.annotationId),
    type: `${annotation.specId}/${annotation.typeId}`,
    label: annotation.label,
    layer: annotation.layer,
    ...(code === undefined ? {} : { code }),
    ...(annotation.params.length > 0
      ? {
          args: annotation.params.map((param) => ({
            field: param.key,
            name: param.name,
            value: param.value,
          })),
        }
      : {}),
    ...(Object.keys(annotation.values).length > 0 ? { values: annotation.values } : {}),
    ...(linked.length > 0 ? { linked } : {}),
  };
}

function hintNode(
  node: BlueprintNode,
  refs: Refs,
  codes: ReadonlyMap<string, Json>,
  root: boolean,
): Json {
  const annotations = node.annotations.map((a) => hintAnnotation(a, refs, codes));
  const children = node.children.map((c) => hintNode(c, refs, codes, false));
  return {
    ref: root ? refs.ref('m', node.markingId) : refs.bare('m', node.markingId),
    name: node.name,
    rect: node.rect,
    ...(annotations.length > 0 ? { annotations } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Anotações da árvore, com as vinculadas. */
function allAnnotations(node: BlueprintNode): BlueprintAnnotation[] {
  const out: BlueprintAnnotation[] = [];
  const visitAnnotation = (a: BlueprintAnnotation) => {
    out.push(a);
    a.linked.forEach(visitAnnotation);
  };
  const visit = (n: BlueprintNode) => {
    n.annotations.forEach(visitAnnotation);
    n.children.forEach(visit);
  };
  visit(node);
  return out;
}

/**
 * `get_code_hints`: as chamadas a escrever na plataforma, a partir da marcação e das
 * descendentes. `types` traz, por `specId/typeId`, o código de instanciação do tipo (uma vez
 * só); a árvore traz, por anotação, só o que é da instância (`args`, `values`, `linked`).
 */
export async function codeHintsView(
  ctx: CodeContext,
  markingId: string,
  platformId: string,
): Promise<Json> {
  const { refs } = ctx;
  assertPlatform(refs, platformId);
  const blueprint = codeBlueprint(refs.project, markingId, platformId);
  const annotations = allAnnotations(blueprint.root);
  const unmapped = [
    ...new Set(
      annotations.filter((a) => a.symbol === null).map((a) => `${a.specId}/${a.typeId}`),
    ),
  ];
  const types: Record<string, Json> = {};
  // Tipo com `variants`: o código resolvido de cada anotação vai na árvore (`code`), porque
  // o `symbol`, o `path`, os `params` e as `notes` de `types` são os da base.
  const codes = new Map<string, Json>();
  for (const a of annotations) {
    if (a.symbol === null) continue;
    const key = `${a.specId}/${a.typeId}`;
    const type = findSpecType(refs.project, { specId: a.specId, typeId: a.typeId })?.type;
    const entry = type?.code?.[platformId];
    if (!type || !entry) continue;
    if (!Object.hasOwn(types, key)) {
      types[key] = {
        name: a.type,
        ...codeEntryJson(
          entry,
          await resolveDefinition(ctx, a.specId, platformId, entry.path),
        ),
      };
    }
    if (entry.variants !== undefined) {
      const resolved = resolveCode(entry, a.values, type.fields);
      codes.set(
        a.annotationId,
        codeEntryJson(
          resolved,
          await resolveDefinition(ctx, a.specId, platformId, resolved.path),
        ),
      );
    }
  }
  return {
    marking: refs.ref('m', markingId),
    platform: {
      id: blueprint.platform.id,
      name: blueprint.platform.name,
      language: blueprint.platform.language,
    },
    repos: blueprint.repo === null ? {} : { [platformId]: blueprint.repo },
    types,
    ...(unmapped.length > 0
      ? {
          unmappedTypes: unmapped,
          hint: 'tipos em `unmappedTypes` não têm `code` nesta plataforma na especialização: não há código de instanciação mapeado para eles',
        }
      : {}),
    tree: hintNode(blueprint.root, refs, codes, true),
  };
}
