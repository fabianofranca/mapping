import { addContainer, uniqueImageFile, type Project } from '../model';
import type { ExistingImage } from './folder';
import { IMAGES_DIR, type ProjectStorage } from './types';
import { reportError } from '../utils/report';

export interface ImportExistingDeps {
  /** Dimensions with the EXIF orientation applied (see `readImageSize`). */
  readonly readSize: (
    data: Blob,
    name: string,
  ) => Promise<{ width: number; height: number }>;
  readonly newId: () => string;
}

export interface ImportExistingResult {
  readonly project: Project;
  /** Images that could not be read; they stay where they were. */
  readonly skipped: readonly string[];
}

/**
 * Adds to the project the images that were already in the folder, positioned
 * automatically. Those in `images/` stay where they are; those at the root are moved
 * to `images/` (with suffix `-2`, `-3`… on collision). Files are not
 * re-encoded: the dimensions already account for the EXIF orientation.
 */
export async function importExistingImages(
  storage: ProjectStorage,
  project: Project,
  images: readonly ExistingImage[],
  deps: ImportExistingDeps,
): Promise<ImportExistingResult> {
  let p = project;
  const skipped: string[] = [];
  const isInImages = (path: string) => path.startsWith(`${IMAGES_DIR}/`);
  // Files in `images/` that do not enter the project keep occupying the name.
  const taken = new Set(images.map((i) => i.path).filter(isInImages));
  for (const image of images) {
    try {
      const data = await storage.readImage(image.path);
      if (!data) throw new Error('missing');
      const size = await deps.readSize(data, image.name);
      const inImages = isInImages(image.path);
      const file = inImages ? image.path : uniqueImageFile(p, image.name, taken);
      const next = addContainer(p, { id: deps.newId(), file, ...size });
      if (!inImages) {
        await storage.writeImage(file, data);
        // The copy is already in `images/`: the container enters the project even if the original cannot
        // be deleted (no loss; the original stays where it was and the failure goes to Diagnostics).
        await storage.removeImage(image.path).catch((e: unknown) => {
          reportError('folder.importExisting.remove', e);
        });
      }
      taken.add(file);
      p = next;
    } catch (e) {
      reportError('folder.importExisting', e);
      skipped.push(image.path);
    }
  }
  return { project: p, skipped };
}
