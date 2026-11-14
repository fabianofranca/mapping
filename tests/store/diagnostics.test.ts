import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diagnosticsUnseen,
  markDiagnosticsSeen,
  remoteImageIssues,
  reportRemoteImageIssue,
} from '../../src/store/diagnostics';
import { clearReportedErrors, reportError } from '../../src/utils/report';

beforeEach(() => {
  clearReportedErrors();
  markDiagnosticsSeen();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('diagnostics: seen errors (B4)', () => {
  it('without errors there is no alert', () => {
    expect(diagnosticsUnseen.value).toBe(false);
  });

  it('a new error lights the alert and marking it as seen clears it', () => {
    reportError('save', new Error('failed'));
    expect(diagnosticsUnseen.value).toBe(true);
    markDiagnosticsSeen();
    expect(diagnosticsUnseen.value).toBe(false);
  });

  it('another error after being seen lights it again', () => {
    reportError('save', new Error('one'));
    markDiagnosticsSeen();
    reportError('folder.write', new Error('two'));
    expect(diagnosticsUnseen.value).toBe(true);
  });

  it('clearing the log clears the alert', () => {
    reportError('save', new Error('failed'));
    clearReportedErrors();
    expect(diagnosticsUnseen.value).toBe(false);
  });
});

describe('diagnostics: invalid remote image URL (32)', () => {
  const shown = (url: string) => {
    reportRemoteImageIssue(url, 'invalid');
    return remoteImageIssues.value.at(-1)?.url;
  };

  it('data: shows with the scheme and the type, without the content', () => {
    expect(shown('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toBe(
      'data:image/png…',
    );
  });

  it('file: shows whole', () => {
    expect(shown('file:///x.png')).toBe('file:///x.png');
  });

  it('no line starts with null', () => {
    reportRemoteImageIssue('data:image/svg+xml,<svg/>', 'invalid');
    reportRemoteImageIssue('file:///y.png', 'invalid');
    expect(remoteImageIssues.value.some((item) => item.url.startsWith('null'))).toBe(
      false,
    );
  });
});
