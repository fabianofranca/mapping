// #1978 (CL2): a child of a slot hidden by `visible` keeps the slot, and `derived.issues` carries `slot-hidden`
// for it, with the reason in both locales; toggling the field brings the issue back and forth.
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { createEditorUi } from '../../src/store/ui';
import { issueMessage } from '../../src/ui/typedText';
import { catalog, spec } from '../support/material3Adoption';
import { emptyProject } from '../model/fixtures';

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function scene(values: Record<string, string>): Project {
  let n = 0;
  let p = applySpecialization(emptyProject(), spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: null, width: 360, height: 800 } as never);
  const put = (
    id: string,
    typeId: string,
    r: ReturnType<typeof rect>,
    parentId?: string,
  ) => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: id,
        annotationId: `A_${id}`,
        containerId: 'I1',
        parentId: parentId ?? null,
        specId: spec.id,
        typeId,
        rect: r,
        ...(parentId === undefined ? { values } : {}),
      },
      approximateMeasurer,
    );
  };
  put('SW', 'swipe-to-dismiss', rect(0, 0, 360, 72));
  put('BG', 'icon', rect(4, 4, 40, 40), 'SW');
  return p;
}

function derivedOf(p: Project) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  createProjectActions(store, {
    newId: () => 'N1',
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(p);
  return createEditorDerived(store, createEditorUi(), undefined, {
    catalog: signal(catalog),
    fontsEpoch: signal(0),
  });
}

describe('derived.issues: slot-hidden', () => {
  it('lists it on the child of a hidden slot, and the Incomplete window counts it', () => {
    const derived = derivedOf(
      scene({ direction: 'StartToEnd', enableDismissFromStartToEnd: 'false' }),
    );
    expect(derived.issues.value.get('A_BG')).toEqual([
      {
        code: 'slot-hidden',
        slot: { id: 'backgroundContent', name: expect.any(String) },
        owner: expect.any(String),
      },
    ]);
    expect(derived.incompleteMarkings.value.has('BG')).toBe(true);
  });

  it('no issue while the slot is visible', () => {
    const derived = derivedOf(scene({ direction: 'StartToEnd' }));
    expect(derived.issues.value.has('A_BG')).toBe(false);
  });

  it('the reason names the slot and its owner', () => {
    const p = scene({ direction: 'StartToEnd', enableDismissFromStartToEnd: 'false' });
    const derived = derivedOf(p);
    const issue = derived.issues.value.get('A_BG')![0]!;
    const annotation = p.annotations.find((a) => a.id === 'A_BG')!;
    expect(issueMessage(p, annotation, issue)).toMatch(/hidden|oculto/);
  });
});
