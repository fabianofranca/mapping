import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFileWithPicker } from '../../src/storage/share';

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
