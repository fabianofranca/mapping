// Named slots (#1080, SL4, decision 7): `derived.issues` joins the drawing cache's `slotIssues` (the
// `slot-not-accepted` and `slot-full` of the children) to the model's issues, like `component-overflow`:
// the Incomplete window and the list read them, and an edit that changes nothing keeps the same map.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signal } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { setMarkingDisplay, setShowComponentsOnPhotos } from '../../src/store/settings';
import { createEditorUi } from '../../src/store/ui';
import { issueMessage } from '../../src/ui/typedText';
import { emptyProject } from '../model/fixtures';

const DIR = 'tests/fixtures/slots';
const SPEC_ID = 'slots';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

const spec = (() => {
  const parsed = parseSpec(JSON.parse(read('slots.spec.json')));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
})();

const catalog: ComponentCatalog = (() => {
  const texts = new Map(
    ['bar', 'pin', 'rounded-bar'].map((id) => [
      `specs/slots/components/${id}.json`,
      read(`components/${id}.json`),
    ]),
  );
  const loaded = loadSpecComponents(spec, 'specs/slots/slots.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

function add(
  p: Project,
  id: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId,
      ...extra,
    },
    approximateMeasurer,
  );
}

/** A bar with a `rounded-bar` in `navigationIcon` (not accepted) and four pins in `actions` (max 3). */
function crowdedBar(): Project {
  let n = 0;
  let p = applySpecialization(emptyProject(), spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'slots.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 });
  p = add(p, 'B', 'bar', { rect: { x: 100, y: 100, width: 360, height: 56 } });
  p = add(p, 'R', 'rounded-bar', {
    parentId: 'B',
    slot: 'navigationIcon',
    rect: { x: 108, y: 108, width: 24, height: 24 },
  });
  for (const id of ['P1', 'P2', 'P3', 'P4'])
    p = add(p, id, 'pin', { parentId: 'B', slot: 'actions' });
  return p;
}

function setup(initial: Project = crowdedBar()) {
  const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
  const actions = createProjectActions(store, {
    newId: (() => {
      let n = 0;
      return () => `N${++n}`;
    })(),
    components: () => catalog,
    measure: () => approximateMeasurer,
  });
  store.load(initial);
  const derived = createEditorDerived(store, createEditorUi(), undefined, {
    catalog: signal(catalog),
    fontsEpoch: signal(0),
  });
  return { store, actions, derived };
}

beforeEach(() => {
  setMarkingDisplay('all');
  setShowComponentsOnPhotos(false);
});

describe('derived.issues: slot-not-accepted and slot-full', () => {
  it('lists both on the annotation of the child, with the slot, the owner and the max', () => {
    const { derived } = setup();
    expect(derived.issues.value.get('A_P4')).toEqual([
      {
        code: 'slot-full',
        slot: { id: 'actions', name: 'Actions' },
        owner: 'Bar',
        max: 3,
      },
    ]);
    expect(derived.issues.value.get('A_R')).toEqual([
      {
        code: 'slot-not-accepted',
        slot: { id: 'navigationIcon', name: 'Navigation icon' },
        owner: 'Bar',
      },
    ]);
    expect(derived.issues.value.has('A_P3')).toBe(false);
  });

  it('the Incomplete window counts them and the list shows them', () => {
    const { derived } = setup();
    expect(derived.incompleteMarkings.value.has('P4')).toBe(true);
    expect(derived.incompleteMarkings.value.has('R')).toBe(true);
    expect(derived.incompleteMarkings.value.has('P3')).toBe(false);
    expect(derived.incompleteList.value.length).toBeGreaterThan(0);
  });

  it('keeps the same map when an edit does not touch the issues', () => {
    const { derived, actions } = setup();
    const before = derived.issues.value;
    actions.renameProject('Another name');
    expect(derived.issues.value).toBe(before);
  });

  it('goes away when the child is removed', () => {
    const { derived, actions } = setup();
    actions.removeMarking('P4');
    expect(derived.issues.value.has('A_P4')).toBe(false);
    expect(derived.incompleteMarkings.value.has('P4')).toBe(false);
    expect(derived.incompleteMarkings.value.has('R')).toBe(true);
  });

  it('the pending item has a text with the slot name, the owner type and the max', () => {
    const { derived, store } = setup();
    const p = store.project.value as Project;
    const annotation = (id: string) => p.annotations.find((a) => a.id === id)!;
    const full = derived.issues.value.get('A_P4')![0]!;
    const refused = derived.issues.value.get('A_R')![0]!;
    expect(issueMessage(p, annotation('A_P4'), full)).toContain('Actions');
    expect(issueMessage(p, annotation('A_P4'), full)).toContain('Bar');
    expect(issueMessage(p, annotation('A_R'), refused)).toContain('Rounded bar');
  });
});
