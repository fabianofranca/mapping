// MC5 (#1033, stage #898): drawing of the Material 3 (Compose) library at the size fitted to the content,
// the measure that Arrange, `fit_marking` and the new instance use (`fitComponentSize`).
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { instantiate } from '../../src/model/components/instantiate';
import { fitComponentSize } from '../../src/model/components/sizing';
import { defaultValues } from '../../src/model/libraryDrawing';
import { files, instantiateOptions } from './material3Library';

export const catalog = buildCatalog(files);

export type Mode = 'light' | 'dark';
export type Values = Readonly<Record<string, unknown>>;

/** The type in the catalog (fails if it does not exist). */
export function entryOf(id: string): NonNullable<ReturnType<typeof findEntry>> {
  const entry = findEntry(catalog, id);
  if (entry === undefined || entry.component === null)
    throw new Error(`type ${id} missing`);
  return entry;
}

const optionsOf = (mode: Mode) => instantiateOptions(catalog, mode);

/**
 * The size the component has with the content of `values` (the fit one, with the approximate measurer):
 * the `size` when no axis depends on the content. Also returns the warnings of the measure.
 */
export function fittedSize(id: string, values: Values, mode: Mode = 'light') {
  const entry = entryOf(id);
  const all = { ...defaultValues(entry.type), ...values } as Record<
    string,
    string | number | null
  >;
  const fit = fitComponentSize(entry.component!, all, optionsOf(mode));
  const size = entry.component!.size;
  return {
    width: fit?.width ?? size.width,
    height: fit?.height ?? size.height,
    messages: fit?.messages ?? [],
    fitted: fit !== undefined,
  };
}

/** Draws the component at the size fitted to the content (the given width, when the axis is not measured). */
export function drawFitted(
  id: string,
  values: Values,
  mode: Mode = 'light',
  override: { width?: number; height?: number } = {},
) {
  const entry = entryOf(id);
  const all = { ...defaultValues(entry.type), ...values } as Record<
    string,
    string | number | null
  >;
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

/** A template node (by name and type) with the declared `baselinePadding`, in any branch of the template. */
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
