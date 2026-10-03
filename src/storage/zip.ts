import JSZip from 'jszip';
import {
  IMAGES_DIR,
  MAPPING_FILE,
  SPECS_DIR,
  imageMimeType,
  isImageFileName,
  isSpecPath,
} from './types';
import { reportError } from '../utils/report';

/** Conteúdo de um projeto em memória, no formato da pasta (ver PLAN.md 5.1 e 13.3). */
export interface ProjectFiles {
  readonly mapping: string;
  /** Caminho relativo (`images/foto.jpg`) → conteúdo. */
  readonly images: ReadonlyMap<string, Blob>;
  /** Cópias das especializações: caminho relativo (`specs/sdui.json`) → texto. */
  readonly specs: ReadonlyMap<string, string>;
}

export type ReadZipResult =
  | { readonly ok: true; readonly files: ProjectFiles }
  | { readonly ok: false; readonly error: 'invalid-zip' | 'missing-mapping' };

/**
 * Lê um zip de projeto. Aceita o conteúdo na raiz ou dentro de uma pasta
 * (zip feito a partir de "meu-projeto/"): vale o `mapping.json` mais raso.
 */
export async function readProjectZip(data: Blob): Promise<ReadZipResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await data.arrayBuffer());
  } catch (e) {
    reportError('zip.read', e);
    return { ok: false, error: 'invalid-zip' };
  }
  const mappingPaths = Object.keys(zip.files)
    .filter((path) => !zip.files[path]?.dir)
    .filter((path) => path === MAPPING_FILE || path.endsWith(`/${MAPPING_FILE}`))
    .filter((path) => !path.startsWith('__MACOSX/'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  const mappingPath = mappingPaths[0];
  const mappingEntry = mappingPath ? zip.file(mappingPath) : null;
  if (!mappingPath || !mappingEntry) return { ok: false, error: 'missing-mapping' };
  const root = mappingPath.slice(0, -MAPPING_FILE.length);

  const images = new Map<string, Blob>();
  const prefix = `${root}${IMAGES_DIR}/`;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(prefix)) continue;
    const relative = path.slice(root.length);
    if (!isImageFileName(relative)) continue;
    const bytes = await entry.async('arraybuffer');
    images.set(relative, new Blob([bytes], { type: imageMimeType(relative) }));
  }
  const specs = new Map<string, string>();
  const specsPrefix = `${root}${SPECS_DIR}/`;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(specsPrefix)) continue;
    const relative = path.slice(root.length);
    if (isSpecPath(relative)) specs.set(relative, await entry.async('string'));
  }
  return {
    ok: true,
    files: { mapping: await mappingEntry.async('string'), images, specs },
  };
}

/** Gera o zip com `mapping.json`, `images/` e `specs/` na raiz. */
export async function writeProjectZip(files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip();
  zip.file(MAPPING_FILE, files.mapping);
  for (const [path, text] of files.specs) zip.file(path, text);
  for (const [path, blob] of files.images) {
    // Imagens já são comprimidas: guardar sem recomprimir é mais rápido.
    zip.file(path, await blob.arrayBuffer(), { compression: 'STORE' });
  }
  const bytes = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    platform: 'UNIX',
  });
  return new Blob([bytes], { type: 'application/zip' });
}

/** Nome de arquivo seguro para o zip exportado. */
export function zipFileName(projectName: string): string {
  const safe = [...projectName]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
    .replace(/^\.+/, '');
  return `${safe || 'projeto'}.zip`;
}
