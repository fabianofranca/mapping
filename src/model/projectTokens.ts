import { effectiveDrawingMode } from './drawingMode';
import type { ComponentFile } from './components/componentFormat';
import {
  builtinNamedLookup,
  chainNamedLookups,
  createTokenTables,
  declaredNamedLookup,
  type NamedTokenLookup,
  type SpecTokens,
  type TokenTables,
} from './components/tokens';
import type { Project } from './types';

// The project lookup of `$tokenNamed` (stage #2825, decisions 9 and 10): a token named by a field value is
// searched among the tokens each applied specialization DECLARES, in the space's effective drawing
// selection (the container's axes over the project's, as the container background does). Pure, no DOM.

/** Token tables by the `spec.tokens` object, so they survive the new `Project` objects of a gesture. */
const tablesByTokens = new WeakMap<object, TokenTables>();

/** The (shared) token tables of a specialization's `tokens`; none without tokens. */
export function tokenTablesOf(tokens: SpecTokens | undefined): TokenTables | undefined {
  if (tokens === undefined) return undefined;
  let tables = tablesByTokens.get(tokens);
  if (tables === undefined) {
    tables = createTokenTables(tokens, {});
    tablesByTokens.set(tokens, tables);
  }
  return tables;
}

/**
 * Where a marking's component reads a token by name: the component's own library first (the one it was
 * loaded from), then the other applied specializations in `specializations[]` order, then `font-sans` and
 * `font-mono`; each library in the effective selection of `containerId`'s space (`null` = the canvas, which
 * follows the project). The first value with the position's kind wins; a name that is a number, a composite
 * or the other kind is skipped.
 */
export function projectNamedLookup(
  p: Project,
  component: ComponentFile,
  containerId: string | null,
): NamedTokenLookup {
  // Built on the first read: most components never read a token by name.
  let chain: NamedTokenLookup | undefined;
  return (name, kind) => {
    chain ??= buildLookup(p, component, containerId);
    return chain(name, kind);
  };
}

function buildLookup(
  p: Project,
  component: ComponentFile,
  containerId: string | null,
): NamedTokenLookup {
  const mode = effectiveDrawingMode(p, containerId);
  const own = component.tokenTables;
  const lookups: NamedTokenLookup[] = [];
  if (own !== undefined) lookups.push(declaredNamedLookup(own.get(mode), own));
  for (const s of p.specializations) {
    const tables = tokenTablesOf(s.spec?.tokens);
    if (tables !== undefined) lookups.push(declaredNamedLookup(tables.get(mode), tables));
  }
  lookups.push(builtinNamedLookup());
  return chainNamedLookups(lookups);
}
