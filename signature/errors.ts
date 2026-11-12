// Erros que a CLI traduz em código de saída: 1 é falha de extração (sintaxe, símbolo ausente,
// sobrecarga ambígua, arquivo ilegível, ficha inválida) e 2 é erro de uso (argumento faltando).

export type ExitCode = 1 | 2;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/** Erro de uso (exit 2). */
export function usageError(message: string): CliError {
  return new CliError(message, 2);
}
