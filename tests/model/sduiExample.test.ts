// O exemplo SDUI na formatVersion 12 (etapa #559, PD7): atualizar um projeto que aplicou o SDUI
// v3 (eventos onClick/onHold/onChange) passa pelo contrato de versão, e os vínculos migrados ganham
// o papel pelos passos `set-role`, sem pendência.
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
    name: 'Tela',
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
  it('valida sem erro, sem aviso de lista longa nem de grupo ou repositório sem uso', () => {
    const spec = loadExample('sdui');
    expect(spec.formatVersion).toBe(12);
    // O Screen não tem `code` de propósito; o aviso que importa aqui é o da lista longa.
    const codes = specWarnings(spec).map((w) => w.code);
    expect(codes).toEqual(['type-without-code']);
  });

  it('o contrato v3 → v4 cobre a troca dos eventos por ação, feedback e validação', () => {
    const impact = specializationUpdateImpact(projectV3(), loadExample('sdui'));
    expect(impact.refused).toBe(false);
    expect(impact.missingMigrations).toEqual([]);
  });

  it('atualizar migra o tipo do vínculo e dá o papel (set-role), sem pendência', () => {
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

describe('exemplo papeis-migracao (rename-role e remove-role)', () => {
  it('valida na formatVersion 12 e declara os três passos de papel', () => {
    const spec = loadExample('papeis-migracao');
    expect(spec.formatVersion).toBe(12);
    expect(specWarnings(spec)).toEqual([]);
    const ops = (spec.migrations ?? []).flatMap((m) => m.steps.map((s) => s.op));
    expect(ops).toEqual(['rename-role', 'remove-role', 'remove-role']);
  });
});
