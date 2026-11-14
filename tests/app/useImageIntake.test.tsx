import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageIntake, type ImageIntake } from '../../src/app/useImageIntake';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Dropping and pasting images: what each gesture really does (#971, phase 1).

const png = (name: string) =>
  new File([new Uint8Array([1])], name, { type: 'image/png' });
const text = (name: string) => new File(['x'], name, { type: 'text/plain' });

function setup(busy = false) {
  const harness = createHarness(sampleProject());
  const addImages = vi.spyOn(harness.context.session, 'addImages').mockResolvedValue({
    added: [],
    failed: [],
  } as unknown as Awaited<ReturnType<typeof harness.context.session.addImages>>);
  const replaceImage = vi
    .spyOn(harness.context.session, 'replaceImage')
    .mockResolvedValue('replaced' as never);
  const canvas = {
    imageIdAt: vi.fn(() => 'I1'),
    canvasPointAt: vi.fn(() => ({ x: 1, y: 2 })),
    viewportCenter: vi.fn(() => ({ x: 3, y: 4 })),
    setDropTarget: vi.fn(),
    fitAll: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  const setMessage = vi.fn();
  const notices: EditorNotices = {
    progress: busy ? 'importando' : null,
    message: null,
    busy,
    setProgress: vi.fn(),
    setMessage,
  };
  let intake!: ImageIntake;
  const Probe = () => {
    intake = useImageIntake({ dialogs: {} as EditorDialogs, notices });
    return null;
  };
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe />
    </EditorContext.Provider>,
  );
  return { intake: () => intake, addImages, replaceImage, setMessage };
}

function dropEvent(files: File[]): DragEvent {
  const event = new Event('drop', { cancelable: true, bubbles: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, items: { length: files.length } },
  });
  return event;
}

function pasteEvent(files: File[]): ClipboardEvent {
  const event = new Event('paste', { cancelable: true, bubbles: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { files } });
  return event;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useImageIntake: drop (#971, item 2)', () => {
  it('an image over an existing image replaces it', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('a.png')]));
    await vi.waitFor(() => expect(s.replaceImage).toHaveBeenCalledOnce());
    expect(s.addImages).not.toHaveBeenCalled();
  });

  it('an image + a non-image file does not replace: it enters as a new container and warns', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('a.png'), text('note.txt')]));
    await vi.waitFor(() => expect(s.addImages).toHaveBeenCalledOnce());
    expect(s.replaceImage).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(s.setMessage).toHaveBeenCalledWith(
        t('editor.dropIgnored', { names: 'note.txt' }),
      ),
    );
  });
});

describe('useImageIntake: paste (#971, item 3)', () => {
  it('pasting an image imports it', async () => {
    const s = setup();
    window.dispatchEvent(pasteEvent([png('a.png')]));
    await vi.waitFor(() => expect(s.addImages).toHaveBeenCalledOnce());
  });

  it('with an import in progress (busy) the paste is ignored, like the drop', () => {
    const s = setup(true);
    const event = pasteEvent([png('a.png')]);
    window.dispatchEvent(event);
    expect(s.addImages).not.toHaveBeenCalled();
  });
});
