import type { ComponentFile } from './components/componentFormat';
import { applyTokens, type ResolvedTokens } from './components/tokens';
import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Project } from './types';

// Modo do desenho (schema v18, etapa "componentes fiéis"): escolhe o modo dos `tokens` das
// especializações (`light`, `dark`…). É do projeto; o container pode fixar o seu. Não depende do
// tema claro/escuro da interface. Funções puras, sem DOM.

/** Padrão do nome de um modo (o mesmo de `tokens.modes` na especialização). */
const MODE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function checkMode(mode: string): string {
  if (!MODE_PATTERN.test(mode)) fail('invalid-name');
  return mode;
}

/** Troca o modo do projeto; `null` o remove (volta ao primeiro modo de cada especialização). */
export function setProjectDrawingMode(p: Project, mode: string | null): Project {
  if (mode === null) {
    if (p.drawingMode === undefined) return p;
    return Object.fromEntries(
      Object.entries(p).filter(([key]) => key !== 'drawingMode'),
    ) as unknown as Project;
  }
  checkMode(mode);
  return p.drawingMode === mode ? p : { ...p, drawingMode: mode };
}

/** Fixa o modo do container; `null` volta a seguir o do projeto. */
export function setContainerDrawingMode(
  p: Project,
  containerId: string,
  mode: string | null,
): Project {
  const container = p.containers.find((c) => c.id === containerId);
  if (container === undefined) return fail('not-found', containerId);
  const next = mode === null ? null : checkMode(mode);
  if ((container.drawingMode ?? null) === next) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => ({
      ...c,
      drawingMode: next,
    })),
  };
}

/**
 * Modo efetivo de um espaço: o que o container fixa, senão o do projeto, senão `undefined` (o
 * primeiro modo de cada especialização). `containerId` nulo = o canvas (segue o projeto).
 */
export function effectiveDrawingMode(
  p: Project,
  containerId: string | null,
): string | undefined {
  if (containerId !== null) {
    const fixed = projectIndex(p).containers.get(containerId)?.drawingMode;
    if (fixed != null) return fixed;
  }
  return p.drawingMode;
}

/** A união dos `modes` das especializações (na ordem em que aparecem, sem repetir). */
export function drawingModesOf(
  tokens: ReadonlyArray<{ readonly modes: readonly string[] } | undefined>,
): string[] {
  const out: string[] = [];
  for (const entry of tokens) {
    for (const mode of entry?.modes ?? []) if (!out.includes(mode)) out.push(mode);
  }
  return out;
}

/** Modos gravados (do projeto e dos containers) que nenhuma especialização declara. */
export function undeclaredDrawingMode(p: Project, declared: readonly string[]): string[] {
  const stored = [p.drawingMode, ...p.containers.map((c) => c.drawingMode)];
  const out: string[] = [];
  for (const mode of stored) {
    if (mode != null && !declared.includes(mode) && !out.includes(mode)) out.push(mode);
  }
  return out;
}

/**
 * O componente como o desenho o usa: com cada `$token` trocado pela tabela do modo efetivo do
 * espaço (`resolvedTokensByMode[modo]`; sem modo ou sem a tabela, a de `resolvedTokens`). Arrumar,
 * posicionar e medir passam por aqui antes de ler o slot, para o `gap` e o `padding` em `$token`
 * valerem o mesmo que na tela. `tokens` vai na opção `tokens` do `instantiate`.
 */
export function componentForDrawing(
  p: Project,
  component: ComponentFile,
  containerId: string | null,
): { readonly component: ComponentFile; readonly tokens: ResolvedTokens | undefined } {
  const mode = effectiveDrawingMode(p, containerId);
  const tokens =
    (mode === undefined ? undefined : component.resolvedTokensByMode?.[mode]) ??
    component.resolvedTokens;
  return {
    component: tokens === undefined ? component : applyTokens(component, tokens),
    tokens,
  };
}
