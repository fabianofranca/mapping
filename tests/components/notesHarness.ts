import { NOTES_FILES, NOTES_SPEC_FILE } from '../../libraries/notas';
import { parseSpecText } from '../../src/model';
import { libraryHarness, type LibraryHarness } from './libraryHarness';

/** The floating `nota` type of the embedded notes library. */
export const NOTE = { specId: 'notas', typeId: 'nota' } as const;

/**
 * `libraryHarness` (Material 3 applied) with the notes library also applied: there are
 * common types (`m3-button`, `m3-column`) and the floating one (`nota`).
 */
export async function notesHarness(): Promise<LibraryHarness> {
  const harness = await libraryHarness();
  const parsed = parseSpecText(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const result = harness.actions.applySpecialization(parsed.spec, NOTES_FILES);
  if (!result.ok) throw new Error(`applying the notes failed: ${result.error}`);
  await harness.context.session.components.whenIdle();
  return harness;
}
