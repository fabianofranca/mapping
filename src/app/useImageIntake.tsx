import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import type { ProjectImage } from '../model';
import type { AspectChange } from '../store/session';
import { reportError } from '../utils/report';
import { useEditor } from '../ui/EditorContext';
import {
  canReadClipboard,
  dragHasFiles,
  imagesFromPaste,
  readClipboardImages,
  splitImageFiles,
} from './imageIntake';
import { isTextInput } from './shortcuts';
import type { EditorDialogs } from './useEditorDialogs';
import type { EditorNotices } from './useEditorNotices';

interface ImageIntakeOptions {
  readonly desktop: boolean;
  readonly dialogs: EditorDialogs;
  readonly notices: EditorNotices;
}

export interface ImageIntake {
  readonly imageInput: { current: HTMLInputElement | null };
  readonly replaceInput: { current: HTMLInputElement | null };
  onImagesChosen(input: HTMLInputElement): Promise<void>;
  onReplaceChosen(input: HTMLInputElement): Promise<void>;
  /** Botão de adicionar: no celular com clipboard, oferece "Colar imagem". */
  onAddClick(): void;
  pickFromDevice(): void;
  pasteImage(): Promise<void>;
  requestReplace(image: ProjectImage): void;
  readonly dropHandlers: {
    readonly onDragOver: (e: DragEvent) => void;
    readonly onDragLeave: (e: DragEvent) => void;
    readonly onDrop: (e: DragEvent) => void;
  };
}

/** Entrada de imagens: escolher, colar, arrastar e soltar, e trocar o arquivo de uma imagem. */
export function useImageIntake({
  desktop,
  dialogs,
  notices,
}: ImageIntakeOptions): ImageIntake {
  const { session, store, ui, canvas } = useEditor();
  const { busy, setProgress, setMessage } = notices;
  const readOnly = store.locked.value;
  const imageInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  /** Importa as imagens; `center` (canvas) as posiciona perto de um ponto. */
  const addFiles = async (files: readonly File[], center?: { x: number; y: number }) => {
    if (files.length === 0 || readOnly) return;
    setMessage(null);
    const failed: string[] = [];
    const added: string[] = [];
    // Uma chamada por arquivo para mostrar o progresso.
    for (const [index, file] of files.entries()) {
      setProgress(t('editor.importing', { current: index + 1, total: files.length }));
      const result = await session.addImages([file], { center });
      failed.push(...result.failed);
      added.push(...result.added);
    }
    setProgress(null);
    const last = store.project.peek()?.images.find((i) => i.file === added.at(-1));
    if (last) {
      ui.selection.value = { kind: 'image', id: last.id };
      if (!center) canvas.current?.fitAll();
    }
    if (failed.length > 0)
      setMessage(t('editor.importFailed', { names: failed.join(', ') }));
  };

  const addAtViewCenter = (files: readonly File[]) =>
    addFiles(files, canvas.current?.viewportCenter());

  const askAspectChange = (change: AspectChange) =>
    new Promise<boolean>((resolve) => dialogs.show({ kind: 'aspect', change, resolve }));

  const replaceWith = async (imageId: string, file: File) => {
    setMessage(null);
    setProgress(t('image.replacing'));
    const result = await session.replaceImage(imageId, file, askAspectChange);
    setProgress(null);
    if (result === 'failed') setMessage(t('image.replaceFailed'));
    else if (result === 'locked') setMessage(t('image.replaceLocked'));
  };

  // Ctrl/Cmd+V com o foco fora de campos de texto adiciona a imagem copiada.
  // O listener é inscrito uma vez; `pasteFiles` aponta para a versão atual de `addAtViewCenter`.
  const pasteFiles = useRef<(files: readonly File[]) => void>(() => {});
  pasteFiles.current = (files) => void addAtViewCenter(files);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextInput(e.target) || document.querySelector('dialog[open]')) return;
      const files = imagesFromPaste(e.clipboardData);
      if (files.length === 0 || !store.project.peek() || store.locked.peek()) return;
      e.preventDefault();
      pasteFiles.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [store]);

  // ---- Arrastar e soltar arquivos ----

  const dropTargetAt = (e: DragEvent) => {
    const single = (e.dataTransfer?.items.length ?? 0) === 1;
    const imageId = canvas.current?.imageIdAt(e.clientX, e.clientY) ?? null;
    return { imageId: single ? imageId : null };
  };

  const onDragOver = (e: DragEvent) => {
    if (!dragHasFiles(e.dataTransfer) || readOnly || busy) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    canvas.current?.setDropTarget(dropTargetAt(e));
  };

  const onDragLeave = (e: DragEvent) => {
    // Só limpa ao sair da área (dragleave também dispara entre filhos).
    if (e.relatedTarget instanceof Node && e.currentTarget instanceof Node) {
      if (e.currentTarget.contains(e.relatedTarget)) return;
    }
    canvas.current?.setDropTarget(null);
  };

  const onDrop = (e: DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    canvas.current?.setDropTarget(null);
    if (readOnly || busy) return;
    const { images, ignored } = splitImageFiles([...(e.dataTransfer?.files ?? [])]);
    const [only] = images;
    const overImage = canvas.current?.imageIdAt(e.clientX, e.clientY) ?? null;
    const warn = () => {
      if (ignored.length > 0)
        setMessage(t('editor.dropIgnored', { names: ignored.join(', ') }));
    };
    if (!only) return warn();
    if (images.length === 1 && overImage) {
      void replaceWith(overImage, only).then(warn);
      return;
    }
    const point = canvas.current?.canvasPointAt(e.clientX, e.clientY);
    void addFiles(images, point).then(warn);
  };

  return {
    imageInput,
    replaceInput,
    onImagesChosen: async (input) => {
      const files = [...(input.files ?? [])];
      input.value = '';
      await addFiles(files);
    },
    onReplaceChosen: async (input) => {
      const file = input.files?.[0];
      input.value = '';
      const imageId = replaceTarget.current;
      replaceTarget.current = null;
      if (!file || !imageId) return;
      await replaceWith(imageId, file);
    },
    onAddClick: () => {
      if (!desktop && canReadClipboard()) dialogs.show({ kind: 'addMenu' });
      else imageInput.current?.click();
    },
    pickFromDevice: () => {
      dialogs.close();
      imageInput.current?.click();
    },
    pasteImage: async () => {
      dialogs.close();
      try {
        const files = await readClipboardImages();
        if (files.length === 0) setMessage(t('editor.pasteEmpty'));
        else await addAtViewCenter(files);
      } catch (e) {
        reportError('editor.paste', e);
        setMessage(t('editor.pasteFailed'));
      }
    },
    requestReplace: (image) => {
      replaceTarget.current = image.id;
      replaceInput.current?.click();
    },
    dropHandlers: { onDragOver, onDragLeave, onDrop },
  };
}

/** Os `<input type="file">` escondidos que o botão de adicionar e "Trocar imagem" acionam. */
export function ImageInputs({ intake }: { readonly intake: ImageIntake }) {
  return (
    <>
      <input
        ref={intake.imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void intake.onImagesChosen(e.currentTarget)}
      />
      <input
        ref={intake.replaceInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void intake.onReplaceChosen(e.currentTarget)}
      />
    </>
  );
}
