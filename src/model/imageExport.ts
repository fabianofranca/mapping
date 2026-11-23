import { boundingBox } from './geometry';
import { projectIndex } from './projectIndex';
import type { Marking, Project, ProjectContainer, Rect } from './types';

/** Why a set of markings cannot be exported as one image. */
export type ImageExportRefusal = 'different-images' | 'no-image' | 'not-in-project';

export type ImageExportTarget =
  | {
      readonly ok: true;
      readonly containerId: string;
      /** Union of the markings' rects, clipped to the container (pixels of the original image). */
      readonly rect: Rect;
      readonly markingIds: readonly string[];
    }
  | { readonly ok: false; readonly reason: ImageExportRefusal };

function clipRect(r: Rect, width: number, height: number): Rect {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(width, r.x + r.width);
  const y1 = Math.min(height, r.y + r.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** The containers' file check of an export: one container with a file, or why not. */
function exportContainer(
  p: Project,
  markings: readonly Marking[],
): ProjectContainer | ImageExportRefusal {
  const index = projectIndex(p);
  const ids = new Set(markings.map((m) => m.containerId));
  const only = markings[0]?.containerId ?? null;
  if (only === null || markings.some((m) => m.floating || m.containerId === null)) {
    return 'no-image';
  }
  if (ids.size > 1) return 'different-images';
  const container = index.containers.get(only);
  return container && container.file !== null ? container : 'no-image';
}

/**
 * What to crop to export the image of `markingIds`: the markings must all live in the same
 * container, which must have a file. The rect is the union of their rects clipped to the
 * container's pixels. Pure: the crop itself happens in `src/storage/`.
 */
export function imageExportTarget(
  p: Project,
  markingIds: readonly string[],
): ImageExportTarget {
  const index = projectIndex(p);
  const markings = markingIds.flatMap((id) => index.markings.get(id) ?? []);
  const box = boundingBox(markings.map((m) => m.rect));
  if (!box || markings.length !== markingIds.length) {
    return { ok: false, reason: 'not-in-project' };
  }
  const container = exportContainer(p, markings);
  if (typeof container === 'string') return { ok: false, reason: container };
  return {
    ok: true,
    containerId: container.id,
    rect: clipRect(box, container.width, container.height),
    markingIds: [...markingIds],
  };
}

export type ImageExportSubject =
  | { readonly kind: 'one'; readonly code: string }
  | { readonly kind: 'many'; readonly count: number };

const FORBIDDEN = /[\\/:*?"<>|\s\p{Cc}]+/gu;

function sanitize(text: string): string {
  const cleaned = text.replace(FORBIDDEN, '-').replace(/^[-.]+|[-.]+$/g, '');
  return cleaned === '' ? 'image' : cleaned;
}

function baseName(file: string): string {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Suggested file name of the exported PNG: `<image name>-<marking code>.png` for one marking,
 * `<image name>-<selection word>-<n>.png` for several. The image name is the container's `name`
 * or, with none, its file's base name; forbidden characters and runs of spaces become `-`.
 */
export function exportImageName(
  container: Pick<ProjectContainer, 'name' | 'file'>,
  subject: ImageExportSubject,
  selectionWord: string,
): string {
  const label = container.name ?? (container.file ? baseName(container.file) : '');
  const image = sanitize(label);
  const tail =
    subject.kind === 'one'
      ? sanitize(subject.code)
      : `${sanitize(selectionWord)}-${subject.count}`;
  return `${image}-${tail}.png`;
}
