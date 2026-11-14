// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ERROR_LOG_LIMIT,
  clearReportedErrors,
  formatDiagnosticsReport,
  formatReportedErrors,
  listenForUncaughtErrors,
  reportError,
  reportedErrors,
  type DiagnosticsInfo,
} from '../../src/utils/report';

beforeEach(() => {
  clearReportedErrors();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('reportError', () => {
  it('records context, message and time, and writes to the console', () => {
    const error = new Error('disk full');
    reportError('save', error, () => '2026-10-02T12:00:00.000Z');
    expect(reportedErrors.value).toEqual([
      { context: 'save', message: 'disk full', at: '2026-10-02T12:00:00.000Z' },
    ]);
    expect(console.error).toHaveBeenCalledWith('[save]', error);
  });

  it('describes non-Error errors and includes the name of the specific ones', () => {
    reportError('a', 'loose text');
    reportError('b', new DOMException('denied', 'NotAllowedError'));
    reportError('c', { code: 1 });
    expect(reportedErrors.value.map((e) => e.message)).toEqual([
      'loose text',
      'NotAllowedError: denied',
      '[object Object]',
    ]);
  });

  it('keeps only the latest errors', () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 5; i++) reportError('x', new Error(`e${i}`));
    const messages = reportedErrors.value.map((e) => e.message);
    expect(messages).toHaveLength(ERROR_LOG_LIMIT);
    expect(messages[0]).toBe('e5');
    expect(messages.at(-1)).toBe(`e${ERROR_LOG_LIMIT + 4}`);
  });

  it('formats one error per line, the most recent first', () => {
    reportError('save', new Error('one'), () => 'T1');
    reportError('folder.write', new Error('two'), () => 'T2');
    expect(formatReportedErrors(reportedErrors.value)).toBe(
      'T2 [folder.write] two\nT1 [save] one',
    );
  });
});

describe('errors repeated in sequence', () => {
  it('become one line with a counter, so a loop does not fill the log', () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 10; i++) {
      reportError('window', new Error('loop'), () => `T${i}`);
    }
    reportError('save', new Error('other'), () => 'T99');
    expect(reportedErrors.value).toEqual([
      { context: 'window', message: 'loop', at: `T${ERROR_LOG_LIMIT + 9}`, count: 30 },
      { context: 'save', message: 'other', at: 'T99' },
    ]);
    expect(formatReportedErrors(reportedErrors.value)).toBe(
      `T99 [save] other\nT${ERROR_LOG_LIMIT + 9} [window] loop (×30)`,
    );
  });

  it('only groups the same context and the same message, in sequence', () => {
    reportError('a', new Error('one'));
    reportError('b', new Error('one'));
    reportError('a', new Error('one'));
    expect(reportedErrors.value.map((e) => e.count)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('errors that escape the handlers', () => {
  function rejection(reason: unknown): Event {
    return Object.assign(new Event('unhandledrejection'), { reason });
  }
  function uncaught(error: unknown, message: string): Event {
    return Object.assign(new Event('error'), { error, message });
  }

  it('an unhandled rejected promise and an uncaught error go to Diagnostics', () => {
    const target = new EventTarget();
    const stop = listenForUncaughtErrors(target);
    target.dispatchEvent(rejection(new Error('loose promise')));
    target.dispatchEvent(uncaught(new TypeError('x is undefined'), 'Uncaught TypeError'));
    target.dispatchEvent(uncaught(null, 'Script error.'));
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['window', 'loose promise'],
      ['window', 'TypeError: x is undefined'],
      ['window', 'Script error.'],
    ]);

    stop();
    target.dispatchEvent(rejection(new Error('later')));
    expect(reportedErrors.value).toHaveLength(3);
  });

  it('the benign "ResizeObserver loop" browser warning does not go to Diagnostics', () => {
    const target = new EventTarget();
    listenForUncaughtErrors(target);
    target.dispatchEvent(
      uncaught(null, 'ResizeObserver loop completed with undelivered notifications.'),
    );
    target.dispatchEvent(uncaught(null, 'ResizeObserver loop limit exceeded'));
    expect(reportedErrors.value).toEqual([]);
    target.dispatchEvent(uncaught(null, 'Script error.'));
    expect(reportedErrors.value.map((e) => e.message)).toEqual(['Script error.']);
  });
});

describe('text copied from Diagnostics', () => {
  const info: DiagnosticsInfo = {
    build: 'abc1234 · 2026-10-10',
    channel: 'preview',
    schema: 8,
    storage: 'folder',
    userAgent: 'Mozilla/5.0 Test',
    window: { width: 1280, height: 800 },
    language: 'pt-BR',
    theme: 'dark',
    counts: { containers: 2, markings: 4, annotations: 3 },
    pendingSave: true,
  };

  it('has the header with the environment before the errors', () => {
    reportError('save', new Error('disk full'), () => 'T1');
    expect(formatDiagnosticsReport(info, reportedErrors.value)).toBe(
      [
        'build: abc1234 · 2026-10-10',
        'channel: preview',
        'schema: 8',
        'storage: folder',
        'userAgent: Mozilla/5.0 Test',
        'window: 1280x800',
        'language: pt-BR',
        'theme: dark',
        'containers: 2, markings: 4, annotations: 3',
        'pendingSave: yes',
        'errors: 1',
        '',
        'T1 [save] disk full',
      ].join('\n'),
    );
  });

  it('with no open project and no errors, only the header', () => {
    const text = formatDiagnosticsReport(
      { ...info, storage: null, counts: null, pendingSave: null },
      [],
    );
    expect(text).toContain('storage: -');
    expect(text).toContain('containers: -');
    expect(text).toContain('pendingSave: -');
    expect(text.endsWith('errors: 0')).toBe(true);
  });
});

describe('folder: line of the copied text', () => {
  const base: DiagnosticsInfo = {
    build: 'abc1234 · 2026-10-10',
    channel: 'preview',
    schema: 8,
    storage: 'folder',
    userAgent: 'Mozilla/5.0 Test',
    window: { width: 1280, height: 800 },
    language: 'pt-BR',
    theme: 'dark',
    counts: { containers: 2, markings: 4, annotations: 3 },
    pendingSave: false,
  };

  const lines = (info: DiagnosticsInfo) => formatDiagnosticsReport(info, []).split('\n');

  it('brings the measured operations, in the received order, right after storage:', () => {
    const text = lines({
      ...base,
      folder: [
        { op: 'open', calls: 412, ms: 8300 },
        { op: 'save', calls: 23, ms: 900 },
      ],
    });
    const at = text.indexOf('storage: folder');
    expect(text[at + 1]).toBe('folder: open 412 calls 8300 ms; save 23 calls 900 ms');
  });

  it('rounds the milliseconds', () => {
    const text = lines({
      ...base,
      folder: [{ op: 'sync', calls: 9, ms: 1234.56 }],
    });
    expect(text).toContain('folder: sync 9 calls 1235 ms');
  });

  it('in a folder, with no measurement yet: folder: no measurements', () => {
    expect(lines({ ...base, folder: [] })).toContain('folder: no measurements');
  });

  it('outside a folder there is no folder: line', () => {
    expect(lines(base).some((l) => l.startsWith('folder:'))).toBe(false);
    expect(lines({ ...base, folder: null }).some((l) => l.startsWith('folder:'))).toBe(
      false,
    );
  });
});
