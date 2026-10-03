import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  Reflect.deleteProperty(navigator, 'clipboard');
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
  // Cada arquivo "vira" images/<nome>, exceto os que se chamam "ruim*".
  const addImages = vi
    .spyOn(harness.context.session, 'addImages')
    .mockImplementation(async (files) => ({
      added: files
        .filter((f) => !f.name.startsWith('ruim'))
        .map((f) => `images/${f.name}`),
      failed: files.filter((f) => f.name.startsWith('ruim')).map((f) => f.name),
    }));
  const replaceImage = vi
    .spyOn(harness.context.session, 'replaceImage')
    .mockResolvedValue('replaced');

  let current: ImageIntake | null = null;
  function Probe() {
    current = useImageIntake({ desktop: true, dialogs, notices });
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
      if (!current) throw new Error('hook não montado');
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

/** Os efeitos assíncronos do `drop` não são aguardáveis: espera a chamada acontecer. */
const settled = (fn: () => void) => waitFor(fn);

describe('useImageIntake: vários arquivos', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  it('importa um por vez, mostra o progresso e seleciona a última adicionada', async () => {
    const files = [png('a.png'), png('b.png'), png('frente.jpg')];
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: files });
    await s.intake().onImagesChosen(input);

    expect(s.addImages).toHaveBeenCalledTimes(3);
    expect(s.progress.filter((p) => p !== null)).toHaveLength(3);
    expect(s.progress.at(-1)).toBeNull();
    expect(s.messages).toEqual([null]);
    // `images/frente.jpg` é a imagem I2 do projeto de teste.
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
    expect(s.canvas.fitAll).toHaveBeenCalledOnce();
  });

  it('lista os arquivos que falharam e segue com os demais', async () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [png('ruim1.png'), png('frente.jpg'), png('ruim2.png')],
    });
    await s.intake().onImagesChosen(input);

    expect(s.addImages).toHaveBeenCalledTimes(3);
    expect(s.messages.at(-1)).toContain('ruim1.png');
    expect(s.messages.at(-1)).toContain('ruim2.png');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });

  it('se todas falham, não muda a seleção', async () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [png('ruim.png')] });
    await s.intake().onImagesChosen(input);
    expect(s.harness.ui.selection.value).toBeNull();
    expect(s.canvas.fitAll).not.toHaveBeenCalled();
    expect(s.messages.at(-1)).toContain('ruim.png');
  });

  it('sem arquivos não faz nada', async () => {
    const input = document.createElement('input');
    await s.intake().onImagesChosen(input);
    expect(s.addImages).not.toHaveBeenCalled();
  });
});

describe('useImageIntake: colar', () => {
  it('área de transferência sem imagem avisa e não adiciona', async () => {
    const s = setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: vi.fn().mockResolvedValue([]) },
    });
    await s.intake().pasteImage();
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.messages.at(-1)).toBeTruthy();
  });

  it('item da área de transferência que não é imagem também conta como vazio', async () => {
    const s = setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: vi
          .fn()
          .mockResolvedValue([
            { types: ['text/plain'], getType: () => Promise.resolve(new Blob(['x'])) },
          ]),
      },
    });
    await s.intake().pasteImage();
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.messages.at(-1)).toBeTruthy();
  });

  it('imagem na área de transferência é adicionada no centro da vista', async () => {
    const s = setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        read: vi.fn().mockResolvedValue([
          {
            types: ['image/png'],
            getType: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
          },
        ]),
      },
    });
    await s.intake().pasteImage();
    expect(s.addImages).toHaveBeenCalledOnce();
    expect(s.addImages.mock.calls[0]?.[1]).toEqual({ center: { x: 1, y: 2 } });
    expect(s.canvas.fitAll).not.toHaveBeenCalled();
  });

  it('erro ao ler a área de transferência vira mensagem', async () => {
    const s = setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: vi.fn().mockRejectedValue(new Error('negado')) },
    });
    await s.intake().pasteImage();
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.messages.at(-1)).toBeTruthy();
  });

  it('Ctrl+V sem imagem no evento não faz nada e não bloqueia o padrão', () => {
    const s = setup();
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(s.addImages).not.toHaveBeenCalled();
  });

  it('Ctrl+V com imagem adiciona no centro da vista', async () => {
    const s = setup();
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { files: [png('c.png')] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await settled(() => expect(s.addImages).toHaveBeenCalledOnce());
    expect(s.addImages.mock.calls[0]?.[1]).toEqual({ center: { x: 1, y: 2 } });
  });
});

describe('useImageIntake: soltar arquivos', () => {
  it('um arquivo sobre uma imagem troca o arquivo dela', async () => {
    const s = setup();
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('nova.png')]));
    await settled(() => expect(s.replaceImage).toHaveBeenCalledOnce());
    expect(s.replaceImage.mock.calls[0]?.[0]).toBe('I1');
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.canvas.setDropTarget).toHaveBeenCalledWith(null);
  });

  it('trocar com falha mostra a mensagem', async () => {
    const s = setup();
    s.replaceImage.mockResolvedValue('failed');
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('nova.png')]));
    await settled(() => expect(s.messages.at(-1)).toBeTruthy());
    expect(s.progress.at(-1)).toBeNull();
  });

  it('um arquivo em área vazia adiciona no ponto do canvas', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('d.png')]));
    await settled(() => expect(s.addImages).toHaveBeenCalledOnce());
    expect(s.addImages.mock.calls[0]?.[1]).toEqual({ center: { x: 7, y: 9 } });
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('vários arquivos sobre uma imagem adicionam todos, sem trocar', async () => {
    const s = setup();
    s.canvas.imageIdAt.mockReturnValue('I1');
    s.intake().dropHandlers.onDrop(dropEvent([png('a.png'), png('b.png')]));
    await settled(() => expect(s.addImages).toHaveBeenCalledTimes(2));
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('arquivos que não são imagem são ignorados com aviso', async () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([png('e.png'), text('nota.txt')]));
    await settled(() => expect(s.messages.at(-1)).toContain('nota.txt'));
    expect(s.addImages).toHaveBeenCalledOnce();
  });

  it('só arquivos que não são imagem: avisa e não adiciona', () => {
    const s = setup();
    s.intake().dropHandlers.onDrop(dropEvent([text('nota.txt')]));
    expect(s.messages.at(-1)).toContain('nota.txt');
    expect(s.addImages).not.toHaveBeenCalled();
    expect(s.replaceImage).not.toHaveBeenCalled();
  });

  it('somente leitura ou ocupado: ignora o drop', () => {
    for (const options of [{ readOnly: true }, { busy: true }]) {
      cleanup();
      const s = setup(options);
      s.intake().dropHandlers.onDrop(dropEvent([png('f.png')]));
      expect(s.addImages).not.toHaveBeenCalled();
      expect(s.replaceImage).not.toHaveBeenCalled();
    }
  });

  it('dragover com arquivos mostra o alvo; dragleave limpa', () => {
    const s = setup();
    const over = new Event('dragover', { cancelable: true }) as DragEvent;
    Object.defineProperty(over, 'dataTransfer', {
      value: { types: ['Files'], items: { length: 1 }, dropEffect: 'none' },
    });
    s.canvas.imageIdAt.mockReturnValue('I2');
    s.intake().dropHandlers.onDragOver(over);
    expect(over.defaultPrevented).toBe(true);
    expect(s.canvas.setDropTarget).toHaveBeenLastCalledWith({ imageId: 'I2' });

    s.intake().dropHandlers.onDragLeave(new Event('dragleave') as DragEvent);
    expect(s.canvas.setDropTarget).toHaveBeenLastCalledWith(null);
  });
});
