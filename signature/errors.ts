// Errors that the CLI translates into an exit code: 1 is an extraction failure (syntax, missing symbol,
// ambiguous overload, unreadable file, invalid signature record) and 2 is a usage error (missing argument).

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

/** Usage error (exit 2). */
export function usageError(message: string): CliError {
  return new CliError(message, 2);
}
