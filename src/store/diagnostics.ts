import { computed, signal, type ReadonlySignal } from '@preact/signals';
import { reportedErrors, type ReportedError } from '../utils/report';

// Diagnostics "Seen until" (B4): the last error the user has already seen. While the
// log has a newer error, the strip shows the alert dot. UI state
// (per browser session): outside the project, the history and `localStorage`.

const seen = signal<ReportedError | null>(null);

/** There is a logged error that has not been seen yet (the Diagnostics window was not open). */
export const diagnosticsUnseen: ReadonlySignal<boolean> = computed(() => {
  const last = reportedErrors.value.at(-1);
  return last !== undefined && last !== seen.value;
});

/** Marks all the errors logged so far as seen. */
export function markDiagnosticsSeen(): void {
  seen.value = reportedErrors.peek().at(-1) ?? null;
}

// Remote image failures and blocks in Diagnostics (RI3). In memory, per session.
export type RemoteImageIssueReason =
  'blocked-consent' | 'invalid' | 'failed' | 'too-large' | 'timeout';

export interface RemoteImageIssue {
  /** Shortened URL (without query or fragment, at most 80 characters). */
  readonly url: string;
  readonly reason: RemoteImageIssueReason;
}

const SHORT_URL_MAX = 80;

/**
 * Origin and path of http(s) URLs; for the others the origin is `'null'`, so it shows the scheme:
 * `data:` with only the type (the content does not appear), `file:` in full, the rest only the scheme.
 */
function readableUrl(parsed: URL): string {
  if (parsed.origin !== 'null') return `${parsed.origin}${parsed.pathname}`;
  if (parsed.protocol === 'data:') {
    return `data:${parsed.pathname.split(/[;,]/, 1)[0] ?? ''}…`;
  }
  return parsed.href.startsWith(`${parsed.protocol}//`)
    ? `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    : `${parsed.protocol}…`;
}

function shortenUrl(url: string): string {
  let text = url;
  try {
    const parsed = new URL(url);
    text = readableUrl(parsed);
  } catch {
    // Unreadable URL: shortens the text as is.
  }
  return text.length > SHORT_URL_MAX ? `${text.slice(0, SHORT_URL_MAX - 1)}…` : text;
}

const issues = signal<readonly RemoteImageIssue[]>([]);
/** Position of each URL in `issues`, to swap the reason in place when it changes. */
const issueIndex = new Map<string, number>();

/** Remote image failures and blocks of this session, in the order they appeared. */
export const remoteImageIssues: ReadonlySignal<readonly RemoteImageIssue[]> = issues;

/**
 * Records a remote image failure or block. Each URL appears once, in the order of its
 * first time; if the reason changes (e.g. "address not accepted" becomes "did not load" after the
 * person turns on a Privacy switch), the row gets the new reason in the same place.
 */
export function reportRemoteImageIssue(
  url: string,
  reason: RemoteImageIssueReason,
): void {
  const at = issueIndex.get(url);
  const current = issues.peek();
  if (at === undefined) {
    issueIndex.set(url, current.length);
    issues.value = [...current, { url: shortenUrl(url), reason }];
    return;
  }
  const known = current[at];
  if (known === undefined || known.reason === reason) return;
  issues.value = current.map((item, i) => (i === at ? { ...item, reason } : item));
}

/**
 * Removes the URL from the list: it came to be drawn in this session (it loaded), so Diagnostics
 * should no longer say it was not shown. The rows below move up and the index follows.
 */
export function resolveRemoteImageIssue(url: string): void {
  const at = issueIndex.get(url);
  if (at === undefined) return;
  issueIndex.delete(url);
  for (const [known, position] of issueIndex) {
    if (position > at) issueIndex.set(known, position - 1);
  }
  issues.value = issues.peek().filter((_, i) => i !== at);
}

/** Only for tests. */
export function clearRemoteImageIssues(): void {
  issueIndex.clear();
  issues.value = [];
}
