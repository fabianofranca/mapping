import {
  codeLink,
  codeRefEntries,
  findPlatform,
  platformRepoOf,
  type ProjectPlatform,
} from './codeRefs';
import { fail } from './errors';
import { projectIndex } from './projectIndex';
import { instanceLabel, parseRefValue, refLabel, resolveRef, tableRows } from './refs';
import type { SpecCode, SpecField } from './spec';
import { typeOfAnnotation, type ResolvedType } from './specLookup';
import { isEmptyValue } from './typed';
import type {
  Annotation,
  CodeRefEntry,
  JsonValue,
  Marking,
  PlatformRepo,
  Project,
  Rect,
} from './types';

// Planta de código (`codeBlueprint`, etapa 3b): o que um agente precisa para
// implementar uma marcação numa plataforma, a partir das especializações aplicadas.
// Espelha a hierarquia da marcação e das descendentes; em cada marcação, as anotações
// tipadas com o `code` da plataforma (ou `symbol: null` quando falta o mapeamento),
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

/** Entrada de `codeRef` da anotação na plataforma pedida, com o link do repositório. */
export interface BlueprintCodeRef {
  /** Campo `codeRef`. */
  readonly key: string;
  readonly entry: CodeRefEntry;
  /** `codeLink` da entrada (`null` sem `urlTemplate`). */
  readonly url: string | null;
}

export interface BlueprintAnnotation {
  readonly annotationId: string;
  readonly specId: string;
  readonly typeId: string;
  /** Nome do tipo (ex: `Button`). */
  readonly type: string;
  /** Rótulo da instância (`name` ou `labelField`); `null` sem rótulo. */
  readonly label: string | null;
  /** Nome da camada no projeto (nas vinculadas, é o nome da propriedade na dona). */
  readonly layer: string | null;
  /** `code.<plataforma>.symbol`; `null` = o tipo não tem `code` para a plataforma. */
  readonly symbol: string | null;
  /** Parâmetros na ordem dos campos do tipo; vazio sem `code`. */
  readonly params: readonly BlueprintParam[];
  readonly notes: string | null;
  /**
   * Valores preenchidos, por campo e na ordem do tipo, como no mapping (sem traduzir):
   * `ref` pelo rótulo do alvo e `table` sem `_id`. Os `codeRef` ficam em `codeRefs`.
   * Servem às `notes` (ex: "use o valor do campo id").
   */
  readonly values: { readonly [key: string]: JsonValue };
  /** Onde a instância já foi implementada nesta plataforma. */
  readonly codeRefs: readonly BlueprintCodeRef[];
  /** Anotações vinculadas a esta (ex: eventos de um botão), com a mesma forma. */
  readonly linked: readonly BlueprintAnnotation[];
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
  /** Repositório configurado para a plataforma (`null` se não houver). */
  readonly repo: PlatformRepo | null;
  readonly root: BlueprintNode;
}

/** Valor do campo no blueprint: `ref` pelo rótulo, `table` sem `_id`, vazio `null`. */
function mappingValue(
  p: Project,
  field: SpecField,
  value: JsonValue | undefined,
): JsonValue {
  if (value === undefined || isEmptyValue(value)) return null;
  switch (field.type) {
    case 'ref': {
      const ref = parseRefValue(value);
      return ref && resolveRef(p, ref) ? refLabel(p, ref) : null;
    }
    case 'table':
      return tableRows(value).map((row) =>
        Object.fromEntries(field.columns.map((c) => [c.key, row[c.key] ?? null])),
      );
    case 'codeRef':
      return codeRefEntries(value);
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

function codeFor(resolved: ResolvedType, platformId: string): SpecCode | null {
  const code = resolved.type.code;
  return code && Object.hasOwn(code, platformId) ? (code[platformId] ?? null) : null;
}

/**
 * Planta de código da marcação `markingId` para a plataforma `platformId` (declarada por
 * alguma especialização aplicada; senão falha com `unknown-platform`). Em cada marcação
 * da árvore (ela e as descendentes, na ordem do projeto), as anotações tipadas próprias
 * (as herdadas aparecem na marcação de origem); anotações livres e de tipo inexistente
 * ficam de fora, mas os `ref` que apontam para elas aparecem pelo rótulo.
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
  ): BlueprintAnnotation => {
    seen.add(a.id);
    const values = a.values ?? {};
    const code = codeFor(resolved, platformId);
    const fields = resolved.type.fields;
    const params: BlueprintParam[] = [];
    const mapped: Record<string, JsonValue> = {};
    const codeRefs: BlueprintCodeRef[] = [];
    for (const field of fields) {
      const value = values[field.key];
      if (code?.params && Object.hasOwn(code.params, field.key)) {
        params.push({
          key: field.key,
          name: code.params[field.key] ?? field.key,
          value: paramValue(p, field, value, code),
        });
      }
      if (field.type === 'codeRef') {
        for (const entry of codeRefEntries(value)) {
          if (entry.platform !== platformId) continue;
          codeRefs.push({ key: field.key, entry, url: codeLink(p, entry) });
        }
        continue;
      }
      const v = mappingValue(p, field, value);
      if (v !== null && !(Array.isArray(v) && v.length === 0)) mapped[field.key] = v;
    }
    const linked = (index.annotationsByOwner.get(a.id) ?? []).flatMap((child) => {
      const childType = included.get(child.id);
      return childType && !seen.has(child.id)
        ? [annotationOf(child, childType, included, seen)]
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
      params,
      notes: code?.notes ?? null,
      values: mapped,
      codeRefs,
      linked,
    };
  };

  const visited = new Set<string>();
  const nodeOf = (m: Marking): BlueprintNode => {
    visited.add(m.id);
    const included = new Map<string, ResolvedType>();
    for (const a of index.annotationsByMarking.get(m.id) ?? []) {
      const resolved = typeOfAnnotation(p, a);
      if (resolved && a.values) included.set(a.id, resolved);
    }
    const seen = new Set<string>();
    const annotations: BlueprintAnnotation[] = [];
    for (const a of index.annotationsByMarking.get(m.id) ?? []) {
      const resolved = included.get(a.id);
      if (!resolved) continue;
      // Vinculada a outra anotação incluída: aparece sob a dona.
      if (a.parentAnnotationId !== null && included.has(a.parentAnnotationId)) continue;
      annotations.push(annotationOf(a, resolved, included, seen));
    }
    const children = (index.children.get(m.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(nodeOf);
    return {
      markingId: m.id,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      annotations,
      children,
    };
  };

  return {
    platform,
    repo: platformRepoOf(p, platformId),
    root: nodeOf(rootMarking),
  };
}
