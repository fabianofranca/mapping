// "Copiar referência" e "Copiar recorte": o que o Ctrl+C, o Ctrl+Alt+C e os menus fazem.
// A referência (`mapping://<pasta>/<m|i|a>/<código> (<caminho>)`) é o que o dev cola no chat
// para o agente (MCP) achar o item; só existe em projetos abertos de uma pasta.
import { t } from '../i18n';
import {
  ITEM_CLIPBOARD_MIME,
  formatRef,
  itemClipboardData,
  shortCode,
  type ItemKind,
  type Project,
} from '../model';
import { cropToPng } from '../storage/imageCrop';
import { resolveSelection, showToast, type Selection } from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';
import { annotationLabel, imageLabel, markingPath } from '../ui/labels';
import { writeClipboardPng, writeClipboardText } from '../utils/clipboard';
import { reportError } from '../utils/report';

export interface CopyTarget {
  readonly kind: ItemKind;
  readonly id: string;
}

/** Só projetos de pasta têm um `<projeto>` que o MCP encontra. */
export function canCopyItems(editor: Pick<EditorContextValue, 'session'>): boolean {
  return editor.session.storage.folderName !== undefined;
}

export function targetOfSelection(selection: Selection): CopyTarget | null {
  if (!selection) return null;
  return { kind: selection.kind === 'image' ? 'i' : 'm', id: selection.id };
}

/** Anotação em foco: o foco está dentro do cartão dela (fora dos campos, tratados antes). */
export function focusedAnnotationTarget(): CopyTarget | null {
  const card = document.activeElement?.closest('[data-annotation]');
  const id = card?.getAttribute('data-annotation');
  return id ? { kind: 'a', id } : null;
}

/** Caminho legível da referência: `Imagem › Marcação › Anotação`. */
function readablePath(project: Project, target: CopyTarget): string | null {
  const separator = t('marking.pathSeparator');
  const imageOf = (id: string) => project.images.find((i) => i.id === id);
  const markingOf = (id: string) => project.markings.find((m) => m.id === id);
  if (target.kind === 'i') {
    const image = imageOf(target.id);
    return image ? imageLabel(image) : null;
  }
  if (target.kind === 'm') {
    const marking = markingOf(target.id);
    const image = marking && imageOf(marking.imageId);
    if (!marking || !image) return null;
    return [imageLabel(image), markingPath(project, marking)].join(separator);
  }
  const annotation = project.annotations.find((a) => a.id === target.id);
  const owner = annotation && markingOf(annotation.markingId);
  const image = owner && imageOf(owner.imageId);
  if (!annotation || !owner || !image) return null;
  return [
    imageLabel(image),
    markingPath(project, owner),
    annotationLabel(annotation),
  ].join(separator);
}

/** Texto da referência e os dados do item no formato próprio da app; `null` se o item sumiu. */
export function buildReference(
  project: Project,
  folderName: string,
  target: CopyTarget,
): { readonly text: string; readonly data: string } | null {
  const label = readablePath(project, target);
  if (label === null) return null;
  const text = formatRef({
    project: folderName,
    kind: target.kind,
    code: shortCode(project, target.kind, target.id),
    label,
  });
  const data = itemClipboardData(project, target.kind, target.id, {
    project: folderName,
    ref: text,
  });
  return { text, data: JSON.stringify(data) };
}

/** Copia a referência do item (e, junto, os dados dele) e avisa. `false` se não copiou. */
export async function copyReference(
  editor: EditorContextValue,
  target: CopyTarget,
): Promise<boolean> {
  const { store, session, ui } = editor;
  const project = store.committed.peek();
  const folderName = session.storage.folderName;
  if (!project || folderName === undefined) return false;
  const reference = buildReference(project, folderName, target);
  const ok =
    reference !== null &&
    (await writeClipboardText(reference.text, {
      mime: ITEM_CLIPBOARD_MIME,
      data: reference.data,
    }));
  showToast(ui, t(ok ? 'copy.referenceDone' : 'copy.failed'));
  return ok;
}

/** Copia como PNG o recorte da marcação (pixels da imagem original, até 2048 px) e avisa. */
export async function copyCrop(
  editor: EditorContextValue,
  markingId: string,
): Promise<boolean> {
  const { store, session, ui } = editor;
  const project = store.committed.peek();
  const marking = project?.markings.find((m) => m.id === markingId);
  const image = marking && project?.images.find((i) => i.id === marking.imageId);
  if (!marking || !image) return false;
  const png = (async () => {
    const data = await session.readImage(image.file);
    if (!data) throw new Error(`image file missing: ${image.file}`);
    return cropToPng(data, marking.rect);
  })();
  // O erro é tratado abaixo; sem isto uma recusa do `write` deixaria a promessa solta.
  png.catch((e: unknown) => reportError('copy.crop', e));
  const ok = await writeClipboardPng(png);
  showToast(ui, t(ok ? 'copy.cropDone' : 'copy.cropFailed'));
  return ok;
}

/** Item que o Ctrl+C copiaria agora: a anotação em foco ou, senão, a seleção. */
export function copyShortcutTarget(editor: EditorContextValue): CopyTarget | null {
  const annotation = focusedAnnotationTarget();
  if (annotation) return annotation;
  const selection = editor.ui.selection.peek();
  const exists = resolveSelection(editor.store.committed.peek(), selection) !== null;
  return exists ? targetOfSelection(selection) : null;
}
