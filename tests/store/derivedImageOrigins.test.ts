import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  setFieldValue,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import {
  allowOrigins,
  dismissOrigins,
  revokeOrigin,
  setAllowAnyOrigin,
  setAllowHttp,
  setAllowLocalNetwork,
} from '../../src/store/imagePermissions';
import { createEditorUi } from '../../src/store/ui';
import {
  COMPONENTS,
  SPEC_ID,
  componentProject,
  testCatalog,
} from '../model/componentFixtures';

// Origins of the remote images of the shown components and the ones that still ask for consent (RI3).

const imageText = {
  format: 'mapping-component',
  formatVersion: 3,
  id: 'text',
  name: 'text',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    fill: '#EEEEEE',
    children: [{ type: 'image', src: { $field: 'label' }, width: 100, height: 40 }],
  },
};
const catalog: ComponentCatalog = testCatalog({ ...COMPONENTS, text: imageText });

function withMarking(p: Project, id: string, url: string | null): Project {
  const marked = addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x: 10, y: 10, width: 100, height: 40 },
    },
    approximateMeasurer,
  );
  return url === null ? marked : setFieldValue(marked, `A_${id}`, 'label', url);
}

function setup(initial: Project = componentProject()) {
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
  localStorage.clear();
  for (const o of [
    'https://a.com',
    'https://b.com',
    'http://a.com',
    'http://192.168.0.2:8080',
  ])
    revokeOrigin(o);
  setAllowAnyOrigin(false);
  setAllowHttp(false);
  setAllowLocalNetwork(false);
  dismissOrigins([]);
});
afterEach(() => localStorage.clear());

const origins = (list: readonly { origin: string }[]) => list.map((o) => o.origin);

describe('remoteImageOrigins and pendingImageOrigins', () => {
  it('project without a remote image: nothing', () => {
    const { derived } = setup(withMarking(componentProject(), 'M1', null));
    expect(derived.remoteImageOrigins.value).toEqual([]);
    expect(derived.pendingImageOrigins.value).toEqual([]);
  });

  it('new origins stay pending; allowed goes away; revoking brings it back', () => {
    let p = withMarking(componentProject(), 'M1', 'https://a.com/x.png');
    p = withMarking(p, 'M2', 'https://b.com/y.png');
    p = withMarking(p, 'M3', 'https://a.com/z.png');
    const { derived } = setup(p);
    expect(origins(derived.remoteImageOrigins.value)).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    expect(origins(derived.pendingImageOrigins.value)).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    allowOrigins(['https://a.com']);
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://b.com']);
    expect(origins(derived.remoteImageOrigins.value)).toHaveLength(2);
    revokeOrigin('https://a.com');
    expect(origins(derived.pendingImageOrigins.value)).toHaveLength(2);
  });

  it('new origin after an edit and after an external reload', () => {
    const { derived, actions, store } = setup(
      withMarking(componentProject(), 'M1', 'https://a.com/x.png'),
    );
    allowOrigins(['https://a.com']);
    expect(derived.pendingImageOrigins.value).toEqual([]);
    expect(actions.setFieldValue('A_M1', 'label', 'https://b.com/y.png').ok).toBe(true);
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://b.com']);
    store.load(withMarking(componentProject(), 'M9', 'https://c.com/z.png'));
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://c.com']);
  });

  it('swapping the URL for an unaccepted or empty address empties the pending ones right away', () => {
    const { derived, actions } = setup(
      withMarking(componentProject(), 'M1', 'https://a.com/x.png'),
    );
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://a.com']);
    for (const next of [
      'http://127.0.0.1:8765/photo.png',
      'https://192.168.0.10/photo.png',
      'this is not an address',
      null,
    ]) {
      expect(actions.setFieldValue('A_M1', 'label', 'https://a.com/x.png').ok).toBe(true);
      expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://a.com']);
      expect(actions.setFieldValue('A_M1', 'label', next).ok).toBe(true);
      expect(derived.pendingImageOrigins.value).toEqual([]);
    }
  });

  it('without an edit that changes the origins, the list is the same object', () => {
    const { derived, actions } = setup(
      withMarking(componentProject(), 'M1', 'https://a.com/x.png'),
    );
    const before = derived.pendingImageOrigins.value;
    actions.setFieldValue('A_M1', 'label', 'https://a.com/other.png');
    expect(derived.pendingImageOrigins.value).toBe(before);
  });

  it('http only shows with the switch on, marked as unencrypted', () => {
    const { derived } = setup(
      withMarking(componentProject(), 'M1', 'http://a.com/x.png'),
    );
    expect(derived.remoteImageOrigins.value).toEqual([]);
    setAllowHttp(true);
    expect(derived.remoteImageOrigins.value).toEqual([
      { origin: 'http://a.com', local: false, insecure: true },
    ]);
    allowOrigins(['https://a.com']);
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['http://a.com']);
  });

  it('"any origin" hides the non-local ones, but not the local one', () => {
    let p = withMarking(componentProject(), 'M1', 'https://a.com/x.png');
    p = withMarking(p, 'M2', 'http://192.168.0.2:8080/y.png');
    const { derived } = setup(p);
    setAllowHttp(true);
    setAllowLocalNetwork(true);
    expect(origins(derived.pendingImageOrigins.value)).toEqual([
      'https://a.com',
      'http://192.168.0.2:8080',
    ]);
    setAllowAnyOrigin(true);
    expect(derived.pendingImageOrigins.value).toEqual([
      { origin: 'http://192.168.0.2:8080', local: true, insecure: true },
    ]);
  });

  it('dismissing hides only in this session and a new origin comes back on its own', () => {
    const { derived, actions } = setup(
      withMarking(componentProject(), 'M1', 'https://a.com/x.png'),
    );
    dismissOrigins(['https://a.com']);
    expect(derived.pendingImageOrigins.value).toEqual([]);
    expect(origins(derived.remoteImageOrigins.value)).toEqual(['https://a.com']);
    actions.setFieldValue('A_M1', 'label', 'https://b.com/y.png');
    expect(origins(derived.pendingImageOrigins.value)).toEqual(['https://b.com']);
  });
});
