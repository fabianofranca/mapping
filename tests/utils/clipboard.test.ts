import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboardPng, writeClipboardText } from '../../src/utils/clipboard';

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

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('writeClipboardText', () => {
  it('sem formato personalizado grava só o texto', async () => {
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(write).not.toHaveBeenCalled();
  });

  it('com o formato personalizado suportado grava texto e dados juntos', async () => {
    stubItem(true);
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá', { mime: MIME, data: '{"a":1}' })).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    const item = (write.mock.calls[0] as unknown[][])[0]?.[0] as {
      data: Record<string, Blob>;
    };
    expect(Object.keys(item.data)).toEqual(['text/plain', `web ${MIME}`]);
    expect(await item.data[`web ${MIME}`]?.text()).toBe('{"a":1}');
  });

  it('navegador sem suporte ao formato (ou sem supports) cai para só o texto', async () => {
    stubItem(false);
    const { writeText, write } = mock();
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('olá');

    vi.stubGlobal('ClipboardItem', class {});
    expect(await writeClipboardText('de novo', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith('de novo');
  });

  it('se a gravação com os dois falhar, tenta só o texto', async () => {
    stubItem(true);
    const { writeText } = mock({ write: () => Promise.reject(new Error('recusado')) });
    expect(await writeClipboardText('olá', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('olá');
  });

  it('sem permissão nenhuma, devolve false', async () => {
    mock({ writeText: () => Promise.reject(new Error('negado')) });
    expect(await writeClipboardText('olá')).toBe(false);
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
  });

  it('devolve false sem ClipboardItem', async () => {
    mock();
    expect(await writeClipboardPng(Promise.resolve(new Blob()))).toBe(false);
  });
});
