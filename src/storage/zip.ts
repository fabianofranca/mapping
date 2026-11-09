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

/** Conteúdo de um projeto em memória, no formato da pasta (ver docs/FORMAT.md). */
export interface ProjectFiles {
  readonly mapping: string;
  /** Caminho relativo (`images/foto.jpg`) → conteúdo. */
  readonly images: ReadonlyMap<string, Blob>;
  /** Cópias das especializações: caminho relativo (`specs/sdui.json`) → texto. */
  readonly specs: ReadonlyMap<string, string>;
  /**
   * Os demais arquivos dos pacotes da biblioteca (`specs/<id>/components/a.json`,
   * `specs/<id>/fonts/Roboto.ttf`…): caminho relativo → bytes, preservados. O arquivo da
   * especialização do pacote (e qualquer `.json` de `specs/`) vai também em `specs` (texto), e
   * ao gravar `specs` prevalece. Ausente = nenhum.
   */
  readonly specAssets?: ReadonlyMap<string, Blob>;
  /** Propostas de alteração: `proposals/<id>/proposal.json` → texto (como está, sem validar). */
  readonly proposals: ReadonlyMap<string, string>;
  /**
   * Arquivos que esperam a aceitação de uma proposta: imagens (`proposals/<id>/images/…`) e
   * pacotes de biblioteca (`proposals/<id>/specs/<pasta>/…`) → conteúdo.
   */
  readonly proposalImages: ReadonlyMap<string, Blob>;
  /**
   * Conversas: `comments/<id>.json` e `comments/resolved/<id>.json` → texto (como está, sem
   * validar; o de um arquivo inválido volta idêntico). Ausente = nenhuma.
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
 * Lê, em paralelo, os arquivos de `<root><dir>/` do zip. `read` recebe o caminho relativo à
 * raiz do projeto e devolve `null` para o que não interessa; o resultado mantém a ordem do zip.
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
    // Todo `.json` de `specs/` entra em `specs` (a leitura do projeto precisa do texto das
    // especializações, inclusive a de dentro do pacote); o que está em pasta de pacote entra
    // também em `specAssets`, com os bytes.
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

/** O `mapping.json` mais raso do zip (ignora `__MACOSX/`), com a pasta onde ele está. */
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

/** Gera o zip com `mapping.json`, `images/`, `specs/`, `proposals/` e `comments/` na raiz. */
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

/** Nome de arquivo seguro para o zip exportado; `fallback` é o nome quando o do projeto é vazio. */
export function zipFileName(projectName: string, fallback: string): string {
  const safe = [...projectName]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
    .replace(/^\.+/, '');
  return `${safe || fallback}.zip`;
}
