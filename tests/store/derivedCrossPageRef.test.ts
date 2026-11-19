// A `ref` to an annotation on another page is not broken (stage #883, CL1, finding 6.2): the
// pending items resolve against the project with every page, but only those of the open page count.
import { computed, signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  createMarking,
  createPage,
  setFieldValue,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { projectInPerspective } from '../../src/store/perspectiveShown';
import { createEditorUi } from '../../src/store/ui';
import { world } from '../model/refAnnotationFixtures';
import { layerOf } from '../model/specFixtures';

function pagesWorld(): Project {
  let p = world();
  const pageOne = p.pages[0]!.id;
  p = createPage(p, { id: 'PG2', name: 'Flows' });
  p = addContainer(p, {
    id: 'I9',
    file: 'z.png',
    width: 500,
    height: 500,
    pageId: 'PG2',
  });
  p = createMarking(p, {
    id: 'M9',
    containerId: 'I9',
    rect: { x: 10, y: 10, width: 100, height: 100 },
  });
  p = addTypedAnnotation(p, {
    id: 'AT',
    markingId: 'M9',
    layerId: layerOf(p, 'rc', 'dados'),
    type: { specId: 'rc', typeId: 'modelo' },
  });
  p = setFieldValue(p, 'AT', 'titulo', 'Far');
  p = setFieldValue(p, 'AL', 'item', { annotationId: 'AT' });
  expect(pageOne).not.toBe('PG2');
  return p;
}

function setup(pageId: string) {
  const store = createProjectStore({ now: () => '2026-11-13T00:00:00.000Z' });
  store.load(pagesWorld());
  const shown = computed(() => projectInPerspective(store.committed.value, null, pageId));
  const across = computed(() => store.committed.value);
  const sources = { catalog: signal<ComponentCatalog>(new Map()), fontsEpoch: signal(0) };
  const derived = createEditorDerived(store, createEditorUi(), shown, sources, {
    threads: signal([]),
    copyId: null,
    identity: signal(null),
    project: across,
    pageId: signal(pageId),
  });
  return { derived };
}

const brokenOn = (derived: ReturnType<typeof setup>['derived'], id: string) =>
  (derived.issues.value.get(id) ?? []).filter((i) => i.code === 'broken-ref');

describe('derived: ref to an annotation on another page', () => {
  it('is not a pending item on the page of the referencing annotation', () => {
    const { derived } = setup('PG1');
    expect(brokenOn(derived, 'AL')).toEqual([]);
  });

  it('keeps the pending items of the open page only', () => {
    const { derived } = setup('PG1');
    expect([...derived.issues.value.keys()].every((id) => id !== 'AT')).toBe(true);
  });
});
