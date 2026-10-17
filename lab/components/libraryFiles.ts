// Laboratório "Componentes": leitura de arquivos no navegador (`File`, `showDirectoryPicker`).
// A parte pura da biblioteca mora em `src/model/components/library.ts`.
import { isFontPath, type TextFile } from '../../src/model/components/library';

// ---------------------------------------------------------------------------------------
// Fontes de arquivos (navegador)
// ---------------------------------------------------------------------------------------

/** `<input type="file" multiple webkitdirectory>` ou arquivos soltos: usa o caminho relativo se houver. */
export async function readFileList(files: ArrayLike<File>): Promise<TextFile[]> {
  const out: TextFile[] = [];
  for (const file of Array.from(files)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const path = relative && relative !== '' ? stripRoot(relative) : file.name;
    if (isFontPath(path)) out.push({ path, bytes: await file.arrayBuffer() });
    else if (path.toLowerCase().endsWith('.json'))
      out.push({ path, text: await file.text() });
  }
  return out;
}

/** O `webkitRelativePath` começa pelo nome da pasta escolhida: tira-o para os caminhos ficarem relativos a ela. */
function stripRoot(path: string): string {
  const slash = path.indexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}
interface DirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}

/** Lê os `.json` e as fontes de uma pasta (recursivo, até 4 níveis, ignorando pastas ocultas e `node_modules`). */
export async function readDirectory(
  dir: DirectoryHandleLike,
  prefix = '',
  depth = 0,
): Promise<TextFile[]> {
  const out: TextFile[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      const path = `${prefix}${entry.name}`;
      if (isFontPath(path)) {
        const file = await entry.getFile();
        out.push({ path, bytes: await file.arrayBuffer() });
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      const file = await entry.getFile();
      out.push({ path, text: await file.text() });
    } else if (
      depth < 4 &&
      !entry.name.startsWith('.') &&
      entry.name !== 'node_modules'
    ) {
      out.push(...(await readDirectory(entry, `${prefix}${entry.name}/`, depth + 1)));
    }
  }
  return out;
}

/** `showDirectoryPicker`, quando existe (Chrome/Edge em https ou file://). */
export async function pickDirectory(): Promise<TextFile[] | undefined> {
  const picker: unknown = Reflect.get(globalThis, 'showDirectoryPicker');
  if (typeof picker !== 'function') return undefined;
  const handle = (await (
    picker as () => Promise<DirectoryHandleLike>
  )()) as DirectoryHandleLike;
  return readDirectory(handle);
}
