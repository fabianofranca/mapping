import { descendantsOf } from './hierarchy';
import { fail } from './errors';
import type { ItemKind } from './itemRef';
import type { Annotation, Marking, Project, ProjectImage } from './types';

// Dados que o Ctrl+C grava na área de transferência além do texto da referência, num formato
// próprio da app (formato web personalizado, ignorado por outros programas). Hoje só viaja:
// a ideia é, no futuro, duplicar itens com Ctrl+C / Ctrl+V dentro da app. Funções puras.

/** Tipo MIME do formato próprio; no `ClipboardItem` ele vai com o prefixo `web `. */
export const ITEM_CLIPBOARD_MIME = 'application/x-mapping-item+json';

/** Identificador do formato, para quem ler os dados colados reconhecê-los. */
export const ITEM_CLIPBOARD_FORMAT = 'mapping-item';

export interface ItemClipboardData {
  readonly format: typeof ITEM_CLIPBOARD_FORMAT;
  readonly version: 1;
  /** Nome da pasta do projeto de onde o item saiu. */
  readonly project: string;
  /** Referência `mapping://…` copiada junto. */
  readonly ref: string;
  readonly kind: ItemKind;
  /** O item copiado. */
  readonly item: ProjectImage | Marking | Annotation;
  /** Imagem: todas as suas marcações. Marcação: as descendentes dela. */
  readonly markings: readonly Marking[];
  /** Anotações do item copiado e de tudo o que ele leva consigo. */
  readonly annotations: readonly Annotation[];
}

/**
 * O item e o que ele carrega: uma imagem leva as marcações e anotações dela; uma marcação,
 * as descendentes e as anotações de todas; uma anotação, só ela.
 */
export function itemClipboardData(
  p: Project,
  kind: ItemKind,
  id: string,
  extra: { readonly project: string; readonly ref: string },
): ItemClipboardData {
  const base = { format: ITEM_CLIPBOARD_FORMAT, version: 1, kind, ...extra } as const;
  if (kind === 'a') {
    const item = p.annotations.find((a) => a.id === id) ?? fail('not-found', id);
    return { ...base, item, markings: [], annotations: [] };
  }
  if (kind === 'i') {
    const item = p.images.find((i) => i.id === id) ?? fail('not-found', id);
    const markings = p.markings.filter((m) => m.imageId === id);
    return { ...base, item, markings, annotations: annotationsOf(p, markings) };
  }
  const item = p.markings.find((m) => m.id === id) ?? fail('not-found', id);
  const markings = descendantsOf(p, id);
  return { ...base, item, markings, annotations: annotationsOf(p, [item, ...markings]) };
}

function annotationsOf(p: Project, markings: readonly Marking[]): Annotation[] {
  const ids = new Set(markings.map((m) => m.id));
  return p.annotations.filter((a) => ids.has(a.markingId));
}
