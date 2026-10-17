import JSZip from 'jszip';
import { PROPOSALS_DIR } from '../model';
import {
  IMAGES_DIR,
  MAPPING_FILE,
  SPECS_DIR,
  imageMimeType,
  isImageFileName,
  isProposalFilePath,
  isProposalImagePath,
  isSpecPackagePath,
  isSpecPath,
} from './types';
import { reportError } from '../utils/report';

/** Conteúdo de um projeto em memória, no formato da pasta (ver docs/history/PLAN-etapas-1-2.md 5.1 e 13.3). */
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
  /** Imagens aguardando a aceitação de uma proposta: `proposals/<id>/images/…` → conteúdo. */
  readonly proposalImages: ReadonlyMap<string, Blob>;
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
  const specAssets = new Map<string, Blob>();
  const specsPrefix = `${root}${SPECS_DIR}/`;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(specsPrefix)) continue;
    const relative = path.slice(root.length);
    // Todo `.json` de `specs/` entra em `specs` (a leitura do projeto precisa do texto das
    // especializações, inclusive a de dentro do pacote); o que está em pasta de pacote entra
    // também em `specAssets`, com os bytes.
    if (isSpecPath(relative)) specs.set(relative, await entry.async('string'));
    if (isSpecPackagePath(relative)) {
      specAssets.set(relative, new Blob([await entry.async('arraybuffer')]));
    }
  }
  const proposals = new Map<string, string>();
  const proposalImages = new Map<string, Blob>();
  const proposalsPrefix = `${root}${PROPOSALS_DIR}/`;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(proposalsPrefix)) continue;
    const relative = path.slice(root.length);
    if (isProposalFilePath(relative)) {
      proposals.set(relative, await entry.async('string'));
    } else if (isProposalImagePath(relative)) {
      const bytes = await entry.async('arraybuffer');
      proposalImages.set(relative, new Blob([bytes], { type: imageMimeType(relative) }));
    }
  }
  return {
    ok: true,
    files: {
      mapping: await mappingEntry.async('string'),
      images,
      specs,
      ...(specAssets.size > 0 ? { specAssets } : {}),
      proposals,
      proposalImages,
    },
  };
}

/** Gera o zip com `mapping.json`, `images/`, `specs/` e `proposals/` na raiz. */
export async function writeProjectZip(files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip();
  zip.file(MAPPING_FILE, files.mapping);
  for (const [path, blob] of files.specAssets ?? []) {
    zip.file(path, await blob.arrayBuffer());
  }
  for (const [path, text] of files.specs) zip.file(path, text);
  for (const [path, text] of files.proposals) zip.file(path, text);
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

/** Nome de arquivo seguro para o zip exportado. */
export function zipFileName(projectName: string): string {
  const safe = [...projectName]
    .map((c) => (c < ' ' || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
    .replace(/^\.+/, '');
  return `${safe || 'projeto'}.zip`;
}
