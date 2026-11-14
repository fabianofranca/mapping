import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeClipboardPng, writeClipboardText } from '../../src/utils/clipboard';
import { clearReportedErrors, reportedErrors } from '../../src/utils/report';

const MIME = 'application/x-test+json';

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

/** Simula `navigator.permissions.query` for `clipboard-read`; `throw` makes the query throw. */
function permissions(state: 'granted' | 'prompt' | 'denied' | 'throw') {
  const query = vi.fn(() =>
    state === 'throw'
      ? Promise.reject(new Error('unsupported'))
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
  it('without a custom format writes only the text', async () => {
    const { writeText, write } = mock();
    expect(await writeClipboardText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(write).not.toHaveBeenCalled();
  });

  it('supported format but no navigator.permissions: text only', async () => {
    stubItem(true);
    const { writeText, write } = mock();
    expect(await writeClipboardText('hello', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(write).not.toHaveBeenCalled();
  });

  it('with clipboard-read granted writes the text and then text and data together', async () => {
    stubItem(true);
    permissions('granted');
    const { writeText, write } = mock();
    expect(await writeClipboardText('hello', { mime: MIME, data: '{"a":1}' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    const item = (write.mock.calls[0] as unknown[][])[0]?.[0] as {
      data: Record<string, Blob>;
    };
    expect(Object.keys(item.data)).toEqual(['text/plain', `web ${MIME}`]);
    expect(await item.data['text/plain']?.text()).toBe('hello');
    expect(await item.data[`web ${MIME}`]?.text()).toBe('{"a":1}');
    expect(writeText.mock.invocationCallOrder[0]).toBeLessThan(
      write.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('permission prompt, denied or a query that throws: text only', async () => {
    stubItem(true);
    const { writeText, write } = mock();
    for (const state of ['prompt', 'denied'] as const) {
      permissions(state);
      expect(await writeClipboardText('hello', { mime: MIME, data: 'x' })).toBe(true);
    }
    permissions('throw');
    expect(await writeClipboardText('hello', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(3);
    expect(write).not.toHaveBeenCalled();
  });

  it('browser without support for the format (or without supports): text only', async () => {
    permissions('granted');
    stubItem(false);
    const { writeText, write } = mock();
    expect(await writeClipboardText('hello', { mime: MIME, data: 'x' })).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('hello');

    vi.stubGlobal('ClipboardItem', class {});
    expect(await writeClipboardText('again', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenLastCalledWith('again');
    expect(write).not.toHaveBeenCalled();
  });

  it('if writing the custom format fails, it still returns true', async () => {
    stubItem(true);
    permissions('granted');
    const { writeText, write } = mock({
      write: () => Promise.reject(new Error('rejected')),
    });
    expect(await writeClipboardText('hello', { mime: MIME, data: 'x' })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(write).toHaveBeenCalledTimes(1);
    expect(reportedErrors.value).toHaveLength(0);
  });

  it('if the text cannot be written, logs the error and returns false', async () => {
    const { write } = mock({ writeText: () => Promise.reject(new Error('denied')) });
    expect(await writeClipboardText('hello')).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(reportedErrors.value).toHaveLength(1);
    expect(reportedErrors.value[0]).toMatchObject({
      context: 'clipboard.write',
      message: 'denied',
    });
  });

  it('without the clipboard API, returns false', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    expect(await writeClipboardText('hello')).toBe(false);
  });
});

describe('writeClipboardPng', () => {
  it('writes the PNG (the blob promise goes straight to the ClipboardItem)', async () => {
    stubItem(true);
    const { write } = mock();
    const png = Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    expect(await writeClipboardPng(png)).toBe(true);
    const item = (write.mock.calls[0] as unknown[][])[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(item.data['image/png']).toBe(png);
  });

  it('returns false if writing fails', async () => {
    stubItem(true);
    mock({ write: () => Promise.reject(new Error('denied')) });
    expect(await writeClipboardPng(Promise.resolve(new Blob()))).toBe(false);
    expect(reportedErrors.value[0]?.context).toBe('clipboard.write');
  });

  it('returns false without ClipboardItem', async () => {
    mock();
    expect(await writeClipboardPng(Promise.resolve(new Blob()))).toBe(false);
  });
});
