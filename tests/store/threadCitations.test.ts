import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { citationUrl, type CitationTarget, type Thread } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';
import { HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';

// "Cited in" (decision 33), the filter "only those that cite the selection" (decision 34) and the thread that
// linked each proposal (decision 36): state derived from the threads.

const NOW = '2026-11-06T12:00:00.000Z';
const project = sampleProject();

const A: Thread = sampleThread({
  id: 'ta1',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('a1', T0, HUMAN, 'no citation')],
});

function urlOf(threads: readonly Thread[], target: CitationTarget): string {
  const url = citationUrl('project', project, threads, target);
  if (url === null) throw new Error('target without URL');
  return url;
}

function citing(id: string, target: CitationTarget, threads: readonly Thread[]): Thread {
  return sampleThread({
    id,
    anchor: { kind: 'marking', id: 'M4' },
    messages: [message(`${id}m`, T1, HUMAN, `see [x](${urlOf(threads, target)})`)],
  });
}

function setup(threads: readonly Thread[]) {
  const store = createProjectStore({ now: () => NOW });
  store.load(project, { readOnly: false });
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, undefined, {
    threads: signal(threads),
    copyId: null,
    identity: signal(null),
    proposals: signal([]),
  });
  return { ui, derived };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('citedIn (Cited in)', () => {
  it('maps the cited thread to those that cite it, open and resolved', () => {
    const base = [A];
    const open = citing('tb1', { kind: 'thread', id: 'ta1' }, base);
    const done = {
      ...citing('tc1', { kind: 'thread', id: 'ta1' }, base),
      resolved: { by: { name: 'Marina Alves', email: 'marina@example.com' }, at: T1 },
    };
    const { derived } = setup([A, open, done]);
    expect(derived.threads.citedIn.value.get('ta1')).toEqual(['tb1', 'tc1']);
    expect(derived.threads.citedIn.value.has('tb1')).toBe(false);
  });
});

describe('filter "only those that cite the selection"', () => {
  const field: CitationTarget = { kind: 'entry', annotationId: 'A1', entryId: 'E1' };
  const onM1: Thread = sampleThread({
    id: 'tm1',
    anchor: { kind: 'marking', id: 'M1' },
    messages: [message('m1', T0, HUMAN, 'on M1')],
  });
  const citesField = citing('tf1', field, []);
  const citesM2 = citing('tf2', { kind: 'marking', id: 'M2' }, []);
  const all = [onM1, citesField, citesM2, A];

  it('starts off and is not saved', () => {
    const { ui } = setup(all);
    expect(ui.commentsCiteSelection.value).toBe(false);
    ui.commentsCiteSelection.value = true;
    expect(localStorage.length).toBe(0);
  });

  const ids = (d: ReturnType<typeof setup>['derived']) =>
    d.threads.rows.value.map((r) => r.thread.id).sort();

  it('on with a selected item: those anchored on it and those that cite it, its annotations or its fields', () => {
    const { ui, derived } = setup(all);
    ui.commentsStatus.value = 'all';
    ui.selection.value = { kind: 'marking', id: 'M1' };
    expect(ids(derived)).toHaveLength(4);
    ui.commentsCiteSelection.value = true;
    expect(ids(derived)).toEqual(['tf1', 'tm1']);
    ui.selection.value = { kind: 'marking', id: 'M2' };
    expect(ids(derived)).toEqual(['ta1', 'tf2']);
  });

  it('on without a selection, it does not filter', () => {
    const { ui, derived } = setup(all);
    ui.commentsStatus.value = 'all';
    ui.commentsCiteSelection.value = true;
    expect(ids(derived)).toHaveLength(4);
  });

  it('container selection (kind image) counts as container', () => {
    const onImage = citing('ti1', { kind: 'container', id: 'I1' }, []);
    const { ui, derived } = setup([onImage, A]);
    ui.commentsStatus.value = 'all';
    ui.commentsCiteSelection.value = true;
    ui.selection.value = { kind: 'image', id: 'I1' };
    expect(ids(derived)).toEqual(['ti1']);
  });
});

describe('proposalThreads', () => {
  it('the proposal points to the thread that linked it', () => {
    const linked = sampleThread({
      id: 'tp1',
      messages: [{ ...message('p1', T0, HUMAN, 'Proposal'), proposal: 'P7' }],
    });
    const { derived } = setup([A, linked]);
    expect(derived.threads.proposalThreads.value.get('P7')).toBe('tp1');
  });
});
