/**
 * Cor herdada (formato 4): o que o `slot` de um ancestral oferece (`provide`) e o que a filha lê
 * (`$provided`). Funções puras sobre o componente e os valores já resolvidos; quem percorre a
 * árvore (o cache dos desenhos, a tela do visualizador e do laboratório) usa estas.
 */
import type { ComponentFile, SlotTemplate } from './componentFormat';
import type { ProvidedValues } from './expressions';

export type { ProvidedValues };

/** Nenhum valor oferecido (o mesmo objeto sempre, para comparar por identidade). */
export const NO_PROVIDED: ProvidedValues = Object.freeze({});

const NO_NAMES: readonly string[] = Object.freeze([]);

/** Percorre o objeto JSON do template (`children` e `template` do repeat) atrás de `visit`. */
function walk(node: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit));
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  visit(record);
  for (const value of Object.values(record)) walk(value, visit);
}

/** Um objeto que é a expressão `$provided` (só `$provided` e `default`), não um `provide` com esse nome. */
function isReadExpr(record: Record<string, unknown>): boolean {
  return Object.keys(record).every((key) => key === '$provided' || key === 'default');
}

const readsCache = new WeakMap<ComponentFile, readonly string[]>();

/** Os nomes que o template lê com `$provided`, sem repetição e em ordem; memoizado por componente. */
export function providedReads(component: ComponentFile): readonly string[] {
  const hit = readsCache.get(component);
  if (hit !== undefined) return hit;
  const names = new Set<string>();
  walk(component.template, (record) => {
    if (typeof record.$provided === 'string' && isReadExpr(record))
      names.add(record.$provided);
  });
  const result = names.size === 0 ? NO_NAMES : [...names].sort();
  readsCache.set(component, result);
  return result;
}

/** O primeiro `slot` do template com `provide` (o mesmo slot que `findSlot` acha), ou nenhum. */
export function providingSlot(component: ComponentFile): SlotTemplate | undefined {
  if (slotCache.has(component)) return slotCache.get(component);
  const found = searchProvidingSlot(component);
  slotCache.set(component, found);
  return found;
}

const slotCache = new WeakMap<ComponentFile, SlotTemplate | undefined>();

function searchProvidingSlot(component: ComponentFile): SlotTemplate | undefined {
  const search = (node: unknown): SlotTemplate | undefined => {
    if (typeof node !== 'object' || node === null) return undefined;
    const record = node as { type?: unknown; children?: unknown };
    if (record.type === 'slot') return node as SlotTemplate;
    if (record.type !== 'frame' || !Array.isArray(record.children)) return undefined;
    for (const child of record.children as unknown[]) {
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  const slot = search(component.template);
  return slot?.provide === undefined || Object.keys(slot.provide).length === 0
    ? undefined
    : slot;
}

/** A parte de `scope` que o componente lê; `NO_PROVIDED` se ele não lê nada (o caso comum). */
export function pickProvided(
  scope: ProvidedValues,
  component: ComponentFile,
): ProvidedValues {
  const names = providedReads(component);
  if (names.length === 0) return NO_PROVIDED;
  const picked: Record<string, string | number> = {};
  for (const name of names) {
    const value = Object.hasOwn(scope, name) ? scope[name] : undefined;
    if (value !== undefined) picked[name] = value;
  }
  return Object.keys(picked).length === 0 ? NO_PROVIDED : picked;
}

/** Os mesmos nomes com os mesmos valores. */
export function sameProvided(a: ProvidedValues, b: ProvidedValues): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

/** O que as filhas de um pai herdam: o que o pai herdou, com o que ele oferece por cima (o mais próximo vale). */
export function extendProvided(
  inherited: ProvidedValues,
  offered: ProvidedValues | undefined,
): ProvidedValues {
  if (offered === undefined || Object.keys(offered).length === 0) return inherited;
  return { ...inherited, ...offered };
}
