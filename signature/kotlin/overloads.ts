import { CliError } from '../errors';
import { parameterNames } from './params';
import type { FunctionDecl } from './functions';
import type { TokenStream } from '../tokens';

// Overload choice: the `@Deprecated` ones drop out; if one remains, that is it; otherwise
// `--overload <n>` decides (n is the index in the full list, deprecated ones included, in source order).

/** One candidate per line: `  <index>: line <n> [@Deprecated] (<parameter names>)`. */
export function listCandidates(
  stream: TokenStream,
  candidates: readonly FunctionDecl[],
): string {
  return candidates
    .map((fn, index) => {
      const mark = fn.deprecated ? ' [@Deprecated]' : '';
      return `  ${index}: line ${fn.line}${mark} (${parameterNames(stream, fn.open, fn.close).join(', ')})`;
    })
    .join('\n');
}

export function chooseOverload(
  stream: TokenStream,
  candidates: readonly FunctionDecl[],
  name: string,
  overload: number | undefined,
): FunctionDecl {
  const where = stream.src.name;
  if (overload !== undefined) {
    const chosen = candidates[overload];
    if (chosen !== undefined) return chosen;
    throw new CliError(
      `--overload ${overload} is not in the list: ${name} has ${candidates.length} @Composable overloads in ${where} (indexes 0 to ${candidates.length - 1}):\n${listCandidates(stream, candidates)}`,
    );
  }
  const alive = candidates.filter((fn) => !fn.deprecated);
  if (alive.length === 1) return alive[0]!;
  const reason =
    alive.length === 0
      ? `${name} only has @Deprecated overloads in ${where}`
      : `${name} has ${alive.length} @Composable overloads (besides the @Deprecated ones) in ${where}`;
  throw new CliError(
    `ambiguous overload: ${reason}; pick one with --overload <n>:\n${listCandidates(stream, candidates)}`,
  );
}
