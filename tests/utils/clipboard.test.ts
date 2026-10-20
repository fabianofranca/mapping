import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeClipboardPng, writeClipboardText } from '../../src/utils/clipboard';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';

const MIME = 'application/x-teste+json';

function mock(
  options: { write?: () => Promise<void>; writeText?: () => Promise<void> } = {},
) {
  const writeText = vi.fn(options.writeText ?? (() => Promise.resolve()));
  const write = vi.fn(options.write ?? (() => Promise.resolve()));
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, write },
    configurable: true,
  });
  return { writeText, write };
}

function stubItem(supported: boolean) {
  class FakeItem {
    static supports = (type: string) => supported && type === `web ${MIME}`;
    constructor(readonly data: Record<string, unknown>) {}
  }
  vi.stubGlobal('ClipboardItem', FakeItem);
}

/** Simula `navigator.permissions.query` para `clipboard-read`; `throw` faz a consulta lançar. */
function permissions(state: 'granted' | 'prompt' | 'denied' | 'throw') {
  const query = vi.fn(() =>
    state === 'throw'
      ? Promise.reject(new Error('sem suporte'))
      : Promise.resolve({ state }),
  );
  Object.defineProperty(navigator, 'permissions', {
    value: { query },
    configurable: true,
  });
  return query;
}

beforeEach(() => {
  clearReportedErrors();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'permissions');
});

describe('writeClipboardText', () => {
  it('sem formato personalizado grava só o texto', async () => {
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(write).not.toHaveBeenCalled();
  });

  it('formato suportado mas sem navigator.permissions: só o texto', async () => {
    stubItem(true);
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(write).not.toHaveBeenCalled();
  });

  it('com clipboard-read concedida grava o texto e depois texto e dados juntos', async () => {
    stubItem(true);
    permissions('granted');
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá', { mime: MIME, data: '{"a":1}' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
    const item = (write.mock.calls[0] as unknown[][])[0]?.[0] as {
      data: Record<string, Blob>;
    };
    expect(Object.keys(item.data)).toEqual(['text/plain', `web ${MIME}`]);
    expect(await item.data['text/plain']?.text()).toBe('olá');
    expect(await item.data[`web ${MIME}`]?.text()).toBe('{"a":1}');
    expect(writeText.mock.invocationCallOrder[0]).toBeLessThan(
      write.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('permissão prompt, denied ou query que lança: só o texto', async () => {
    stubItem(true);
    const { writeText, write } = mock();
    for (const state of ['prompt', 'denied'] as const) {
      permissions(state);
      expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    }
    permissions('throw');
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(write).not.toHaveBeenCalled();
  });

  it('navegador sem suporte ao formato (ou sem supports): só o texto', async () => {
    permissions('granted');
    stubItem(false);
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('olá');

    vi.stubGlobal('ClipboardItem', class {});
    expect(await writeClipboardText('de novo', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith('de novo');
    expect(write).not.toHaveBeenCalled();
  });

  it('se a gravação do formato personalizado falhar, ainda devolve true', async () => {
    stubItem(true);
    permissions('granted');
    const { writeText, write } = mock({
      write: () => Promise.reject(new Error('recusado')),
    });
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(write).toHaveBeenCalledTimes(1);
    expect(reportedErrors.value).toHaveLength(0);
  });

  it('se o texto não puder ser gravado, registra o erro e devolve false', async () => {
    const { write } = mock({ writeText: () => Promise.reject(new Error('negado')) });
    expect(await writeClipboardText('olá')).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(reportedErrors.value).toHaveLength(1);
    expect(reportedErrors.value[0]).toMatchObject({
      context: 'clipboard.write',
      message: 'negado',
    });
  });

  it('sem a API da área de transferência, devolve false', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    expect(await writeClipboardText('olá')).toBe(false);
  });
});

describe('writeClipboardPng', () => {
  it('grava o PNG (a promessa do blob vai direto ao ClipboardItem)', async () => {
    stubItem(true);
    const { write } = mock();
    const png = Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    expect(await writeClipboardPng(png)).toBe(true);
    const item = (write.mock.calls[0] as unknown[][])[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(item.data['image/png']).toBe(png);
  });

  it('devolve false se a gravação falhar', async () => {
    stubItem(true);
    mock({ write: () => Promise.reject(new Error('negado')) });
    expect(await writeClipboardPng(Promise.resolve(new Blob()))).toBe(false);
    expect(reportedErrors.value[0]?.context).toBe('clipboard.write');
  });

  it('devolve false sem ClipboardItem', async () => {
    mock();
    expect(await writeClipboardPng(Promise.resolve(new Blob()))).toBe(false);
  });
});
