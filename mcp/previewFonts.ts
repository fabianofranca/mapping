import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project, ProjectSpecialization } from '../src/model';
import { resolvePath, type LoadedFont } from '../src/model/components/library';
import { MAX_FONT_BYTES } from './projects';
import { createFontBook, type FontBook } from './image/textMeasurer';
import { hasParentSegment, isWithin, resolveProjectFile, type Roots } from './paths';

// The font book of the `render_*` preview (stage #2928, decisions 1 to 3): the fonts of every specialization
// of the previewed project, read through a reader the caller gives (the batch's package files, the proposal
// folder, the project copy), so a library whose `fonts` are new or changed is measured and drawn before it is
// applied. It lives here, not in `loadFontBook` (`mcp/projects.ts`), which reads only the project folder.

/** Reads a project-relative path: the bytes, or `null` when the file is missing, unreadable or too large. */
export type FontReader = (path: string) => Promise<Uint8Array | null>;

/** The font book of a preview and the declared fonts it could not read. */
export interface PreviewFonts {
  readonly book: FontBook;
  readonly warnings: readonly string[];
}

const declaresFonts = (s: ProjectSpecialization): boolean =>
  (s.spec?.fonts?.length ?? 0) > 0;

/** The specializations the preview brings (new or changed) that declare `fonts`. */
export function broughtFontSpecs(
  disk: Project,
  previewed: Project,
): readonly ProjectSpecialization[] {
  const onDisk = new Map(disk.specializations.map((s) => [s.id, s]));
  return previewed.specializations.filter((s) => {
    if (!declaresFonts(s)) return false;
    const was = onDisk.get(s.id);
    return (
      was === undefined ||
      (was.spec !== s.spec && JSON.stringify(was.spec) !== JSON.stringify(s.spec))
    );
  });
}

const MAX_BOOKS = 8;
/** Least recently used last in iteration order of the `Map` (re-inserted on each hit). */
const books = new Map<string, FontBook>();

function remember(key: string, book: FontBook): void {
  books.set(key, book);
  while (books.size > MAX_BOOKS) {
    const oldest = books.keys().next();
    if (oldest.done === true) break;
    books.delete(oldest.value);
  }
}

function recall(key: string): FontBook | undefined {
  const book = books.get(key);
  if (book === undefined) return undefined;
  books.delete(key);
  books.set(key, book);
  return book;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

interface ReadFont {
  readonly font: LoadedFont;
  readonly key: string;
}

async function readFont(
  spec: ProjectSpecialization,
  entry: NonNullable<NonNullable<ProjectSpecialization['spec']>['fonts']>[number],
  read: FontReader,
  warnings: string[],
  warn: boolean,
): Promise<ReadFont | null> {
  const path = resolvePath(spec.file, entry.file);
  const bytes = await read(path);
  if (bytes === null || bytes.byteLength > MAX_FONT_BYTES) {
    if (warn) {
      warnings.push(
        `the font ${entry.file} of the library ${spec.id} could not be read: its text is drawn with the embedded font`,
      );
    }
    return null;
  }
  const weight = String(entry.weight ?? 400);
  const style = entry.style === 'italic' ? 'italic' : 'normal';
  return {
    font: {
      family: entry.family,
      weight,
      style,
      path,
      bytes: new Uint8Array(bytes).buffer as ArrayBuffer,
    },
    key: `${path}|${sha256(bytes)}|${entry.family}|${weight}|${style}`,
  };
}

/**
 * The font book of `project` (every specialization's `fonts`) read through `read`. A font that a
 * specialization in `brought` declares and the reader cannot give is a warning; the others are skipped silently,
 * as `loadFontBook` does. Books are cached by (path, SHA-256, family, weight, style), at most 8.
 */
export async function buildPreviewFonts(
  project: Project,
  read: FontReader,
  brought: readonly ProjectSpecialization[] = [],
): Promise<PreviewFonts> {
  const warnings: string[] = [];
  const files: ReadFont[] = [];
  for (const spec of project.specializations) {
    const warn = brought.some((b) => b.id === spec.id);
    for (const entry of spec.spec?.fonts ?? []) {
      const got = await readFont(spec, entry, read, warnings, warn);
      if (got !== null) files.push(got);
    }
  }
  const key = files.map((r) => r.key).join('\n');
  const cached = recall(key);
  if (cached !== undefined) return { book: cached, warnings };
  const book = createFontBook(files.map((r) => r.font));
  remember(key, book);
  return { book, warnings };
}

/**
 * Reads a file of a package folder as bytes, with the guards of `readPackageFile` (`mcp/library.ts`): inside
 * the folder and the roots, a regular file, at most `MAX_FONT_BYTES`; `null` otherwise.
 */
export async function readPackageBytes(
  roots: Roots,
  dir: string,
  path: string,
): Promise<Uint8Array | null> {
  if (
    path === '' ||
    path.includes('\0') ||
    path.includes('\\') ||
    hasParentSegment(path)
  ) {
    return null;
  }
  try {
    const real = await realpath(join(dir, path));
    const realDir = await realpath(dir).catch(() => dir);
    if (!isWithin(realDir, real) || (await roots.locate(real)) === null) return null;
    const info = await stat(real);
    if (!info.isFile() || info.size > MAX_FONT_BYTES) return null;
    return new Uint8Array(await readFile(real));
  } catch {
    return null;
  }
}

/** Reads a font of the project folder (`specs/<id>/…`) as bytes, through the confined project path; `null` if unreadable or too large. */
export async function readProjectBytes(
  roots: Roots,
  projectDir: string,
  path: string,
): Promise<Uint8Array | null> {
  const real = await resolveProjectFile(roots, projectDir, path);
  if (real === null) return null;
  try {
    if ((await stat(real)).size > MAX_FONT_BYTES) return null;
    return new Uint8Array(await readFile(real));
  } catch {
    return null;
  }
}
