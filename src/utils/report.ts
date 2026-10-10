import { signal, type ReadonlySignal } from '@preact/signals';

/** Quantos erros ficam guardados em memória (os mais recentes). */
export const ERROR_LOG_LIMIT = 20;

export interface ReportedError {
  /** Onde o erro aconteceu (ex.: `save`, `folder.write`). */
  readonly context: string;
  readonly message: string;
  /** Data ISO do registro (a da última repetição, quando agrupado). */
  readonly at: string;
  /** Quantas vezes seguidas o mesmo erro aconteceu; ausente quando foi uma só. */
  readonly count?: number;
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
  const message = describe(error);
  const at = now();
  const last = log.value.at(-1);
  // O mesmo erro em sequência (ex.: um laço) vira uma linha com contador.
  if (last?.context === context && last.message === message) {
    log.value = [
      ...log.value.slice(0, -1),
      { ...last, at, count: (last.count ?? 1) + 1 },
    ];
    return;
  }
  const entry: ReportedError = { context, message, at };
  log.value = [...log.value, entry].slice(-ERROR_LOG_LIMIT);
}

/**
 * Leva ao Diagnóstico o que escapa dos handlers: erro não capturado e promessa
 * rejeitada sem `catch` (`main.tsx`). Devolve a função que remove os ouvintes.
 */
export function listenForUncaughtErrors(target: EventTarget): () => void {
  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    reportError('window', error ?? message);
  };
  const onRejection = (event: Event) => {
    reportError('window', (event as PromiseRejectionEvent).reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Texto para colar numa conversa: um erro por linha, o mais recente primeiro. */
export function formatReportedErrors(errors: readonly ReportedError[]): string {
  return [...errors]
    .reverse()
    .map((e) => `${e.at} [${e.context}] ${e.message}${e.count ? ` (×${e.count})` : ''}`)
    .join('\n');
}

/**
 * Ambiente de quem relata um problema, sem nomes nem caminhos (privacidade). Os
 * campos do projeto são `null` fora do editor.
 */
export interface DiagnosticsInfo {
  readonly build: string;
  readonly channel: string;
  readonly schema: number;
  readonly storage: string | null;
  readonly userAgent: string;
  readonly window: { readonly width: number; readonly height: number };
  readonly language: string;
  readonly theme: string;
  readonly counts: {
    readonly images: number;
    readonly markings: number;
    readonly annotations: number;
  } | null;
  readonly pendingSave: boolean | null;
}

/** Build, canal e schema, um por linha (também o "Copiar" do Sobre). */
export function formatBuildInfo(
  info: Pick<DiagnosticsInfo, 'build' | 'channel' | 'schema'>,
): string {
  return [
    `build: ${info.build}`,
    `channel: ${info.channel}`,
    `schema: ${info.schema}`,
  ].join('\n');
}

/**
 * Texto do "Copiar" do Diagnóstico: o cabeçalho com o ambiente e depois os erros. As
 * chaves ficam em inglês e fixas, como um log, para quem lê o relato em qualquer idioma.
 */
export function formatDiagnosticsReport(
  info: DiagnosticsInfo,
  errors: readonly ReportedError[],
): string {
  const none = '-';
  const counts = info.counts
    ? `images: ${info.counts.images}, markings: ${info.counts.markings}, annotations: ${info.counts.annotations}`
    : `images: ${none}, markings: ${none}, annotations: ${none}`;
  const pending = info.pendingSave === null ? none : info.pendingSave ? 'yes' : 'no';
  const header = [
    formatBuildInfo(info),
    `storage: ${info.storage ?? none}`,
    `userAgent: ${info.userAgent}`,
    `window: ${info.window.width}x${info.window.height}`,
    `language: ${info.language}`,
    `theme: ${info.theme}`,
    counts,
    `pendingSave: ${pending}`,
    `errors: ${errors.length}`,
  ].join('\n');
  return errors.length === 0 ? header : `${header}\n\n${formatReportedErrors(errors)}`;
}

export function clearReportedErrors(): void {
  log.value = [];
}
