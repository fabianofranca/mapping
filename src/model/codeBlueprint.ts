import {
  codeLink,
  findPlatform,
  platformRepoOf,
  type ProjectPlatform,
} from './codeLocations';
import { resolveCode } from './codeVariants';
import { fail } from './errors';
import { projectIndex } from './projectIndex';
import { instanceLabel, parseRefValue, refLabel, resolveRef, tableRows } from './refs';
import type { SpecCode, SpecField } from './spec';
import { typeOfAnnotation, type ResolvedType } from './specLookup';
import { isEmptyValue } from './typed';
import type { Annotation, JsonValue, Marking, Project, Rect, WholeRef } from './types';

// `codeBlueprint` (etapa 3b): as chamadas que um agente precisa escrever, numa plataforma,
// para instanciar uma marcação, a partir das especializações aplicadas. O `code` de um tipo
// diz com que código se cria uma instância dele (`symbol` é o que se chama, `path` o arquivo
// que o define); aqui entram também os valores de cada instância. Espelha a hierarquia da
// marcação e das descendentes; em cada marcação, as anotações tipadas com o `code` da
// plataforma (ou `symbol: null` quando falta o mapeamento),
// com as vinculadas sob a dona. Função pura: a app e o MCP (`get_code_hints`) usam a mesma.

/** Parâmetro do componente na plataforma (`code.<plataforma>.params`). */
export interface BlueprintParam {
  /** Campo do tipo. */
  readonly key: string;
  /** Nome do parâmetro no código. */
  readonly name: string;
  /**
   * Valor pronto para o código: `enum` traduzido por `code.<plataforma>.values` (sem
   * tradução, como está); `ref` pelo rótulo do alvo (ex: `User.name`; quebrada: `null`);
   * `table` com as linhas (só as colunas, sem `_id`; vazia: `[]`); vazio: `null`.
   */
  readonly value: JsonValue;
}

export interface BlueprintAnnotation {
  readonly annotationId: string;
  readonly specId: string;
  readonly typeId: string;
  /** Nome do tipo (ex: `Button`). */
  readonly type: string;
  /** Rótulo da instância (`name` ou `labelField`); `null` sem rótulo. */
  readonly label: string | null;
  /** Nome da camada no projeto, da anotação; `null` se a camada não existe. */
  readonly layer: string | null;
  /** `code.<plataforma>.symbol`; `null` = o tipo não tem `code` para a plataforma. */
  readonly symbol: string | null;
  /** `code.<plataforma>.path`: arquivo que define o símbolo, relativo à raiz do repositório; `null` sem ele. */
  readonly path: string | null;
  /**
   * `codeLink` do `path`, pelo `repo` da especialização dona do tipo (`null` sem `path` ou
   * sem `urlTemplate` no `repo` da especialização).
   */
  readonly pathUrl: string | null;
  /** Parâmetros na ordem dos campos do tipo; vazio sem `code`. */
  readonly params: readonly BlueprintParam[];
  readonly notes: string | null;
  /**
   * Valores preenchidos, por campo e na ordem do tipo, como no mapping (sem traduzir):
   * `ref` pelo rótulo do alvo e `table` sem `_id`. Servem às `notes` (ex: "use o valor
   * do campo id").
   */
  readonly values: { readonly [key: string]: JsonValue };
  /** Anotações vinculadas a esta (ex: eventos de um botão), com a mesma forma. */
  readonly linked: readonly BlueprintAnnotation[];
  /**
   * Alvos dos `ref` para a anotação inteira (v17) nos campos e nas células, um por `ref`, na
   * ordem dos campos e das linhas. Os `ref` de campo, de linha e de par livre não entram.
   */
  readonly targets: readonly BlueprintTarget[];
}

/** Um `ref` para a anotação inteira, com o alvo expandido. */
export interface BlueprintTarget {
  /** Campo da anotação de origem (a tabela, numa célula). */
  readonly field: string;
  /** Índice da linha (de 0), ou `null` num campo `ref` simples. */
  readonly row: number | null;
  /** Coluna `ref` da tabela, ou `null` num campo simples. */
  readonly column: string | null;
  /** Rótulo do alvo (o mesmo de `values` e `args`). */
  readonly label: string | null;
  /** O alvo já apareceu no caminho: vem só o rótulo, sem `annotation` nem `children`. */
  readonly repeated: boolean;
  /** O alvo na forma da árvore; `null` quando `repeated`. */
  readonly annotation: BlueprintAnnotation | null;
  /** As marcações filhas da marcação do alvo, para o componente que contém outros. */
  readonly children: readonly BlueprintNode[];
}

export interface BlueprintNode {
  readonly markingId: string;
  readonly name: string | null;
  /** Em pixels da imagem original (ajuda a ordenar e posicionar os filhos). */
  readonly rect: Rect;
  /** Anotações tipadas da marcação que não são vinculadas a outra, na ordem do projeto. */
  readonly annotations: readonly BlueprintAnnotation[];
  readonly children: readonly BlueprintNode[];
}

export interface CodeBlueprint {
  readonly platform: ProjectPlatform;
  /**
   * Repositório da plataforma: `url` e `ref` vêm do `repo` da primeira especialização
   * aplicada que o declara (cada tipo traz o próprio link em `pathUrl`, pela especialização
   * dona dele) e `localPath` da sobreposição do projeto. `null` sem `repo` nem `localPath`.
   */
  readonly repo: {
    readonly url: string | null;
    readonly ref: string | null;
    readonly localPath: string | null;
  } | null;
  readonly root: BlueprintNode;
}

/** O rótulo do alvo de uma referência (campo ou célula); `null` se vazia ou quebrada. */
function refText(p: Project, value: JsonValue | undefined): JsonValue {
  if (value === undefined || isEmptyValue(value)) return null;
  const ref = parseRefValue(value);
  // O rótulo usa os textos padrão (pt-BR): este módulo só é usado pelo MCP.
  return ref && resolveRef(p, ref) ? refLabel(p, ref) : null;
}

/** Valor do campo no blueprint: `ref` pelo rótulo, `table` sem `_id`, vazio `null`. */
function mappingValue(
  p: Project,
  field: SpecField,
  value: JsonValue | undefined,
): JsonValue {
  if (value === undefined || isEmptyValue(value)) return null;
  switch (field.type) {
    case 'ref':
      return refText(p, value);
    case 'table':
      return tableRows(value).map((row) =>
        Object.fromEntries(
          field.columns.map((c) => [
            c.key,
            c.type === 'ref' ? refText(p, row[c.key]) : (row[c.key] ?? null),
          ]),
        ),
      );
    default:
      return value;
  }
}

/** Valor do parâmetro: o do mapping, com o `enum` traduzido por `values`. */
function paramValue(
  p: Project,
  field: SpecField,
  value: JsonValue | undefined,
  code: SpecCode,
): JsonValue {
  const mapped = mappingValue(p, field, value);
  if (field.type !== 'enum' || typeof mapped !== 'string') return mapped;
  const translations = code.values?.[field.key];
  return translations && Object.hasOwn(translations, mapped)
    ? (translations[mapped] ?? mapped)
    : mapped;
}

/** O `code` da plataforma já resolvido pelos valores da anotação (`variants`); `null` sem `code`. */
function codeFor(
  resolved: ResolvedType,
  platformId: string,
  values: Readonly<Record<string, JsonValue>>,
): SpecCode | null {
  const code = resolved.type.code;
  const own = code && Object.hasOwn(code, platformId) ? code[platformId] : undefined;
  return own === undefined ? null : resolveCode(own, values, resolved.type.fields);
}

/** Um `ref` para a anotação inteira num campo ou numa célula. */
interface WholeSite {
  readonly field: string;
  readonly row: number | null;
  readonly column: string | null;
  readonly ref: WholeRef;
}

function wholeRefOf(value: JsonValue | undefined): WholeRef | null {
  const ref = parseRefValue(value);
  return ref && Object.keys(ref).length === 1 ? (ref as WholeRef) : null;
}

/** Os `ref` de anotação inteira dos campos e das células, na ordem dos campos e das linhas. */
function wholeSites(
  fields: readonly SpecField[],
  values: Readonly<Record<string, JsonValue>>,
): WholeSite[] {
  const sites: WholeSite[] = [];
  for (const field of fields) {
    if (field.type === 'ref') {
      const ref = wholeRefOf(values[field.key]);
      if (ref) sites.push({ field: field.key, row: null, column: null, ref });
    } else if (field.type === 'table') {
      tableRows(values[field.key]).forEach((row, index) => {
        for (const column of field.columns) {
          const ref = column.type === 'ref' ? wholeRefOf(row[column.key]) : null;
          if (ref) sites.push({ field: field.key, row: index, column: column.key, ref });
        }
      });
    }
  }
  return sites;
}

/**
 * Planta de código da marcação `markingId` para a plataforma `platformId` (declarada por
 * alguma especialização aplicada; senão falha com `unknown-platform`). Em cada marcação
 * da árvore (ela e as descendentes, na ordem do projeto), as anotações tipadas próprias;
 * anotações livres e de tipo inexistente ficam de fora, mas os `ref` que apontam para elas aparecem pelo rótulo.
 */
export function codeBlueprint(
  p: Project,
  markingId: string,
  platformId: string,
): CodeBlueprint {
  const index = projectIndex(p);
  const rootMarking = index.markings.get(markingId) ?? fail('not-found', markingId);
  const platform = findPlatform(p, platformId) ?? fail('unknown-platform', platformId);

  const annotationOf = (
    a: Annotation,
    resolved: ResolvedType,
    included: ReadonlyMap<string, ResolvedType>,
    seen: Set<string>,
    path: ReadonlySet<string>,
  ): BlueprintAnnotation => {
    seen.add(a.id);
    const here = new Set(path).add(a.id);
    const values = a.values ?? {};
    const code = codeFor(resolved, platformId, values);
    const fields = resolved.type.fields;
    const params: BlueprintParam[] = [];
    const mapped: Record<string, JsonValue> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (code?.params && Object.hasOwn(code.params, field.key)) {
        params.push({
          key: field.key,
          name: code.params[field.key] ?? field.key,
          value: paramValue(p, field, value, code),
        });
      }
      const v = mappingValue(p, field, value);
      if (v !== null && !(Array.isArray(v) && v.length === 0)) mapped[field.key] = v;
    }
    const linked = (index.annotationsByOwner.get(a.id) ?? []).flatMap((child) => {
      const childType = included.get(child.id);
      return childType && !seen.has(child.id)
        ? [annotationOf(child, childType, included, seen, here)]
        : [];
    });
    return {
      annotationId: a.id,
      specId: resolved.spec.id,
      typeId: resolved.type.id,
      type: resolved.type.name,
      label: instanceLabel(p, a),
      layer: index.layers.get(a.layerId)?.name ?? null,
      symbol: code?.symbol ?? null,
      path: code?.path ?? null,
      pathUrl: code?.path
        ? codeLink(p, {
            specId: resolved.spec.id,
            platform: platformId,
            path: code.path,
          })
        : null,
      params,
      notes: code?.notes ?? null,
      values: mapped,
      linked,
      targets: wholeSites(fields, values).flatMap((site) => {
        const target = targetOf(site, here);
        return target ? [target] : [];
      }),
    };
  };

  /** O alvo de um `ref` de anotação inteira; `null` se quebrado ou sem tipo (fica o rótulo). */
  const targetOf = (
    site: WholeSite,
    path: ReadonlySet<string>,
  ): BlueprintTarget | null => {
    const target = index.annotations.get(site.ref.annotationId);
    const resolved = target ? typeOfAnnotation(p, target) : null;
    if (!target || !resolved) return null;
    const base = {
      field: site.field,
      row: site.row,
      column: site.column,
      // Textos padrão (pt-BR): só o MCP usa este módulo.
      label: refLabel(p, site.ref),
    };
    if (path.has(target.id)) {
      return { ...base, repeated: true, annotation: null, children: [] };
    }
    // O alvo entra no caminho ao descer: um `ref` que volta a ele vira nó `repeated`.
    const here = new Set(path).add(target.id);
    const annotation = annotationOf(
      target,
      resolved,
      includedFor(target.markingId),
      new Set(),
      here,
    );
    const children = (index.children.get(target.markingId) ?? []).map((child) =>
      nodeOf(child, new Set(), here),
    );
    return { ...base, repeated: false, annotation, children };
  };

  const includedFor = (markingId: string): Map<string, ResolvedType> => {
    const included = new Map<string, ResolvedType>();
    for (const a of index.annotationsByMarking.get(markingId) ?? []) {
      const resolved = typeOfAnnotation(p, a);
      if (resolved && a.values) included.set(a.id, resolved);
    }
    return included;
  };

  const visited = new Set<string>();
  const nodeOf = (
    m: Marking,
    seenMarkings: Set<string>,
    path: ReadonlySet<string>,
  ): BlueprintNode => {
    seenMarkings.add(m.id);
    const included = includedFor(m.id);
    const seen = new Set<string>();
    const annotations: BlueprintAnnotation[] = [];
    for (const a of index.annotationsByMarking.get(m.id) ?? []) {
      const resolved = included.get(a.id);
      if (!resolved) continue;
      // Vinculada a outra anotação incluída: aparece sob a dona.
      if (a.parentAnnotationId !== null && included.has(a.parentAnnotationId)) continue;
      annotations.push(annotationOf(a, resolved, included, seen, path));
    }
    const children = (index.children.get(m.id) ?? [])
      .filter((child) => !seenMarkings.has(child.id))
      .map((child) => nodeOf(child, seenMarkings, path));
    return {
      markingId: m.id,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      annotations,
      children,
    };
  };

  const specRepo = platform.repos[0]?.repo;
  const localPath = platformRepoOf(p, platformId)?.localPath ?? null;
  return {
    platform,
    repo:
      specRepo === undefined && localPath === null
        ? null
        : { url: specRepo?.url ?? null, ref: specRepo?.ref ?? null, localPath },
    root: nodeOf(rootMarking, visited, new Set()),
  };
}
