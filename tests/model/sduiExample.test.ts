// The SDUI example at formatVersion 12 (stage #559, PD7): updating a project that applied SDUI
// v3 (onClick/onHold/onChange events) goes through the version contract, and the migrated links get
// the role through the `set-role` steps, without issues.
// pt-BR kept: shared fixture data (sdui example fields/layers, Material 3 node names) asserted by other dirs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  getAnnotationIssues,
  parseSpecText,
  setFieldValue,
  specWarnings,
  updateSpecialization,
  specializationUpdateImpact,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf, loadExample } from './specFixtures';

function loadV3(): Spec {
  const text = readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'sdui-v3.json'),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

function projectV3() {
  let p = applySpecialization(emptyProject(), loadV3(), { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 200, height: 200 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    name: 'Screen',
  });
  p = addTypedAnnotation(p, {
    id: 'B',
    markingId: 'M1',
    layerId: layerOf(p, 'sdui', 'componentes'),
    type: { specId: 'sdui', typeId: 'button' },
  });
  p = addTypedAnnotation(p, {
    id: 'E',
    markingId: 'M1',
    layerId: layerOf(p, 'sdui', 'eventos'),
    type: { specId: 'sdui', typeId: 'onClick' },
    parentAnnotationId: 'B',
  });
  return setFieldValue(p, 'E', 'acao', 'submit');
}

describe('exemplo SDUI v12', () => {
  it('validates without errors, without a long-list warning nor an unused group or repository warning', () => {
    const spec = loadExample('sdui');
    expect(spec.formatVersion).toBe(12);
    // The Screen has no `code` on purpose; the warning that matters here is the long-list one.
    const codes = specWarnings(spec).map((w) => w.code);
    expect(codes).toEqual(['type-without-code']);
  });

  it('the v3 → v4 contract covers swapping the events for action, feedback and validation', () => {
    const impact = specializationUpdateImpact(projectV3(), loadExample('sdui'));
    expect(impact.refused).toBe(false);
    expect(impact.missingMigrations).toEqual([]);
  });

  it('updating migrates the link type and gives the role (set-role), without issues', () => {
    const before = projectV3();
    expect(getAnnotationIssues(before, 'E').map((i) => i.code)).not.toContain(
      'missing-role',
    );
    const after = updateSpecialization(before, loadExample('sdui'), {
      newId: idGen('SN'),
    });
    const e = after.annotations.find((a) => a.id === 'E');
    expect(e?.type).toEqual({ specId: 'sdui', typeId: 'action' });
    expect(e?.parentAnnotationId).toBe('B');
    expect(e?.parentRole).toBe('click');
    expect(e?.values).toMatchObject({ acao: 'submit' });
    expect(getAnnotationIssues(after, 'E').map((i) => i.code)).not.toContain(
      'missing-role',
    );
  });
});

describe('papeis-migracao example (rename-role and remove-role)', () => {
  it('validates at formatVersion 12 and declares the three role steps', () => {
    const spec = loadExample('papeis-migracao');
    expect(spec.formatVersion).toBe(12);
    expect(specWarnings(spec)).toEqual([]);
    const ops = (spec.migrations ?? []).flatMap((m) => m.steps.map((s) => s.op));
    expect(ops).toEqual(['rename-role', 'remove-role', 'remove-role']);
  });
});
