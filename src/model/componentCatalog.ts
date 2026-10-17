import { findSlot } from './components/arrange';
import type { ComponentFile } from './components/componentFormat';
import { resolvePath } from './components/library';
import { parseComponentText } from './components/parseComponent';
import { projectIndex } from './projectIndex';
import type { Spec, SpecAnnotationType } from './spec';
import { findSpecType } from './specLookup';
import type { Annotation, Project } from './types';

// Catálogo de componentes (etapa Biblioteca, B3): os componentes das especializações aplicadas
// (pacote `specs/<id>/`, `formatVersion` 4), lidos uma vez e guardados em memória. O
// `mapping.json` nunca guarda o desenho: o catálogo é montado por quem lê os arquivos
// (sessão, MCP) e entregue às funções puras do modelo. Sem DOM, sem leitura de disco.

export interface SpecComponents {
  readonly specId: string;
  /** Versão da especialização de onde os componentes foram lidos. */
  readonly version: number;
  /** Id do tipo → componente válido. */
  readonly byType: ReadonlyMap<string, ComponentFile>;
  /** `"tipo: motivo"` dos componentes que não carregaram. */
  readonly problems: readonly string[];
}

/** Por id de especialização. */
export type ComponentCatalog = ReadonlyMap<string, SpecComponents>;

export const EMPTY_CATALOG: ComponentCatalog = new Map();

/** Tipos da especialização que citam um componente, na ordem das camadas e dos tipos. */
function typesWithComponent(
  spec: Spec,
): readonly { readonly id: string; readonly component: string }[] {
  const types: { id: string; component: string }[] = [];
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      if (type.component !== undefined) {
        types.push({ id: type.id, component: type.component });
      }
    }
  }
  return types;
}

/**
 * Caminhos (relativos à raiz do projeto) dos arquivos de componente citados pela
 * especialização, sem repetição, na ordem dos tipos. `specFile` é o arquivo da especialização
 * (`specs/material3/material3.spec.json`): o `component` do tipo é relativo a ele.
 */
export function componentPaths(spec: Spec, specFile: string): string[] {
  const paths = new Set<string>();
  for (const type of typesWithComponent(spec)) {
    paths.add(resolvePath(specFile, type.component));
  }
  return [...paths];
}

/**
 * Lê e valida os componentes da especialização. `readText` devolve o texto de um caminho da
 * raiz do projeto, ou `undefined` se o arquivo não existe. Um componente ruim vira um
 * problema `"<tipo>: <motivo>"` e o tipo fica sem componente (as marcações dele seguem
 * comuns). Especialização v1 a v3, ou sem `component`, dá um `byType` vazio.
 */
export function loadSpecComponents(
  spec: Spec,
  specFile: string,
  version: number,
  readText: (projectPath: string) => string | undefined,
): SpecComponents {
  const byType = new Map<string, ComponentFile>();
  const problems: string[] = [];
  if (spec.formatVersion >= 4) {
    for (const type of typesWithComponent(spec)) {
      const path = resolvePath(specFile, type.component);
      const text = readText(path);
      if (text === undefined) {
        problems.push(`${type.id}: arquivo ausente (${path})`);
        continue;
      }
      const parsed = parseComponentText(text);
      if (!parsed.ok) {
        problems.push(`${type.id}: ${parsed.errors[0] ?? 'componente inválido'}`);
        continue;
      }
      byType.set(type.id, parsed.component);
    }
  }
  return { specId: spec.id, version, byType, problems };
}

export interface MarkingComponent {
  /** A anotação tipada que desenha a marcação. */
  readonly annotation: Annotation;
  readonly specId: string;
  readonly typeId: string;
  readonly type: SpecAnnotationType;
  readonly component: ComponentFile;
}

/**
 * A anotação que desenha a marcação, ou `null`: a **primeira** anotação tipada própria da
 * marcação (na ordem de `annotations`) cujo tipo tem componente no catálogo, com a versão do
 * catálogo igual à da especialização aplicada. As herdadas não desenham (são o "modelo").
 * Sem componente a marcação é comum.
 */
export function markingComponent(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): MarkingComponent | null {
  if (catalog.size === 0) return null;
  const index = projectIndex(p);
  for (const annotation of index.annotationsByMarking.get(markingId) ?? []) {
    if (annotation.type === null || annotation.values === null) continue;
    const { specId, typeId } = annotation.type;
    const components = catalog.get(specId);
    if (components === undefined) continue;
    if (index.specializations.get(specId)?.version !== components.version) continue;
    const component = components.byType.get(typeId);
    if (component === undefined) continue;
    const resolved = findSpecType(p, annotation.type);
    if (resolved === null) continue;
    return { annotation, specId, typeId, type: resolved.type, component };
  }
  return null;
}

/** Container: o componente tem um slot que recebe marcações filhas. */
export function isContainerComponent(component: ComponentFile): boolean {
  return findSlot(component) !== undefined;
}

/** `minSize` do componente que desenha a marcação, ou `null` (marcação comum ou componente sem mínimo). */
export function componentMinSize(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): { width: number; height: number } | null {
  const minSize = markingComponent(p, catalog, markingId)?.component.minSize;
  return minSize === undefined ? null : { width: minSize.width, height: minSize.height };
}
