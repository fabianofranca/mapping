import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { useImageIntake, type ImageIntake } from '../../src/app/useImageIntake';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const text = (name: string) => new File(['x'], name, { type: 'text/plain' });

interface Setup {
  readonly harness: Harness;
  readonly intake: () => ImageIntake;
  readonly progress: (string | null)[];
  readonly messages: (string | null)[];
  readonly canvas: {
    fitAll: ReturnType<typeof vi.fn>;
    imageIdAt: ReturnType<typeof vi.fn>;
    canvasPointAt: ReturnType<typeof vi.fn>;
    viewportCenter: ReturnType<typeof vi.fn>;
    setDropTarget: ReturnType<typeof vi.fn>;
  };
  readonly addImages: ReturnType<typeof vi.spyOn>;
  readonly replaceImage: ReturnType<typeof vi.spyOn>;
}

function setup(options: { readOnly?: boolean; busy?: boolean } = {}): Setup {
  const harness = createHarness(sampleProject(), options.readOnly);
  const progress: (string | null)[] = [];
  const messages: (string | null)[] = [];
  const notices: EditorNotices = {
    progress: null,
    message: null,
    busy: options.busy ?? false,
    setProgress: (p) => void progress.push(p),
    setMessage: (m) => void messages.push(m),
  };
  const dialogs: EditorDialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
  } as unknown as EditorDialogs;
  const canvas = {
    fitAll: vi.fn(),
    imageIdAt: vi.fn(() => null as string | null),
    canvasPointAt: vi.fn(() => ({ x: 7, y: 9 })),
    viewportCenter: vi.fn(() => ({ x: 1, y: 2 })),
    setDropTarget: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  // Each file "becomes" images/<name>, except those named "bad*".
  const addImages = vi
    .spyOn(harness.context.session, 'addImages')
    .mockImplementation(async (files) => ({
      added: files
        .filter((f) => !f.name.startsWith('bad'))
        .map((f) => `images/${f.name}`),
      failed: files.filter((f) => f.name.startsWith('bad')).map((f) => f.name),
    }));
  const replaceImage = vi
    .spyOn(harness.context.session, 'replaceImage')
    .mockResolvedValue('replaced');

  let current: ImageIntake | null = null;
  function Probe() {
    current = useImageIntake({ dialogs, notices });
    return null;
  }
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe />
    </EditorContext.Provider>,
  );
  return {
    harness,
    intake: () => {
      if (!current) throw new Error('hook not mounted');
      return current;
    },
    progress,
    messages,
    canvas,
    addImages,
    replaceImage,
  };
}

function dropEvent(files: File[], itemCount = files.length): DragEvent {
  const event = new Event('drop', { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: ['Files'], items: { length: itemCount } },
  });
  Object.defineProperty(event, 'clientX', { value: 10 });
  Object.defineProperty(event, 'clientY', { value: 20 });
  return event;
}

/** The async effects of `drop` cannot be awaited: waits for the call to happen. */
const settled = (fn: () => void) => waitFor(fn);

describe('useImageIntake: several files', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  it('imports one at a time, shows progress and selects the last one added', async () => {
    const files = [png('a.png'), png('b.png'), png('frente.jpg')];
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: files });
    await s.intake().onImagesChosen(input);

    expect(s.addImages).toHaveBeenCalledTimes(3);
    expect(s.progress.filter((p) => p !== null)).toHaveLength(3);
    expect(s.progress.at(-1)).toBeNull();
    expect(s.messages).toEqual([null]);
    // pt-BR kept: shared fixture data (file 'frente.jpg' of sampleProject) asserted by tests/
    // `images/frente.jpg` is image I2 of the test project.
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
    expect(s.canvas.fitAll).toHaveBeenCalledOnce();
  });

  it('lists the files that failed and goes on with the others', async () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [png('bad1.png'), png('frente.jpg'), png('bad2.png')],
    });
    await s.intake().onImagesChosen(input);

    expect(s.addImages).toHaveBeenCalledTimes(3);
    expect(s.messages.at(-1)).toContain('bad1.png');
    expect(s.messages.at(-1)).toContain('bad2.png');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });

  it('if all fail, the selection does not change', async () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [png('bad.png')] });
    await s.intake().onImagesChosen(input);
    expect(s.harness.ui.selection.value).toBeNull();
    expect(s.canvas.fitAll).not.toHaveBeenCalled();
    expect(s.messages.at(-1)).toContain('bad.png');
  });

  it('without files does nothing', async () => {
    const input = document.createElement('input');
    await s.intake().onImagesChosen(input);
    expect(s.addImages).not.toHaveBeenCalled();
  });
});

describe('useImageIntake: paste (Ctrl+V)', () => {
  it('Ctrl+V without an image in the event does nothing and does not block the default', () => {
    const s = setup();
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(s.addImages).not.toHaveBeenCalled();
  });

  it('Ctrl+V with an image adds at the center of the view', async () => {
    const s = setup();
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [png('c.png')] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await settled(() => expect(s.addImages).toHaveBeenCalledOnce());
    expect(s.addImages.mock.calls[0]?.[1]).toEqual({ center: { x: 1, y: 2 } });
  });
});

describe('useImageIntake: dropping files', () => {
  it('one file over an image replaces its file', async () => {
    const s = setup();
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('new.png')]));
    await settled(() => expect(s.replaceImage).toHaveBeenCalledOnce());
    expect(s.replaceImage.mock.calls[0]?.[0]).toBe('I1');
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.canvas.setDropTarget).toHaveBeenCalledWith(null);
  });

  it('replacing with a failure shows the message', async () => {
    const s = setup();
    s.replaceImage.mockResolvedValue('failed');
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('new.png')]));
    await settled(() => expect(s.messages.at(-1)).toBeTruthy());
    expect(s.progress.at(-1)).toBeNull();
  });

  it('replacing a locked image warns the reason', async () => {
    const s = setup();
    s.replaceImage.mockResolvedValue('locked');
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('new.png')]));
    await settled(() => expect(s.messages.at(-1)).toBe(t('image.replaceLocked')));
    expect(s.progress.at(-1)).toBeNull();
  });

  it('one file over an empty area adds at the canvas point', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('d.png')]));
    await settled(() => expect(s.addImages).toHaveBeenCalledOnce());
    expect(s.addImages.mock.calls[0]?.[1]).toEqual({ center: { x: 7, y: 9 } });
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('several files over an image add all of them, without replacing', async () => {
    const s = setup();
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('a.png'), png('b.png')]));
    await settled(() => expect(s.addImages).toHaveBeenCalledTimes(2));
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('files that are not images are ignored with a notice', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('e.png'), text('note.txt')]));
    await settled(() => expect(s.messages.at(-1)).toContain('note.txt'));
    expect(s.addImages).toHaveBeenCalledOnce();
  });

  it('only files that are not images: warns and does not add', () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([text('note.txt')]));
    expect(s.messages.at(-1)).toContain('note.txt');
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('read-only or busy: ignores the drop', () => {
    for (const options of [{ readOnly: true }, { busy: true }]) {
      cleanup();
      const s = setup(options);
      s.intake().dropHandlers.onDrop(dropEvent([png('f.png')]));
      expect(s.addImages).not.toHaveBeenCalled();
      expect(s.replaceImage).not.toHaveBeenCalled();
    }
  });

  it('dragover with files shows the target; dragleave clears it', () => {
    const s = setup();
    const over = new Event('dragover', { cancelable: true }) as DragEvent;
    Object.defineProperty(over, 'dataTransfer', {
      value: { types: ['Files'], items: { length: 1 }, dropEffect: 'none' },
    });
    s.canvas.imageIdAt.mockReturnValue('I2');
    s.intake().dropHandlers.onDragOver(over);
    expect(over.defaultPrevented).toBe(true);
    expect(s.canvas.setDropTarget).toHaveBeenLastCalledWith({ containerId: 'I2' });

    s.intake().dropHandlers.onDragLeave(new Event('dragleave') as DragEvent);
    expect(s.canvas.setDropTarget).toHaveBeenLastCalledWith(null);
  });
});

function dragOverEvent(): DragEvent {
  const event = new Event('dragover', { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { files: [], types: ['Files'], items: { length: 1 }, dropEffect: 'copy' },
  });
  Object.defineProperty(event, 'clientX', { value: 10 });
  Object.defineProperty(event, 'clientY', { value: 20 });
  return event;
}

describe('useImageIntake: file over the canvas unable to import (#972)', () => {
  it.each([
    ['read-only', { readOnly: true }],
    ['busy', { busy: true }],
  ])(
    '%s: dragover cancels the default action and does not light up the target',
    (_name, options) => {
      const s = setup(options);
      const event = dragOverEvent();
      s.intake().dropHandlers.onDragOver(event);
      expect(event.defaultPrevented).toBe(true);
      expect(event.dataTransfer?.dropEffect).toBe('none');
      expect(s.canvas.setDropTarget).not.toHaveBeenCalled();
    },
  );

  it('with permission: dragover copies and lights up the target', () => {
    const s = setup();
    const event = dragOverEvent();
    s.intake().dropHandlers.onDragOver(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer?.dropEffect).toBe('copy');
    expect(s.canvas.setDropTarget).toHaveBeenCalledOnce();
  });
});
