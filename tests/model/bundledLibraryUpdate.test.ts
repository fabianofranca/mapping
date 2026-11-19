// `bundledLibraryUpdate` (stage #2081, TX2): can a project with an older copy of the notes
// library move to the built-in version? The v4 copy is the spec of the `mcp-v0.43.0` tag.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTES_ID, NOTES_LIBRARY, NOTES_SPEC_FILE } from '../../libraries/notas';
import {
  addTypedAnnotation,
  applyBundledLibrary,
  applySpecialization,
  bundledLibraryUpdate,
  createMarking,
  getSpecialization,
  parseSpecText,
  setFieldValue,
  updateSpecialization,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

const v4Text = readFileSync(join(__dirname, 'fixtures', 'notas-v4.spec.json'), 'utf8');

function v4Project(): Project {
  const parsed = parseSpecText(v4Text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return applySpecialization(emptyProject(), parsed.spec, { newId: () => 'LN' });
}

describe('bundledLibraryUpdate', () => {
  it('update: notes at version 4 move to 5 with the spec and the package files', () => {
    const result = bundledLibraryUpdate(v4Project(), NOTES_LIBRARY);
    if (result.decision !== 'update') throw new Error(result.decision);
    expect(result.from).toBe(4);
    expect(result.to).toBe(5);
    expect(result.spec.version).toBe(5);
    expect(result.packageFiles.has(NOTES_SPEC_FILE)).toBe(false);
    expect(result.packageFiles.has('components/texto.json')).toBe(true);
  });

  it('not-newer: the library applied at version 5 changes nothing', () => {
    const { project } = applyBundledLibrary(emptyProject(), NOTES_LIBRARY);
    expect(bundledLibraryUpdate(project, NOTES_LIBRARY)).toEqual({
      decision: 'not-newer',
      from: 5,
    });
  });

  it('not-applied: a project without the library', () => {
    expect(bundledLibraryUpdate(emptyProject(), NOTES_LIBRARY)).toEqual({
      decision: 'not-applied',
    });
  });

  it('the result: updating brings the texto type and loses no annotation', () => {
    let p = v4Project();
    const layer = p.layers.find((l) => l.spec?.specId === NOTES_ID)!.id;
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: 0, y: 0, width: 240, height: 120 },
      floating: true,
    });
    p = addTypedAnnotation(p, {
      id: 'AN1',
      markingId: 'N1',
      layerId: layer,
      type: { specId: NOTES_ID, typeId: 'nota' },
    });
    p = setFieldValue(p, 'AN1', 'texto', 'Kept');
    const result = bundledLibraryUpdate(p, NOTES_LIBRARY);
    if (result.decision !== 'update') throw new Error(result.decision);
    const updated = updateSpecialization(p, result.spec);
    const entry = getSpecialization(updated, NOTES_ID);
    expect(entry?.version).toBe(5);
    const types = entry?.spec?.layers.flatMap((l) => l.annotationTypes.map((t) => t.id));
    expect(types).toContain('texto');
    expect(updated.annotations).toHaveLength(p.annotations.length);
    expect(updated.annotations.find((a) => a.id === 'AN1')?.values).toEqual(
      p.annotations.find((a) => a.id === 'AN1')?.values,
    );
  });
});
