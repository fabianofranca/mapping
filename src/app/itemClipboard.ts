// "Copiar referência" e "Copiar recorte": o que o Ctrl+C, o Ctrl+Alt+C e os menus fazem.
// A referência (`mapping://<pasta>/<m|i|a>/<código>`, só a URL) é o que o dev cola no chat
// para o agente (MCP) achar o item; só existe em projetos abertos de uma pasta.
import { t } from '../i18n';
import {
  ITEM_CLIPBOARD_MIME,
  citationUrl,
  formatRef,
  isBackgroundContainer,
  itemClipboardData,
  shortCodes,
  type CitationTarget,
  type ItemKind,
  type Project,
  type Thread,
} from '../model';
import { cropToPng } from '../storage/imageCrop';
import { resolveSelection, showToast, type Selection } from '../store/ui';
import type { EditorContextValue } from '../ui/EditorContext';
import { writeClipboardPng, writeClipboardText } from '../utils/clipboard';
import { reportError } from '../utils/report';

/** Marcação (`m`), container (`i`) ou anotação (`a`): os alvos com dados próprios na cópia. */
export interface ItemCopyTarget {
  readonly kind: ItemKind;
  readonly id: string;
}

/** Campo tipado, par ou linha de tabela de uma anotação (CM5, decisão 32). */
export type PropertyCopyTarget = Extract<
  CitationTarget,
  { readonly kind: 'field' | 'entry' | 'row' }
>;

/** Camada (`l/`) ou conversa (`c/`): só a URL, sem dados do item. */
export type NodeCopyTarget = Extract<
  CitationTarget,
  { readonly kind: 'layer' | 'thread' }
>;

export type CopyTarget = ItemCopyTarget | PropertyCopyTarget | NodeCopyTarget;

/** O alvo é um item (marcação, container ou anotação)? */
export function isItemTarget(
  target: CopyTarget | CitationTarget,
): target is ItemCopyTarget {
  return target.kind === 'm' || target.kind === 'i' || target.kind === 'a';
}

const ITEM_CITATION_KIND = {
  m: 'marking',
  i: 'container',
  a: 'annotation',
} as const satisfies Record<ItemKind, 'marking' | 'container' | 'annotation'>;

/** O alvo da cópia como alvo de citação (o que `insertCitation` e `citationUrl` entendem). */
export function citationTargetOf(target: CopyTarget | CitationTarget): CitationTarget {
  return isItemTarget(target)
    ? { kind: ITEM_CITATION_KIND[target.kind], id: target.id }
    : target;
}

/** Só projetos de pasta têm um `<projeto>` que o MCP encontra. */
export function canCopyItems(editor: Pick<EditorContextValue, 'session'>): boolean {
  return editor.session.storage.folderName !== undefined;
}

export function targetOfSelection(selection: Selection): ItemCopyTarget | null {
  if (!selection) return null;
  return { kind: selection.kind === 'image' ? 'i' : 'm', id: selection.id };
}

/** Anotação em foco: o foco está dentro do cartão dela (fora dos campos, tratados antes). */
export function focusedAnnotationTarget(): ItemCopyTarget | null {
  const card = document.activeElement?.closest('[data-annotation]');
  const id = card?.getAttribute('data-annotation');
  return id ? { kind: 'a', id } : null;
}

/**
 * Propriedade em foco, a mais específica: a linha de uma tabela (`data-row-id`) vale mais que o
 * campo (`data-field`) em que está, e o par (`data-entry`) tem a vez do campo. Tudo dentro do
 * cartão da anotação (`data-annotation`); fora dele, ou sem foco, não há alvo.
 */
export function focusedPropertyTarget(): PropertyCopyTarget | null {
  const active = document.activeElement;
  const annotationId = active
    ?.closest('[data-annotation]')
    ?.getAttribute('data-annotation');
  if (!active || !annotationId) return null;
  const field = active.closest('[data-field]')?.getAttribute('data-field');
  const rowId = active.closest('[data-row-id]')?.getAttribute('data-row-id');
  if (field && rowId) return { kind: 'row', annotationId, key: field, rowId };
  const entryId = active.closest('[data-entry]')?.getAttribute('data-entry');
  if (entryId) return { kind: 'entry', annotationId, entryId };
  return field ? { kind: 'field', annotationId, key: field } : null;
}

/**
 * O Ctrl+C de uma propriedade com o foco num campo de texto: só sem texto selecionado nele
 * (com seleção, é do campo) e nunca no editor de texto formatado (`contentEditable`).
 */
export function copyKeyBelongsToProperty(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.isContentEditable) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.selectionStart === target.selectionEnd;
  }
  return true;
}

/** "Copiar recorte" só existe para marcação de imagem com arquivo (não de container sem arquivo). */
export function canCopyCrop(project: Project | null, markingId: string): boolean {
  const marking = project?.markings.find((m) => m.id === markingId);
  // Marcação do canvas (`containerId` nulo): não há imagem para recortar.
  if (!marking || marking.containerId === null) return false;
  const image = project?.containers.find((i) => i.id === marking.containerId);
  return image !== undefined && !isBackgroundContainer(image);
}

/**
 * Texto da referência e os dados do item no formato próprio da app; `null` se o alvo sumiu. A
 * propriedade, a camada e a conversa levam só a URL (`data` vazio): não há item para colar.
 */
export function buildReference(
  project: Project,
  folderName: string,
  target: CopyTarget,
  threads: readonly Thread[] = [],
): { readonly text: string; readonly data: string | null } | null {
  if (!isItemTarget(target)) {
    const url = citationUrl(folderName, project, threads, target);
    return url === null ? null : { text: url, data: null };
  }
  const code = shortCodes(project, target.kind).get(target.id);
  if (code === undefined) return null;
  const text = formatRef({ project: folderName, kind: target.kind, code });
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
  const reference = buildReference(
    project,
    folderName,
    target,
    session.threads.list.peek(),
  );
  const ok =
    reference !== null &&
    (await writeClipboardText(
      reference.text,
      reference.data === null
        ? undefined
        : { mime: ITEM_CLIPBOARD_MIME, data: reference.data },
    ));
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
  const image = marking && project?.containers.find((i) => i.id === marking.containerId);
  // Container sem arquivo não tem arquivo para recortar.
  if (!marking || !image || image.file === null) return false;
  const file = image.file;
  const png = (async () => {
    const data = await session.readImage(file);
    if (!data) throw new Error(`image file missing: ${file}`);
    return cropToPng(data, marking.rect);
  })();
  // O erro é tratado abaixo; sem isto uma recusa do `write` deixaria a promessa solta.
  png.catch((e: unknown) => reportError('copy.crop', e));
  const ok = await writeClipboardPng(png);
  showToast(ui, t(ok ? 'copy.cropDone' : 'copy.cropFailed'));
  return ok;
}

/**
 * O que o Ctrl+C copiaria agora: a propriedade em foco (linha, par ou campo), a anotação em foco
 * ou, senão, a seleção.
 */
export function copyShortcutTarget(editor: EditorContextValue): CopyTarget | null {
  const property = focusedPropertyTarget();
  if (property) return property;
  const annotation = focusedAnnotationTarget();
  if (annotation) return annotation;
  const selection = editor.ui.selection.peek();
  const exists = resolveSelection(editor.store.committed.peek(), selection) !== null;
  return exists ? targetOfSelection(selection) : null;
}
