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

describe('diagnóstico: erros vistos (B4)', () => {
  it('sem erros não há alerta', () => {
    expect(diagnosticsUnseen.value).toBe(false);
  });

  it('um erro novo acende o alerta e marcar como visto apaga', () => {
    reportError('save', new Error('falhou'));
    expect(diagnosticsUnseen.value).toBe(true);
    markDiagnosticsSeen();
    expect(diagnosticsUnseen.value).toBe(false);
  });

  it('outro erro depois de visto acende de novo', () => {
    reportError('save', new Error('um'));
    markDiagnosticsSeen();
    reportError('folder.write', new Error('dois'));
    expect(diagnosticsUnseen.value).toBe(true);
  });

  it('limpar o registro apaga o alerta', () => {
    reportError('save', new Error('falhou'));
    clearReportedErrors();
    expect(diagnosticsUnseen.value).toBe(false);
  });
});

describe('diagnóstico: URL de imagem remota inválida (32)', () => {
  const shown = (url: string) => {
    reportRemoteImageIssue(url, 'invalid');
    return remoteImageIssues.value.at(-1)?.url;
  };

  it('data: aparece com o esquema e o tipo, sem o conteúdo', () => {
    expect(shown('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toBe(
      'data:image/png…',
    );
  });

  it('file: aparece inteiro', () => {
    expect(shown('file:///x.png')).toBe('file:///x.png');
  });

  it('nenhuma linha começa com null', () => {
    reportRemoteImageIssue('data:image/svg+xml,<svg/>', 'invalid');
    reportRemoteImageIssue('file:///y.png', 'invalid');
    expect(remoteImageIssues.value.some((item) => item.url.startsWith('null'))).toBe(
      false,
    );
  });
});
