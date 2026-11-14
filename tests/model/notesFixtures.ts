import { NOTES_FILES, NOTES_LIBRARY, NOTES_SPEC_FILE } from '../../libraries/notas';
import {
  addContainer,
  addTypedAnnotation,
  applyBundledLibrary,
  createMarking,
  loadSpecComponents,
  parseSpecText,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Project and catalog with the bundled notes library (type `nota`, floating) and a photo I1.
// pt-BR kept: shared fixture data asserted by tests/model, tests/components, tests/ui and tests/store: the spec id 'notas', the type id 'nota' and the file name 'images/tela.png'

export const NOTES_SPEC_ID = 'notas';

/** Project with the notes library applied and an I1 image of 1000 x 800. */
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

/** The component catalog of the notes library. */
export function notesCatalog(): ComponentCatalog {
  const project = notesProject();
  const entry = project.specializations.find((s) => s.id === NOTES_SPEC_ID);
  if (!entry) throw new Error('missing the notes specialization');
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const prefix = `specs/${NOTES_SPEC_ID}/`;
  const loaded = loadSpecComponents(parsed.spec, entry.file, entry.version, (path) =>
    NOTES_FILES.get(path.slice(prefix.length)),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[NOTES_SPEC_ID, loaded]]);
}

/**
 * `base` with the notes library applied and a Note instance `id` without a name (floating,
 * as the Palette creates it): its label is the type name, "Nota".
 */
export function withNoteInstance(base: Project, id = 'N1'): Project {
  const applied = applyBundledLibrary(base, NOTES_LIBRARY, { newId: () => 'LN' });
  const marked = createMarking(applied.project, {
    id,
    containerId: null,
    rect: { x: 0, y: 0, width: 240, height: 120 },
    floating: true,
  });
  return addTypedAnnotation(marked, {
    id: `A-${id}`,
    markingId: id,
    layerId: 'LN',
    type: { specId: NOTES_SPEC_ID, typeId: 'nota' },
  });
}
