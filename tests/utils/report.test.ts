// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ERROR_LOG_LIMIT,
  clearReportedErrors,
  formatReportedErrors,
  reportError,
  reportedErrors,
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
