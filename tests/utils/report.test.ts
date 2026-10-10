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
  it('registra contexto, mensagem e horário, e escreve no console', () => {
    const error = new Error('disco cheio');
    reportError('save', error, () => '2026-10-02T12:00:00.000Z');
    expect(reportedErrors.value).toEqual([
      { context: 'save', message: 'disco cheio', at: '2026-10-02T12:00:00.000Z' },
    ]);
    expect(console.error).toHaveBeenCalledWith('[save]', error);
  });

  it('descreve erros que não são Error e inclui o nome dos específicos', () => {
    reportError('a', 'texto solto');
    reportError('b', new DOMException('negado', 'NotAllowedError'));
    reportError('c', { code: 1 });
    expect(reportedErrors.value.map((e) => e.message)).toEqual([
      'texto solto',
      'NotAllowedError: negado',
      '[object Object]',
    ]);
  });

  it('guarda só os últimos erros', () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 5; i++) reportError('x', new Error(`e${i}`));
    const messages = reportedErrors.value.map((e) => e.message);
    expect(messages).toHaveLength(ERROR_LOG_LIMIT);
    expect(messages[0]).toBe('e5');
    expect(messages.at(-1)).toBe(`e${ERROR_LOG_LIMIT + 4}`);
  });

  it('formata um erro por linha, o mais recente primeiro', () => {
    reportError('save', new Error('um'), () => 'T1');
    reportError('folder.write', new Error('dois'), () => 'T2');
    expect(formatReportedErrors(reportedErrors.value)).toBe(
      'T2 [folder.write] dois\nT1 [save] um',
    );
  });
});

describe('erros repetidos em sequência', () => {
  it('viram uma linha com contador, para um laço não lotar o registro', () => {
    for (let i = 0; i < ERROR_LOG_LIMIT + 10; i++) {
      reportError('window', new Error('laço'), () => `T${i}`);
    }
    reportError('save', new Error('outro'), () => 'T99');
    expect(reportedErrors.value).toEqual([
      { context: 'window', message: 'laço', at: `T${ERROR_LOG_LIMIT + 9}`, count: 30 },
      { context: 'save', message: 'outro', at: 'T99' },
    ]);
    expect(formatReportedErrors(reportedErrors.value)).toBe(
      `T99 [save] outro\nT${ERROR_LOG_LIMIT + 9} [window] laço (×30)`,
    );
  });

  it('só agrupa o mesmo contexto e a mesma mensagem, em sequência', () => {
    reportError('a', new Error('um'));
    reportError('b', new Error('um'));
    reportError('a', new Error('um'));
    expect(reportedErrors.value.map((e) => e.count)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('erros que escapam dos handlers', () => {
  function rejection(reason: unknown): Event {
    return Object.assign(new Event('unhandledrejection'), { reason });
  }
  function uncaught(error: unknown, message: string): Event {
    return Object.assign(new Event('error'), { error, message });
  }

  it('promessa rejeitada solta e erro não capturado vão para o Diagnóstico', () => {
    const target = new EventTarget();
    const stop = listenForUncaughtErrors(target);
    target.dispatchEvent(rejection(new Error('promessa solta')));
    target.dispatchEvent(uncaught(new TypeError('x is undefined'), 'Uncaught TypeError'));
    target.dispatchEvent(uncaught(null, 'Script error.'));
    expect(reportedErrors.value.map((e) => [e.context, e.message])).toEqual([
      ['window', 'promessa solta'],
      ['window', 'TypeError: x is undefined'],
      ['window', 'Script error.'],
    ]);

    stop();
    target.dispatchEvent(rejection(new Error('depois')));
    expect(reportedErrors.value).toHaveLength(3);
  });
});

describe('texto copiado do Diagnóstico', () => {
  const info: DiagnosticsInfo = {
    build: 'abc1234 · 2026-10-10',
    channel: 'preview',
    schema: 8,
    storage: 'folder',
    userAgent: 'Mozilla/5.0 Teste',
    window: { width: 1280, height: 800 },
    language: 'pt-BR',
    theme: 'dark',
    counts: { images: 2, markings: 4, annotations: 3 },
    pendingSave: true,
  };

  it('tem o cabeçalho com o ambiente antes dos erros', () => {
    reportError('save', new Error('disco cheio'), () => 'T1');
    expect(formatDiagnosticsReport(info, reportedErrors.value)).toBe(
      [
        'build: abc1234 · 2026-10-10',
        'channel: preview',
        'schema: 8',
        'storage: folder',
        'userAgent: Mozilla/5.0 Teste',
        'window: 1280x800',
        'language: pt-BR',
        'theme: dark',
        'images: 2, markings: 4, annotations: 3',
        'pendingSave: yes',
        'errors: 1',
        '',
        'T1 [save] disco cheio',
      ].join('\n'),
    );
  });

  it('sem projeto aberto e sem erros, só o cabeçalho', () => {
    const text = formatDiagnosticsReport(
      { ...info, storage: null, counts: null, pendingSave: null },
      [],
    );
    expect(text).toContain('storage: -');
    expect(text).toContain('images: -');
    expect(text).toContain('pendingSave: -');
    expect(text.endsWith('errors: 0')).toBe(true);
  });
});
