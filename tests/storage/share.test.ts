import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlobWithPicker, saveFileWithPicker } from '../../src/storage/share';

// The "Save as" picker offers the file type of what is being saved: the project's zip, or the
// text a specialization's format plugin generated (stage #2035, AF3).

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'showSaveFilePicker');
});

function pickerSpy() {
  const picker = vi.fn(async (...args: unknown[]) => ({
    args,
    createWritable: async () => ({
      write: async () => undefined,
      close: async () => undefined,
      abort: async () => undefined,
    }),
  }));
  Reflect.set(globalThis, 'showSaveFilePicker', picker);
  return picker;
}

describe('saveFileWithPicker', () => {
  it('a zip is offered with the zip type', async () => {
    const picker = pickerSpy();
    await saveFileWithPicker(new File(['x'], 'Project.zip', { type: 'application/zip' }));
    expect(picker.mock.calls[0]?.[0]).toMatchObject({
      suggestedName: 'Project.zip',
      types: [{ accept: { 'application/zip': ['.zip'] } }],
    });
  });

  it('a generated text file is offered with its own extension, not as a zip', async () => {
    const picker = pickerSpy();
    const result = await saveFileWithPicker(
      new File(['x'], 'Notes.yaml', { type: 'text/plain;charset=utf-8' }),
    );
    expect(result).toBe('saved');
    expect(picker.mock.calls[0]?.[0]).toMatchObject({
      suggestedName: 'Notes.yaml',
      types: [{ accept: { 'text/plain': ['.yaml'] } }],
    });
  });
});

describe('saveBlobWithPicker', () => {
  it('opens the picker before awaiting the blob, then writes it', async () => {
    const order: string[] = [];
    const write = vi.fn(async () => {
      order.push('write');
    });
    Reflect.set(
      globalThis,
      'showSaveFilePicker',
      vi.fn(async () => {
        order.push('picker');
        return {
          createWritable: async () => ({
            write,
            close: async () => undefined,
            abort: async () => undefined,
          }),
        };
      }),
    );
    const data = new Promise<Blob>((resolve) => {
      order.push('data-requested');
      setTimeout(() => {
        order.push('data-ready');
        resolve(new Blob(['png']));
      }, 0);
    });
    const result = await saveBlobWithPicker('a.png', 'image/png', data);
    expect(result).toBe('saved');
    expect(order.indexOf('picker')).toBeLessThan(order.indexOf('data-ready'));
    expect(order.indexOf('data-ready')).toBeLessThan(order.indexOf('write'));
  });

  it('offers the type of the blob', async () => {
    const picker = pickerSpy();
    await saveBlobWithPicker('a.png', 'image/png', Promise.resolve(new Blob(['x'])));
    expect(picker.mock.calls[0]?.[0]).toMatchObject({
      suggestedName: 'a.png',
      types: [{ accept: { 'image/png': ['.png'] } }],
    });
  });

  it('a cancelled picker gives cancelled and never asks for the data result', async () => {
    Reflect.set(
      globalThis,
      'showSaveFilePicker',
      vi.fn(async () => {
        throw new DOMException('x', 'AbortError');
      }),
    );
    expect(
      await saveBlobWithPicker('a.png', 'image/png', Promise.resolve(new Blob())),
    ).toBe('cancelled');
  });

  it('a rejected data gives failed and aborts the writable', async () => {
    const abort = vi.fn(async () => undefined);
    Reflect.set(
      globalThis,
      'showSaveFilePicker',
      vi.fn(async () => ({
        createWritable: async () => ({
          write: async () => undefined,
          close: async () => undefined,
          abort,
        }),
      })),
    );
    const data = Promise.reject(new Error('crop failed'));
    expect(await saveBlobWithPicker('a.png', 'image/png', data)).toBe('failed');
    expect(abort).toHaveBeenCalled();
  });

  it('without the picker it gives failed', async () => {
    expect(
      await saveBlobWithPicker('a.png', 'image/png', Promise.resolve(new Blob())),
    ).toBe('failed');
  });
});
