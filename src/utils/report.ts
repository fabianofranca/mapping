import { signal, type ReadonlySignal } from '@preact/signals';

/** How many errors are kept in memory (the most recent ones). */
export const ERROR_LOG_LIMIT = 20;

export interface ReportedError {
  /** Where the error happened (e.g. `save`, `folder.write`). */
  readonly context: string;
  readonly message: string;
  /** ISO date of the record (that of the last repetition, when grouped). */
  readonly at: string;
  /** How many times in a row the same error happened; absent when it was just one. */
  readonly count?: number;
}

const log = signal<readonly ReportedError[]>([]);

/** Errors recorded in this session, from oldest to most recent. */
export const reportedErrors: ReadonlySignal<readonly ReportedError[]> = log;

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
  }
  return typeof error === 'string' ? error : String(error);
}

/**
 * Records a failure that the app handles on its own (and so does not reach the user):
 * it goes to the console and to the "Diagnostics" list, which they can copy and
 * paste into a conversation. Never throws.
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
  // The same error in sequence (e.g. a loop) becomes one line with a counter.
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
 * Brings to Diagnostics what escapes the handlers: an uncaught error and a promise
 * rejected without `catch` (`main.tsx`). Returns the function that removes the listeners.
 */
export function listenForUncaughtErrors(target: EventTarget): () => void {
  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    // Browser warning (without `error`) that the size observer deferred a notification to the
    // next frame: the drawing happens, nothing failed, and recording it lit up the Diagnostics alert.
    if (!error && /^ResizeObserver loop/.test(message)) return;
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

/** Text to paste into a conversation: one error per line, the most recent first. */
export function formatReportedErrors(errors: readonly ReportedError[]): string {
  return [...errors]
    .reverse()
    .map((e) => `${e.at} [${e.context}] ${e.message}${e.count ? ` (×${e.count})` : ''}`)
    .join('\n');
}

/** A folder operation already measured (see `storage/folderCalls`). */
export interface FolderMeasureLine {
  readonly op: string;
  readonly calls: number;
  readonly ms: number;
}

/** `folder: open 412 calls 8300 ms; save 23 calls 900 ms`, ou `folder: no measurements`. */
function formatFolderLine(measures: readonly FolderMeasureLine[]): string {
  if (measures.length === 0) return 'folder: no measurements';
  const parts = measures.map((m) => `${m.op} ${m.calls} calls ${Math.round(m.ms)} ms`);
  return `folder: ${parts.join('; ')}`;
}

/**
 * Environment of whoever reports a problem, without names or paths (privacy). The
 * project fields are `null` outside the editor.
 */
export interface DiagnosticsInfo {
  readonly build: string;
  readonly channel: string;
  readonly schema: number;
  /** Remote image origins allowed in this browser. */
  readonly remoteImageOrigins?: number;
  readonly storage: string | null;
  /**
   * The latest measurements of each folder operation (`folder:`); `null` (or absent) outside a
   * folder project, where the line does not exist.
   */
  readonly folder?: readonly FolderMeasureLine[] | null;
  readonly userAgent: string;
  readonly window: { readonly width: number; readonly height: number };
  readonly language: string;
  readonly theme: string;
  readonly counts: {
    readonly containers: number;
    readonly markings: number;
    readonly annotations: number;
  } | null;
  readonly pendingSave: boolean | null;
}

/** Build, channel and schema, one per line (also the About "Copy"). */
export function formatBuildInfo(
  info: Pick<DiagnosticsInfo, 'build' | 'channel' | 'schema' | 'remoteImageOrigins'>,
): string {
  const lines = [
    `build: ${info.build}`,
    `channel: ${info.channel}`,
    `schema: ${info.schema}`,
  ];
  if (info.remoteImageOrigins !== undefined) {
    lines.push(`remoteImages: ${info.remoteImageOrigins} allowed origins`);
  }
  return lines.join('\n');
}

/**
 * Text of the Diagnostics "Copy": the header with the environment and then the errors. The
 * keys stay in English and fixed, like a log, for whoever reads the report in any language.
 */
export function formatDiagnosticsReport(
  info: DiagnosticsInfo,
  errors: readonly ReportedError[],
): string {
  const none = '-';
  const counts = info.counts
    ? `containers: ${info.counts.containers}, markings: ${info.counts.markings}, annotations: ${info.counts.annotations}`
    : `containers: ${none}, markings: ${none}, annotations: ${none}`;
  const pending = info.pendingSave === null ? none : info.pendingSave ? 'yes' : 'no';
  const header = [
    formatBuildInfo(info),
    `storage: ${info.storage ?? none}`,
    ...(info.folder ? [formatFolderLine(info.folder)] : []),
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
