import { NOTES_FILES, NOTES_SPEC_FILE } from '../../libraries/notas';
import { parseSpecText } from '../../src/model';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

/** Tipo `nota` (flutuante) da biblioteca de notas embutida. */
export const NOTE = { specId: 'notas', typeId: 'nota' } as const;

/**
 * `libraryHarness` (Material 3 aplicado) com a biblioteca de notas também aplicada: há tipos
 * comuns (`m3-button`, `m3-column`) e o flutuante (`nota`).
 */
export async function notesHarness(): Promise<LibraryHarness> {
  const harness = await libraryHarness();
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const result = harness.actions.applySpecialization(parsed.spec, NOTES_FILES);
  if (!result.ok) throw new Error(`aplicar as notas falhou: ${result.error}`);
  await harness.context.session.components.whenIdle();
  return harness;
}
