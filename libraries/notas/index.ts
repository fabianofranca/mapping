// A biblioteca de notas embutida no build (app e servidor MCP). A fonte da verdade é esta pasta:
// os arquivos são importados como texto (`?raw`), sem cópia. `tests/model/notesLibrary.test.ts`
// confere que o pacote é válido e que esta lista tem todo arquivo da pasta.
import notaComponent from './components/nota.json?raw';
import notaDoc from './docs/nota.md?raw';
import notasSpec from './notas.spec.json?raw';

/** Identificador da especialização (`notas.spec.json`). */
export const NOTES_ID = 'notas';
/** Arquivo da especialização, na raiz do pacote. */
export const NOTES_SPEC_FILE = 'notas.spec.json';

/** Os arquivos do pacote: caminho relativo à pasta do pacote → texto. */
export const NOTES_FILES: ReadonlyMap<string, string> = new Map([
  [NOTES_SPEC_FILE, notasSpec],
  ['components/nota.json', notaComponent],
  ['docs/nota.md', notaDoc],
]);

/** O pacote como `applyBundledLibrary` o lê (`src/model/bundledLibrary.ts`). */
export const NOTES_LIBRARY = {
  id: NOTES_ID,
  specFile: NOTES_SPEC_FILE,
  files: NOTES_FILES,
} as const;
