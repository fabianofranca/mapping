import { NOTES_FILES, NOTES_LIBRARY, NOTES_SPEC_FILE } from '../../libraries/notas';
import {
  addContainer,
  applyBundledLibrary,
  loadSpecComponents,
  parseSpecText,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Projeto e catálogo com a biblioteca de notas embutida (tipo `nota`, flutuante) e uma foto I1.

export const NOTES_SPEC_ID = 'notas';

/** Projeto com a biblioteca de notas aplicada e uma imagem I1 de 1000 x 800. */
export function notesProject(): Project {
  const applied = applyBundledLibrary(emptyProject(), NOTES_LIBRARY, {
    newId: () => 'LN',
  });
  return addContainer(applied.project, {
    id: 'I1',
    file: 'images/tela.png',
    width: 1000,
    height: 800,
  });
}

/** O catálogo de componentes da biblioteca de notas. */
export function notesCatalog(): ComponentCatalog {
  const project = notesProject();
  const entry = project.specializations.find((s) => s.id === NOTES_SPEC_ID);
  if (!entry) throw new Error('sem a especialização de notas');
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const prefix = `specs/${NOTES_SPEC_ID}/`;
  const loaded = loadSpecComponents(parsed.spec, entry.file, entry.version, (path) =>
    NOTES_FILES.get(path.slice(prefix.length)),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[NOTES_SPEC_ID, loaded]]);
}
