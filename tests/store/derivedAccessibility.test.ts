// Accessibility audit in the derived state (stage #1127, A2; decisions 8 and 13 of #1081):
// `accessible-label-missing` joins `derived.issues` (and the Incomplete count), `touch-target-small` goes
// to `derived.auditFindings` (marking → findings) and to the status bar count, never to the Incomplete
// count; the audit is a memoized `computed` that pan and zoom never call.
import { effect, signal } from '@preact/signals';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as model from '../../src/model';
import {
  addComponentMarking,
  approximateMeasurer,
  applySpecialization,
  addContainer,
  addTypedAnnotation,
  createMarking,
  parseSpec,
  setFieldValue,
  type Project,
} from '../../src/model';
import { createCanvasViewState } from '../../src/canvas/viewState';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { setMarkingDisplay, setShowComponentsOnPhotos } from '../../src/store/settings';
import { createEditorUi } from '../../src/store/ui';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';
import {
  A11Y_SPEC_ID,
  BIG,
  a11yCatalog,
  a11ySpec,
  a11yPut,
  a11yWorld,
} from '../model/accessibilityProject';

vi.mock('../../src/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/model')>();
  return { ...actual, accessibilityAudit: vi.fn(actual.accessibilityAudit) };
});

function setup(initial: Project, withCatalog = false) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  const actions = createProjectActions(store, {
    newId: idGen('N'),
    components: () => a11yCatalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  const derived = createEditorDerived(
    store,
    createEditorUi(),
    undefined,
    withCatalog ? { catalog: signal(a11yCatalog), fontsEpoch: signal(0) } : undefined,
  );
  return { store, actions, derived };
}

beforeEach(() => {
  setMarkingDisplay('all');
  setShowComponentsOnPhotos(false);
  vi.mocked(model.accessibilityAudit).mockClear();
});

describe('derived.issues: accessible-label-missing', () => {
  it('joins the pending item to the annotation and raises the Incomplete count; filling it clears it', () => {
    const p = a11yPut(a11yWorld(), 'button', 'A', BIG, { label: '' });
    const { derived, actions } = setup(p);
    expect(derived.issues.value.get('A')).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
    expect(derived.incompleteCount.value).toBe(1);
    actions.setFieldValue('A', 'label', 'Buy');
    expect(derived.issues.value.has('A')).toBe(false);
    expect(derived.incompleteCount.value).toBe(0);
  });

  it('names the part of a field part', () => {
    const p = a11yPut(a11yWorld(), 'bar', 'B', BIG, { actionIcon1: 'search' });
    const { derived } = setup(p);
    expect(derived.issues.value.get('B')).toEqual([
      {
        code: 'accessible-label-missing',
        key: 'actionIcon1Description',
        part: { id: 'action1', name: 'First action' },
      },
    ]);
  });

  it('the action part is skipped when a child fills the slot, and the child answers for itself', () => {
    let p = applySpecialization(emptyProject(), a11ySpec, { newId: idGen('AY') });
    p = addContainer(p, {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    });
    const add = (q: Project, id: string, typeId: string, extra = {}) =>
      addComponentMarking(
        q,
        a11yCatalog,
        {
          markingId: `M_${id}`,
          annotationId: id,
          containerId: 'I1',
          parentId: null,
          specId: A11Y_SPEC_ID,
          typeId,
          ...extra,
        },
        approximateMeasurer,
      );
    p = add(p, 'B', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
    p = setFieldValue(p, 'B', 'actionIcon1', 'search');
    // Without a child the parts are audited (the drawing exists, nothing is inactive).
    const alone = setup(p, true).derived.issues.value.get('B') ?? [];
    expect(alone.map((i) => i.part?.id)).toContain('action1');
    // With an `icon-button` in the slot the field draws nothing: the part is skipped.
    p = add(p, 'C', 'icon-button', { parentId: 'M_B', slot: 'actions' });
    p = setFieldValue(p, 'C', 'contentDescription', '');
    const { derived } = setup(p, true);
    expect(
      derived.componentScenes.value.get('M_B')?.inactiveFields.has('actionIcon1'),
    ).toBe(true);
    expect(derived.issues.value.get('B')).toBeUndefined();
    expect(derived.issues.value.get('C')).toEqual([
      { code: 'accessible-label-missing', key: 'contentDescription' },
    ]);
  });

  it('keeps the same map while nothing changes, and a part that changes is a new map', () => {
    const p = a11yPut(a11yWorld(), 'bar', 'B', BIG, { actionIcon1: 'search' });
    const { derived, actions } = setup(p);
    const before = derived.issues.value;
    actions.setFieldValue('B', 'title', 'Another title');
    expect(derived.issues.value).toBe(before);
    actions.setFieldValue('B', 'actionIcon1Description', 'Search');
    expect(derived.issues.value.has('B')).toBe(false);
  });

  it('compares the part: the same code and field of another part is another issue', () => {
    const parsed = parseSpec({
      format: 'mapping-spec',
      formatVersion: 18,
      id: 'two',
      name: 'Two',
      version: 1,
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#112233',
          annotationTypes: [
            {
              id: 'bar',
              name: 'Bar',
              fields: ['f1', 'f2', 'desc'].map((key) => ({ key, type: 'string' })),
              accessibility: {
                parts: [
                  { id: 'p1', when: 'f1', label: { fields: ['desc'] } },
                  { id: 'p2', when: 'f2', label: { fields: ['desc'] } },
                ],
              },
            },
          ],
        },
      ],
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    let p = applySpecialization(emptyProject(), parsed.spec, { newId: idGen('TW') });
    p = addContainer(p, {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    });
    p = createMarking(p, { id: 'M', containerId: 'I1', rect: BIG, name: 'M' });
    p = addTypedAnnotation(p, {
      id: 'A',
      markingId: 'M',
      layerId: layerOf(p, 'two', 'ui'),
      type: { specId: 'two', typeId: 'bar' },
    });
    p = setFieldValue(p, 'A', 'f1', 'x');
    const { derived, actions } = setup(p);
    expect(derived.issues.value.get('A')?.map((i) => i.part?.id)).toEqual(['p1']);
    actions.setFieldValue('A', 'f1', '');
    actions.setFieldValue('A', 'f2', 'y');
    expect(derived.issues.value.get('A')?.map((i) => i.part?.id)).toEqual(['p2']);
  });
});

describe('derived.auditFindings and the counts', () => {
  const small = { x: 0, y: 0, width: 108, height: 120 };

  it('touch-target-small goes to auditFindings (by marking), not to the issues or the Incomplete count', () => {
    const p = a11yPut(a11yWorld(3), 'button', 'A', small, { label: 'Buy' });
    const { derived } = setup(p);
    expect(derived.issues.value.has('A')).toBe(false);
    expect(derived.incompleteCount.value).toBe(0);
    const findings = derived.auditFindings.value.get('M_A');
    expect(findings).toHaveLength(1);
    expect(findings?.[0]).toMatchObject({
      code: 'touch-target-small',
      annotationId: 'A',
      markingId: 'M_A',
      actual: { width: 36, height: 40 },
      min: { width: 44, height: 44 },
      minPx: { width: 132, height: 132 },
      density: 3,
    });
  });

  it('the status bar count adds the annotations with touch-target-small, once per annotation', () => {
    let p = a11yWorld(3);
    p = a11yPut(p, 'button', 'A', small, { label: 'Buy' });
    p = a11yPut(
      p,
      'button',
      'B',
      { x: 200, y: 0, width: 108, height: 120 },
      { label: '' },
    );
    p = a11yPut(
      p,
      'button',
      'C',
      { x: 400, y: 0, width: 300, height: 300 },
      { label: 'Big' },
    );
    const { derived, actions } = setup(p);
    expect(derived.auditedCount.value).toBe(2);
    // B has both the pending item and the warning: still one annotation, and only the pending one is incomplete.
    expect(derived.incompleteCount.value).toBe(1);
    actions.setFieldValue('B', 'label', 'Sell');
    expect(derived.auditedCount.value).toBe(2);
    expect(derived.incompleteCount.value).toBe(0);
  });

  it('the count is the annotations with a touch-target-small warning', () => {
    const p = a11yPut(a11yWorld(3), 'button', 'A', small, { label: 'Buy' });
    const { derived } = setup(p);
    expect(derived.auditedCount.value).toBe(1);
    expect(derived.auditList.value).toHaveLength(1);
    expect(derived.auditedCount.value).toBe(derived.auditList.value.length);
  });

  it('keeps the same map while the findings do not change', () => {
    const p = a11yPut(a11yWorld(3), 'button', 'A', small, { label: 'Buy' });
    const { derived, actions } = setup(p);
    const before = derived.auditFindings.value;
    actions.setFieldValue('A', 'label', 'Sell');
    expect(derived.auditFindings.value).toBe(before);
    actions.setMarkingRect('M_A', { x: 0, y: 0, width: 132, height: 132 });
    expect(derived.auditFindings.value.size).toBe(0);
  });
});

describe('the audit costs nothing in pan and zoom', () => {
  it('20 frames of pan and zoom make 0 calls to the audit; an edit audits the project once', () => {
    const p = a11yPut(
      a11yWorld(3),
      'button',
      'A',
      { x: 0, y: 0, width: 108, height: 120 },
      {
        label: '',
      },
    );
    const { derived, actions } = setup(p);
    const view = createCanvasViewState();
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(
        derived.issues.value.size +
          derived.auditFindings.value.size +
          derived.incompleteCount.value +
          derived.auditedCount.value,
      );
    });
    const audit = vi.mocked(model.accessibilityAudit);
    // First read: one audit, shared by the issues, the findings and the counts.
    expect(audit).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame < 20; frame += 1) {
      view.viewport.value = { x: frame * 3, y: frame * 2, scale: 1 + frame / 10 };
    }
    expect(audit).toHaveBeenCalledTimes(1);
    actions.setFieldValue('A', 'label', 'Buy');
    expect(audit).toHaveBeenCalledTimes(2);
    stop();
  });
});
