import { CliError } from '../errors';
import { parameterNames } from './params';
import type { FunctionDecl } from './functions';
import type { TokenStream } from '../tokens';

// Escolha da sobrecarga: as `@Deprecated` saem; sobrando uma, é ela; senão `--overload <n>` decide
// (n é o índice na lista completa, deprecadas inclusive, em ordem de fonte).

/** Uma candidata por linha: `  <índice>: linha <n> [@Deprecated] (<nomes dos parâmetros>)`. */
export function listCandidates(
  stream: TokenStream,
  candidates: readonly FunctionDecl[],
): string {
  return candidates
    .map((fn, index) => {
      const mark = fn.deprecated ? ' [@Deprecated]' : '';
      return `  ${index}: linha ${fn.line}${mark} (${parameterNames(stream, fn.open, fn.close).join(', ')})`;
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
      `--overload ${overload} fora da lista: ${name} tem ${candidates.length} sobrecargas @Composable em ${where} (índices de 0 a ${candidates.length - 1}):\n${listCandidates(stream, candidates)}`,
    );
  }
  const alive = candidates.filter((fn) => !fn.deprecated);
  if (alive.length === 1) return alive[0]!;
  const reason =
    alive.length === 0
      ? `${name} só tem sobrecargas @Deprecated em ${where}`
      : `${name} tem ${alive.length} sobrecargas @Composable (fora as @Deprecated) em ${where}`;
  throw new CliError(
    `sobrecarga ambígua: ${reason}; escolha uma com --overload <n>:\n${listCandidates(stream, candidates)}`,
  );
}
