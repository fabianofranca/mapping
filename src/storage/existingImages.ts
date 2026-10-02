import { addImage, uniqueImageFile, type Project } from '../model';
import type { ExistingImage } from './folder';
import { IMAGES_DIR, type ProjectStorage } from './types';
import { reportError } from '../utils/report';

export interface ImportExistingDeps {
  /** Dimensões com a orientação EXIF aplicada (ver `readImageSize`). */
  readonly readSize: (
    data: Blob,
    name: string,
  ) => Promise<{ width: number; height: number }>;
  readonly newId: () => string;
}

export interface ImportExistingResult {
  readonly project: Project;
  /** Imagens que não puderam ser lidas; ficam onde estavam. */
  readonly skipped: readonly string[];
}

/**
 * Adiciona ao projeto as imagens que já estavam na pasta, posicionadas
 * automaticamente. As de `images/` ficam onde estão; as da raiz são movidas
 * para `images/` (com sufixo `-2`, `-3`… em caso de colisão). Os arquivos não
 * são recodificados: as dimensões já consideram a orientação EXIF.
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
  // Arquivos de `images/` que não entrarem no projeto continuam ocupando o nome.
  const taken = new Set(images.map((i) => i.path).filter(isInImages));
  for (const image of images) {
    try {
      const data = await storage.readImage(image.path);
      if (!data) throw new Error('missing');
      const size = await deps.readSize(data, image.name);
      const inImages = isInImages(image.path);
      const file = inImages ? image.path : uniqueImageFile(p, image.name, taken);
      const next = addImage(p, { id: deps.newId(), file, ...size });
      if (!inImages) {
        await storage.writeImage(file, data);
        await storage.removeImage(image.path);
      }
      p = next;
    } catch (e) {
      reportError('folder.importExisting', e);
      skipped.push(image.path);
    }
  }
  return { project: p, skipped };
}
