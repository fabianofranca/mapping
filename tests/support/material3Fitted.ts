// MC5 (#1033, etapa #898): desenho da biblioteca Material 3 (Compose) no tamanho ajustado ao conteúdo,
// a medida que o Arrumar, o `fit_marking` e a instância nova usam (`fitComponentSize`).
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { fitComponentSize } from '../../src/model/components/sizing';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files } from './material3Library';

export const catalog = buildCatalog(files);

export type Mode = 'light' | 'dark';
export type Values = Record<string, string | number | null>;

/** O tipo no catálogo (falha se não existir). */
export function entryOf(id: string): NonNullable<ReturnType<typeof findEntry>> {
  const entry = findEntry(catalog, id);
  if (entry === undefined || entry.component === null) throw new Error(`tipo ${id} ausente`);
  return entry;
}

function optionsOf(mode: Mode) {
  const library = catalog.library;
  if (library === null) throw new Error('sem biblioteca');
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
}

/**
 * O tamanho que o componente tem com o conteúdo de `values` (o do ajuste, com o medidor aproximado):
 * o `size` quando nenhum eixo depende do conteúdo. Devolve também os avisos da medida.
 */
export function fittedSize(id: string, values: Values, mode: Mode = 'light') {
  const entry = entryOf(id);
  const all = { ...defaultValues(entry.type), ...values };
  const fit = fitComponentSize(entry.component!, all, optionsOf(mode));
  const size = entry.component!.size;
  return {
    width: fit?.width ?? size.width,
    height: fit?.height ?? size.height,
    messages: fit?.messages ?? [],
    fitted: fit !== undefined,
  };
}

/** Desenha o componente no tamanho ajustado ao conteúdo (a largura dada, quando o eixo não é medido). */
export function drawFitted(
  id: string,
  values: Values,
  mode: Mode = 'light',
  override: { width?: number; height?: number } = {},
) {
  const entry = entryOf(id);
  const all = { ...defaultValues(entry.type), ...values };
  const size = fittedSize(id, values, mode);
  const box = {
    x: 0,
    y: 0,
    width: override.width ?? size.width,
    height: override.height ?? size.height,
  };
  const drawing = instantiate(entry.component!, all, box, optionsOf(mode));
  return { box, drawing };
}

/** Um nó do template (por nome e tipo) com o `baselinePadding` declarado, em qualquer ramo do template. */
export function templateNodes(
  id: string,
  name: string,
): readonly Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.name === name && typeof record.type === 'string') found.push(record);
    Object.values(record).forEach(walk);
  };
  walk(entryOf(id).component!.template);
  return found;
}
