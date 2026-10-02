import { signal, type ReadonlySignal } from '@preact/signals';

/** Quantos erros ficam guardados em memória (os mais recentes). */
export const ERROR_LOG_LIMIT = 20;

export interface ReportedError {
  /** Onde o erro aconteceu (ex.: `save`, `folder.write`). */
  readonly context: string;
  readonly message: string;
  /** Data ISO do registro. */
  readonly at: string;
}

const log = signal<readonly ReportedError[]>([]);

/** Erros registrados nesta sessão, do mais antigo para o mais recente. */
export const reportedErrors: ReadonlySignal<readonly ReportedError[]> = log;

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
  }
  return typeof error === 'string' ? error : String(error);
}

/**
 * Registra uma falha que a app trata sozinha (e por isso não chega ao usuário):
 * vai para o console e para a lista de "Diagnóstico", que ele pode copiar e
 * colar numa conversa. Nunca lança.
 */
export function reportError(
  context: string,
  error: unknown,
  now: () => string = () => new Date().toISOString(),
): void {
  console.error(`[${context}]`, error);
  const entry: ReportedError = { context, message: describe(error), at: now() };
  log.value = [...log.value, entry].slice(-ERROR_LOG_LIMIT);
}

/** Texto para colar numa conversa: um erro por linha, o mais recente primeiro. */
export function formatReportedErrors(errors: readonly ReportedError[]): string {
  return [...errors]
    .reverse()
    .map((e) => `${e.at} [${e.context}] ${e.message}`)
    .join('\n');
}

export function clearReportedErrors(): void {
  log.value = [];
}
