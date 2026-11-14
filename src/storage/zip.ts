import JSZip from 'jszip';
import { COMMENTS_DIR, PROPOSALS_DIR } from '../model';
import {
  IMAGES_DIR,
  MAPPING_FILE,
  SPECS_DIR,
  imageMimeType,
  isImageFileName,
  isProposalFilePath,
  isProposalImagePath,
  isProposalPackagePath,
  isSpecPackagePath,
  isSpecPath,
  isThreadFilePath,
} from './types';
import { reportError } from '../utils/report';

/** Contents of a project in memory, in the folder format (see docs/FORMAT.md). */
export interface ProjectFiles {
  readonly mapping: string;
  /** Relative path (`images/photo.jpg`) → contents. */
  readonly images: ReadonlyMap<string, Blob>;
  /** Copies of the specializations: relative path (`specs/sdui.json`) → text. */
  readonly specs: ReadonlyMap<string, string>;
  /**
   * The other files of the library packages (`specs/<id>/components/a.json`,
   * `specs/<id>/fonts/Roboto.ttf`…): relative path → bytes, preserved. The package's
   * specialization file (and any `.json` in `specs/`) also goes in `specs` (text), and
   * when writing, `specs` prevails. Absent = none.
   */
  readonly specAssets?: ReadonlyMap<string, Blob>;
  /** Change proposals: `proposals/<id>/proposal.json` → text (as is, not validated). */
  readonly proposals: ReadonlyMap<string, string>;
  /**
   * Files waiting for a proposal to be accepted: images (`proposals/<id>/images/…`) and
   * library packages (`proposals/<id>/specs/<folder>/…`) → contents.
   */
  readonly proposalImages: ReadonlyMap<string, Blob>;
  /**
   * Threads: `comments/<id>.json` and `comments/resolved/<id>.json` → text (as is, not
   * validated; that of an invalid file comes back identical). Absent = none.
   */
  readonly threads?: ReadonlyMap<string, string>;
}

export type ReadZipResult =
  | { readonly ok: true; readonly files: ProjectFiles }
  | { readonly ok: false; readonly error: 'invalid-zip' | 'missing-mapping' };

async function imageBlob(entry: JSZip.JSZipObject, relative: string): Promise<Blob> {
  return new Blob([await entry.async('arraybuffer')], { type: imageMimeType(relative) });
}

/**
 * Reads, in parallel, the zip files under `<root><dir>/`. `read` receives the path relative to
 * the project root and returns `null` for what is not of interest; the result keeps the zip order.
 */
async function readUnder<T>(
  zip: JSZip,
  root: string,
  dir: string,
  read: (relative: string, entry: JSZip.JSZipObject) => Promise<T | null>,
): Promise<T[]> {
  const prefix = `${root}${dir}/`;
  const rows = await Promise.all(
    Object.entries(zip.files)
      .filter(([path, entry]) => !entry.dir && path.startsWith(prefix))
      .map(([path, entry]) => read(path.slice(root.length), entry)),
  );
  return rows.filter((row): row is Awaited<T> => row !== null);
}

type JSZipEntry = JSZip.JSZipObject;

async function readSpecRow(relative: string, entry: JSZipEntry) {
  return {
    relative,
    // Every `.json` in `specs/` goes into `specs` (reading the project needs the text of the
    // specializations, including the one inside the package); what is in a package folder also
    // goes into `specAssets`, with the bytes.
    text: isSpecPath(relative) ? await entry.async('string') : null,
    asset: isSpecPackagePath(relative)
      ? new Blob([await entry.async('arraybuffer')])
      : null,
  };
}

async function readProposalRow(relative: string, entry: JSZipEntry) {
  if (isProposalFilePath(relative)) {
    return { relative, text: await entry.async('string'), image: null };
  }
  if (isProposalImagePath(relative)) {
    return { relative, text: null, image: await imageBlob(entry, relative) };
  }
  if (!isProposalPackagePath(relative)) return null;
  return { relative, text: null, image: new Blob([await entry.async('arraybuffer')]) };
}

/** The shallowest `mapping.json` in the zip (ignores `__MACOSX/`), with the folder it is in. */
function findMapping(
  zip: JSZip,
): { mappingPath: string; mappingEntry: JSZipEntry } | null {
  const mappingPath = Object.keys(zip.files)
    .filter((path) => !zip.files[path]?.dir)
    .filter((path) => path === MAPPING_FILE || path.endsWith(`/${MAPPING_FILE}`))
    .filter((path) => !path.startsWith('__MACOSX/'))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  const mappingEntry = mappingPath ? zip.file(mappingPath) : null;
  return mappingPath && mappingEntry ? { mappingPath, mappingEntry } : null;
}

/**
 * Reads a project zip. Accepts the contents at the root or inside a folder
 * (zip made from "my-project/"): the shallowest `mapping.json` wins.
 */
export async function readProjectZip(data: Blob): Promise<ReadZipResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await data.arrayBuffer());
  } catch (e) {
    reportError('zip.read', e);
    return { ok: false, error: 'invalid-zip' };
  }
  const found = findMapping(zip);
  if (!found) return { ok: false, error: 'missing-mapping' };
  const { mappingPath, mappingEntry } = found;
  const root = mappingPath.slice(0, -MAPPING_FILE.length);

  const [imageRows, specRows, proposalRows, threadRows] = await Promise.all([
    readUnder(zip, root, IMAGES_DIR, async (relative, entry) =>
      isImageFileName(relative)
        ? ([relative, await imageBlob(entry, relative)] as const)
        : null,
    ),
    readUnder(zip, root, SPECS_DIR, readSpecRow),
    readUnder(zip, root, PROPOSALS_DIR, readProposalRow),
    readUnder(zip, root, COMMENTS_DIR, async (relative, entry) =>
      isThreadFilePath(relative)
        ? ([relative, await entry.async('string')] as const)
        : null,
    ),
  ]);
  const images = new Map(imageRows);
  const specs = new Map<string, string>();
  const specAssets = new Map<string, Blob>();
  for (const { relative, text, asset } of specRows) {
    if (text !== null) specs.set(relative, text);
    if (asset !== null) specAssets.set(relative, asset);
  }
  const proposals = new Map<string, string>();
  const proposalImages = new Map<string, Blob>();
  for (const { relative, text, image } of proposalRows) {
    if (text !== null) proposals.set(relative, text);
    if (image !== null) proposalImages.set(relative, image);
  }
  const threads = new Map(threadRows);
  return {
    ok: true,
    files: {
      mapping: await mappingEntry.async('string'),
      images,
      specs,
      ...(specAssets.size > 0 ? { specAssets } : {}),
      proposals,
      proposalImages,
      threads,
    },
  };
}

/** Produces the zip with `mapping.json`, `images/`, `specs/`, `proposals/`, `comments/` at the root. */
export async function writeProjectZip(files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip();
  zip.file(MAPPING_FILE, files.mapping);
  for (const [path, blob] of files.specAssets ?? []) {
    zip.file(path, await blob.arrayBuffer());
  }
  for (const [path, text] of files.specs) zip.file(path, text);
  for (const [path, text] of files.proposals) zip.file(path, text);
  for (const [path, text] of files.threads ?? []) zip.file(path, text);
  for (const [path, blob] of [...files.images, ...files.proposalImages]) {
    // Images are already compressed: storing without recompressing is faster.
    zip.file(path, await blob.arrayBuffer(), { compression: 'STORE' });
  }
  const bytes = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    platform: 'UNIX',
  });
  return new Blob([bytes], { type: 'application/zip' });
}

/** Safe file name for the exported zip; `fallback` is the name when the project's is empty. */
export function zipFileName(projectName: string, fallback: string): string {
  const safe = [...projectName]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
    .replace(/^\.+/, '');
  return `${safe || fallback}.zip`;
}
