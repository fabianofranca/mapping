import { readFile } from 'node:fs/promises';
import { templateMessage } from '../../src/model';
import type { SceneNode } from '../../src/model/components/scene';
import { MAX_IMAGES_TOTAL_BYTES, imageProblems } from '../../src/model/libraryImages';
import { decodeImage } from './codecs';
import type { Raster } from './raster';

// The images of a library package that the MCP raster draws (stage #1903, decision 17): the
// files cited by the components' `image` nodes, decoded with the server's codecs (EXIF
// orientation applied) into a `Raster` and cached by file stamp (real path, size and `mtime`, like
// the fonts). The limits of decision 12 hold here too, so a package that skipped the validator
// still cannot grow the server's memory: an image that is refused, corrupt or missing is the
// placeholder in the drawing and a note for the tool's warning, never an exception.

/** A package file on disk: where it is, what `stat` said and the key that tells it changed. */
export interface PackageImageFile {
  readonly real: string;
  readonly size: number;
  readonly stamp: string;
}

/** The decoded image, or why it is not drawn. */
export type PackageImageResult =
  | { readonly ok: true; readonly raster: Raster }
  | { readonly ok: false; readonly reason: string };

/** Decoded bytes the process cache holds (RGBA: 4 bytes a pixel); the oldest image leaves first. */
export const PACKAGE_IMAGE_CACHE_BYTES = 64 * 1024 * 1024;

const problemsText = (path: string, problems: ReturnType<typeof imageProblems>): string =>
  problems.map((p) => templateMessage(p.code, p.params).text).join('; ') ||
  `could not read the package image: ${path}`;

async function decodeFile(
  file: PackageImageFile,
  path: string,
): Promise<PackageImageResult> {
  // A file over 1 MB is refused by its size, before anything is read.
  const heavy = imageProblems(path, { size: file.size });
  if (heavy.length > 0) return { ok: false, reason: problemsText(path, heavy) };
  let bytes: Buffer;
  try {
    bytes = await readFile(file.real);
  } catch {
    return { ok: false, reason: `could not read the package image: ${path}` };
  }
  // The checks again on what was read: the file may have changed since `stat`.
  const problems = imageProblems(path, { bytes });
  if (problems.length > 0) return { ok: false, reason: problemsText(path, problems) };
  try {
    return { ok: true, raster: (await decodeImage(bytes)).raster };
  } catch {
    return { ok: false, reason: `could not decode the package image: ${path}` };
  }
}

interface Entry {
  readonly stamp: string;
  readonly promise: Promise<PackageImageResult>;
  bytes: number;
}

/**
 * Decoded package images by file: one entry per real path, replaced when its stamp changes, with
 * the decoded bytes bounded (the oldest leaves first). A refusal is cached too (it costs no
 * memory), so a corrupt file is not decoded on every render.
 */
export class PackageImageCache {
  private readonly byPath = new Map<string, Entry>();

  constructor(private readonly limit = PACKAGE_IMAGE_CACHE_BYTES) {}

  /** How many files the cache holds. */
  get entries(): number {
    return this.byPath.size;
  }

  /** Decoded bytes held. */
  get bytes(): number {
    let total = 0;
    for (const entry of this.byPath.values()) total += entry.bytes;
    return total;
  }

  /** The image of `file`; `path` is the package path as cited (its extension names the format). */
  load(file: PackageImageFile, path: string): Promise<PackageImageResult> {
    const hit = this.byPath.get(file.real);
    if (hit?.stamp === file.stamp) {
      this.byPath.delete(file.real);
      this.byPath.set(file.real, hit);
      return hit.promise;
    }
    const entry: Entry = { stamp: file.stamp, promise: decodeFile(file, path), bytes: 0 };
    this.byPath.delete(file.real);
    this.byPath.set(file.real, entry);
    void entry.promise.then((result) => {
      if (!result.ok) return;
      entry.bytes = result.raster.width * result.raster.height * 4;
      this.trim();
    });
    return entry.promise;
  }

  private trim(): void {
    let total = this.bytes;
    for (const [real, entry] of this.byPath) {
      if (total <= this.limit) return;
      this.byPath.delete(real);
      total -= entry.bytes;
    }
  }
}

const sharedCache = new PackageImageCache();

/** An image a drawing needs: its specialization, its package path and its file (`null` = not in the package). */
export interface ImageNeed {
  readonly specId: string;
  readonly asset: string;
  readonly file: PackageImageFile | null;
}

/** The package images of a drawing, ready for the raster. */
export interface PackageImages {
  /** The decoded image of `(specId, asset)`; `undefined` = the placeholder. */
  get(specId: string, asset: string): Raster | undefined;
  /** One line for each image that is not drawn and why (for the tool's warning). */
  readonly notes: readonly string[];
}

/** No package images: every image is the placeholder. */
export const NO_PACKAGE_IMAGES: PackageImages = { get: () => undefined, notes: [] };

const keyOf = (specId: string, asset: string): string => `${specId}\0${asset}`;

/**
 * Decodes the needed images, in order. The distinct files add up to at most 8 MB (the validator's
 * limit); the ones past it are not drawn.
 */
export async function loadPackageImages(
  needs: readonly ImageNeed[],
  cache: PackageImageCache = sharedCache,
): Promise<PackageImages> {
  const images = new Map<string, Raster>();
  const notes: string[] = [];
  const counted = new Set<string>();
  let total = 0;
  for (const { specId, asset, file } of needs) {
    const key = keyOf(specId, asset);
    if (images.has(key)) continue;
    if (file === null) {
      notes.push(templateMessage('library.imageValueMissing', { path: asset }).text);
      continue;
    }
    if (!counted.has(file.stamp)) {
      total += file.size;
      counted.add(file.stamp);
    }
    if (total > MAX_IMAGES_TOTAL_BYTES) {
      const exceed = templateMessage('library.imagesTooHeavy').text;
      notes.push(`${exceed}: ${asset} is not drawn`);
      continue;
    }
    const result = await cache.load(file, asset);
    if (result.ok) images.set(key, result.raster);
    else notes.push(result.reason);
  }
  return { get: (specId, asset) => images.get(keyOf(specId, asset)), notes };
}

/** What a drawing cites: the specialization and the package path of an image. */
export interface ImageRef {
  readonly specId: string;
  readonly asset: string;
}

/** Finds the files of the images a drawing cites and decodes them (`projects.ts` builds one for a project). */
export type ImageResolver = (refs: readonly ImageRef[]) => Promise<PackageImages>;

function collectAssets(
  node: SceneNode,
  specId: string,
  out: Map<string, ImageRef>,
): void {
  for (const paint of node.fills) {
    if (paint.type === 'image' && paint.asset !== undefined) {
      out.set(keyOf(specId, paint.asset), { specId, asset: paint.asset });
    }
  }
  if (node.type === 'frame' || node.type === 'group') {
    for (const child of node.children) collectAssets(child, specId, out);
  }
}

/** The distinct package images the scenes cite, in drawing order (a scene without a `specId` cites none). */
export function imageRefsOf(
  drawings: Iterable<{ readonly root: SceneNode; readonly specId?: string }>,
): ImageRef[] {
  const found = new Map<string, ImageRef>();
  for (const { root, specId } of drawings) {
    if (specId !== undefined) collectAssets(root, specId, found);
  }
  return [...found.values()];
}
