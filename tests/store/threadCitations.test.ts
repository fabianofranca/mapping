import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { citationUrl, type CitationTarget, type Thread } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';
import { HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';

// "Citada em" (decisão 33), o filtro "só as que citam a seleção" (decisão 34) e a conversa que
// ligou cada proposta (decisão 36): estado derivado das conversas.

const NOW = '2026-11-06T12:00:00.000Z';
const project = sampleProject();

const A: Thread = sampleThread({
  id: 'ta1',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('a1', T0, HUMAN, 'sem citar')],
});

function urlOf(threads: readonly Thread[], target: CitationTarget): string {
  const url = citationUrl('projeto', project, threads, target);
  if (url === null) throw new Error('alvo sem URL');
  return url;
}

function citing(id: string, target: CitationTarget, threads: readonly Thread[]): Thread {
  return sampleThread({
    id,
    anchor: { kind: 'marking', id: 'M4' },
    messages: [message(`${id}m`, T1, HUMAN, `veja [x](${urlOf(threads, target)})`)],
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

describe('citedIn (Citada em)', () => {
  it('mapeia a conversa citada às que a citam, abertas e resolvidas', () => {
    const base = [A];
    const open = citing('tb1', { kind: 'thread', id: 'ta1' }, base);
    const done = {
      ...citing('tc1', { kind: 'thread', id: 'ta1' }, base),
      resolved: { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: T1 },
    };
    const { derived } = setup([A, open, done]);
    expect(derived.threads.citedIn.value.get('ta1')).toEqual(['tb1', 'tc1']);
    expect(derived.threads.citedIn.value.has('tb1')).toBe(false);
  });
});

describe('filtro "só as que citam a seleção"', () => {
  const field: CitationTarget = { kind: 'entry', annotationId: 'A1', entryId: 'E1' };
  const onM1: Thread = sampleThread({
    id: 'tm1',
    anchor: { kind: 'marking', id: 'M1' },
    messages: [message('m1', T0, HUMAN, 'na M1')],
  });
  const citesField = citing('tf1', field, []);
  const citesM2 = citing('tf2', { kind: 'marking', id: 'M2' }, []);
  const all = [onM1, citesField, citesM2, A];

  it('nasce desligado e não é gravado', () => {
    const { ui } = setup(all);
    expect(ui.commentsCiteSelection.value).toBe(false);
    ui.commentsCiteSelection.value = true;
    expect(localStorage.length).toBe(0);
  });

  const ids = (d: ReturnType<typeof setup>['derived']) =>
    d.threads.rows.value.map((r) => r.thread.id).sort();

  it('ligado com um item selecionado: as ancoradas nele e as que citam ele, as anotações ou os campos', () => {
    const { ui, derived } = setup(all);
    ui.commentsStatus.value = 'all';
    ui.selection.value = { kind: 'marking', id: 'M1' };
    expect(ids(derived)).toHaveLength(4);
    ui.commentsCiteSelection.value = true;
    expect(ids(derived)).toEqual(['tf1', 'tm1']);
    ui.selection.value = { kind: 'marking', id: 'M2' };
    expect(ids(derived)).toEqual(['ta1', 'tf2']);
  });

  it('ligado sem seleção, não filtra', () => {
    const { ui, derived } = setup(all);
    ui.commentsStatus.value = 'all';
    ui.commentsCiteSelection.value = true;
    expect(ids(derived)).toHaveLength(4);
  });

  it('seleção de container (kind image) vale como container', () => {
    const onImage = citing('ti1', { kind: 'container', id: 'I1' }, []);
    const { ui, derived } = setup([onImage, A]);
    ui.commentsStatus.value = 'all';
    ui.commentsCiteSelection.value = true;
    ui.selection.value = { kind: 'image', id: 'I1' };
    expect(ids(derived)).toEqual(['ti1']);
  });
});

describe('proposalThreads', () => {
  it('a proposta aponta para a conversa que a ligou', () => {
    const linked = sampleThread({
      id: 'tp1',
      messages: [{ ...message('p1', T0, HUMAN, 'Proposta'), proposal: 'P7' }],
    });
    const { derived } = setup([A, linked]);
    expect(derived.threads.proposalThreads.value.get('P7')).toBe('tp1');
  });
});
