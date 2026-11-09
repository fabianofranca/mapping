import { findSlot } from './components/arrange';
import type { ComponentFile } from './components/componentFormat';
import { parseIconsText, type IconSet } from './components/icons';
import { resolvePathChecked } from './components/library';
import { parseComponentText } from './components/parseComponent';
import { resolveTokens, type HostFonts, type ResolvedTokens } from './components/tokens';
import { MIN_STORED_MARKING_SIZE } from './geometry';
import { modelMessage, type ModelMessage } from './modelMessage';
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
  /** `"tipo: motivo"` dos componentes que não carregaram (texto pt-BR; o MCP lê este). */
  readonly problems: readonly string[];
  /** Os mesmos problemas, com código e parâmetros para a interface: mesmo tamanho e ordem. */
  readonly problemMessages: readonly ModelMessage[];
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
    const path = resolvePathChecked(specFile, type.component);
    if (path !== undefined) paths.add(path);
  }
  // O conjunto de ícones (`icons`) é lido junto: os componentes dependem dele para desenhar.
  const icons =
    spec.icons === undefined ? undefined : resolvePathChecked(specFile, spec.icons);
  if (icons !== undefined) paths.add(icons);
  return [...paths];
}

/** Os problemas de carga: o texto pt-BR e a mensagem com código, sempre empurrados juntos. */
export interface LoadProblems {
  readonly texts: string[];
  readonly messages: ModelMessage[];
}

/** Único ponto que registra um problema (mantém `problems` e `problemMessages` pareados). */
export function pushProblem(problems: LoadProblems, message: ModelMessage): void {
  problems.texts.push(message.text);
  problems.messages.push(message);
}

/** O componente que não passou no parse: o erro vem do parser (texto); sem erro, o padrão. */
function invalidComponent(typeId: string, reason: string | undefined): ModelMessage {
  return reason === undefined
    ? modelMessage(
        'components.invalidFallback',
        { typeId },
        `${typeId}: componente inválido`,
      )
    : modelMessage('components.invalid', { typeId, reason }, `${typeId}: ${reason}`);
}

/** O conjunto de ícones da especialização; arquivo ausente ou inválido vira um problema `icons: …`. */
function loadIcons(
  spec: Spec,
  specFile: string,
  readText: (projectPath: string) => string | undefined,
  problems: LoadProblems,
): IconSet | undefined {
  if (spec.icons === undefined) return undefined;
  const path = resolvePathChecked(specFile, spec.icons);
  if (path === undefined) {
    pushProblem(
      problems,
      modelMessage(
        'icons.outsideLibrary',
        { path: spec.icons },
        `icons: caminho fora da biblioteca: ${spec.icons}`,
      ),
    );
    return undefined;
  }
  const text = readText(path);
  if (text === undefined) {
    pushProblem(
      problems,
      modelMessage('icons.fileMissing', { path }, `icons: arquivo ausente (${path})`),
    );
    return undefined;
  }
  const parsed = parseIconsText(text);
  if (parsed.ok) return parsed.set;
  const reason = parsed.errors[0];
  pushProblem(
    problems,
    reason === undefined
      ? modelMessage('icons.invalidFallback', {}, 'icons: conjunto de ícones inválido')
      : modelMessage('icons.invalid', { reason }, `icons: ${reason}`),
  );
  return undefined;
}

/** O que vem de fora do modelo ao carregar: a fonte do hospedeiro e o modo do desenho. */
export interface LoadOptions {
  /** A pilha `--font-sans`/`--font-mono` do tema (ou o que o hospedeiro usa); ausente = genéricas. */
  readonly fonts?: HostFonts;
  /** Modo dos `tokens` da especialização; ausente ou não declarado = o primeiro. */
  readonly mode?: string;
}

/** A tabela de tokens de cada modo declarado (sem `tokens`: nenhuma). */
function tokensByMode(
  spec: Spec,
  fonts: HostFonts,
): Readonly<Record<string, ResolvedTokens>> | undefined {
  if (spec.tokens === undefined) return undefined;
  return Object.fromEntries(
    spec.tokens.modes.map((mode) => [mode, resolveTokens(spec.tokens, fonts, mode)]),
  );
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
  options: LoadOptions = {},
): SpecComponents {
  const byType = new Map<string, ComponentFile>();
  const problems: LoadProblems = { texts: [], messages: [] };
  const fonts = options.fonts ?? {};
  const resolvedTokens = resolveTokens(spec.tokens, fonts, options.mode);
  const resolvedTokensByMode = tokensByMode(spec, fonts);
  if (spec.formatVersion >= 4) {
    const resolvedIcons = loadIcons(spec, specFile, readText, problems);
    for (const type of typesWithComponent(spec)) {
      const path = resolvePathChecked(specFile, type.component);
      if (path === undefined) {
        pushProblem(
          problems,
          modelMessage(
            'components.outsideLibrary',
            { typeId: type.id, path: type.component },
            `${type.id}: caminho fora da biblioteca: ${type.component}`,
          ),
        );
        continue;
      }
      const text = readText(path);
      if (text === undefined) {
        pushProblem(
          problems,
          modelMessage(
            'components.fileMissing',
            { typeId: type.id, path },
            `${type.id}: arquivo ausente (${path})`,
          ),
        );
        continue;
      }
      const parsed = parseComponentText(text);
      if (!parsed.ok) {
        pushProblem(problems, invalidComponent(type.id, parsed.errors[0]));
        continue;
      }
      byType.set(type.id, {
        ...parsed.component,
        resolvedTokens,
        resolvedTokensByMode,
        ...(resolvedIcons === undefined ? {} : { resolvedIcons }),
      });
    }
  }
  return {
    specId: spec.id,
    version,
    byType,
    problems: problems.texts,
    problemMessages: problems.messages,
  };
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

/**
 * Nome do tipo que a marcação desenha: o da primeira anotação própria cujo tipo declara
 * componente, ou `null`. Não usa o catálogo de componentes (é deliberado): o rótulo da
 * instância sem nome funciona em qualquer lugar que tenha o projeto, sem ler arquivos.
 */
export function markingTypeName(p: Project, markingId: string): string | null {
  for (const annotation of projectIndex(p).annotationsByMarking.get(markingId) ?? []) {
    if (annotation.type === null || annotation.values === null) continue;
    const resolved = findSpecType(p, annotation.type);
    if (resolved !== null && resolved.type.component !== undefined) {
      return resolved.type.name;
    }
  }
  return null;
}

/** Componente com slot: o componente tem um slot que recebe marcações filhas. */
export function hasSlotComponent(component: ComponentFile): boolean {
  return findSlot(component) !== undefined;
}

/**
 * Mínimo do componente que desenha a marcação: o `minSize` dele ou, sem `minSize`, 1×1 (a
 * marcação com componente aceita a partir de 1 px); `null` na marcação comum (vale o mínimo
 * de 8 px dos gestos).
 */
export function componentMinSize(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): { width: number; height: number } | null {
  const drawn = markingComponent(p, catalog, markingId);
  return drawn === null ? null : componentFileMinSize(drawn.component);
}

/** O tamanho mínimo de uma instância do componente: o `minSize` dele ou o menor armazenável. */
export function componentFileMinSize(component: ComponentFile): {
  width: number;
  height: number;
} {
  const { minSize } = component;
  return {
    width: minSize?.width ?? MIN_STORED_MARKING_SIZE,
    height: minSize?.height ?? MIN_STORED_MARKING_SIZE,
  };
}
