// The notes library embedded in the build (app and MCP server). The source of truth is this folder:
// the files are imported as text (`?raw`), with no copy. `tests/model/notesLibrary.test.ts`
// checks that the package is valid and that this list has every file in the folder.
import colcheteComponent from './components/colchete.json?raw';
import linhaComponent from './components/linha.json?raw';
import moldurasComponent from './components/moldura.json?raw';
import notaComponent from './components/nota.json?raw';
import textoComponent from './components/texto.json?raw';
import colcheteDoc from './docs/colchete.md?raw';
import linhaDoc from './docs/linha.md?raw';
import moldurasDoc from './docs/moldura.md?raw';
import notaDoc from './docs/nota.md?raw';
import textoDoc from './docs/texto.md?raw';
import notasSpec from './notas.spec.json?raw';

/** Identifier of the specialization (`notas.spec.json`). */
export const NOTES_ID = 'notas';
/** The specialization file, at the package root. */
export const NOTES_SPEC_FILE = 'notas.spec.json';

/** The package files: path relative to the package folder → text. */
export const NOTES_FILES: ReadonlyMap<string, string> = new Map([
  [NOTES_SPEC_FILE, notasSpec],
  ['components/nota.json', notaComponent],
  ['docs/nota.md', notaDoc],
  ['components/texto.json', textoComponent],
  ['docs/texto.md', textoDoc],
  ['components/moldura.json', moldurasComponent],
  ['docs/moldura.md', moldurasDoc],
  ['components/colchete.json', colcheteComponent],
  ['docs/colchete.md', colcheteDoc],
  ['components/linha.json', linhaComponent],
  ['docs/linha.md', linhaDoc],
]);

/** The package as `applyBundledLibrary` reads it (`src/model/bundledLibrary.ts`). */
export const NOTES_LIBRARY = {
  id: NOTES_ID,
  specFile: NOTES_SPEC_FILE,
  files: NOTES_FILES,
} as const;
