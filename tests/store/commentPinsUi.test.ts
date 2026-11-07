import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Thread } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import {
  armComment,
  cancelComment,
  composingAnchor,
  placeComment,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';

// Visibilidade dos pinos e o botão Comentar (CM4, decisões 24 e 25): estado só da UI.

const NOW = '2026-11-06T12:00:00.000Z';
const OPEN: Thread = sampleThread({
  id: 'a',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [message('a1', T0, HUMAN, 'oi'), message('a2', T1, AGENT, 'ok')],
});
const OTHER: Thread = sampleThread({
  id: 'b',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('b1', T0, HUMAN, 'e agora?')],
});
const DONE: Thread = sampleThread({
  id: 'r',
  anchor: { kind: 'marking', id: 'M4' },
  resolved: { by: { name: 'Marina', email: 'marina@exemplo.com' }, at: T1 },
});

function setup(threads: readonly Thread[]) {
  const store = createProjectStore({ now: () => NOW });
  const project = sampleProject();
  store.load(project, { readOnly: false });
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, undefined, {
    threads: signal(threads),
    copyId: null,
    identity: signal(null),
  });
  return { store, project, ui, derived };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('visibilidade dos pinos', () => {
  it('nasce desligada, sem armar nada, e nunca é gravada', () => {
    const { ui, derived } = setup([OPEN, OTHER]);
    expect(ui.commentPins.value).toBe(false);
    expect(ui.commentArm.value).toBeNull();
    expect(derived.threads.pins.value).toEqual([]);
    ui.commentPins.value = true;
    expect(localStorage.length).toBe(0);
  });

  it('ligada, mostra o pino de cada item com conversa aberta; a resolvida fica de fora', () => {
    const { ui, derived } = setup([OPEN, OTHER, DONE]);
    ui.commentPins.value = true;
    const hosts = derived.threads.pins.value.map((g) => g.hostKey).sort();
    expect(hosts).toEqual(['marking:M1', 'marking:M2']);
  });

  it('desligada, a conversa selecionada mostra só o próprio pino', () => {
    const { ui, project, derived } = setup([OPEN, OTHER]);
    selectThread(ui, project, OPEN);
    expect(derived.threads.pins.value.map((g) => g.hostKey)).toEqual(['marking:M1']);
  });

  it('a resolvida selecionada tem pino, mesmo com os pinos desligados', () => {
    const { ui, project, derived } = setup([OPEN, DONE]);
    selectThread(ui, project, DONE);
    expect(derived.threads.pins.value.map((g) => g.hostKey)).toEqual(['marking:M4']);
    expect(derived.threads.pins.value[0]?.color).toBe('resolved');
  });

  it('o ponto de não lida entra no grupo', () => {
    const store = createProjectStore({ now: () => NOW });
    store.load(sampleProject(), { readOnly: false });
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui, undefined, undefined, {
      threads: signal([OPEN]),
      copyId: 'cópia',
      identity: signal({ name: 'Marina', email: 'marina@exemplo.com' }),
    });
    ui.commentPins.value = true;
    // A última mensagem é do agente e nunca foi lida neste dispositivo.
    expect(derived.threads.pins.value[0]?.hasUnread).toBe(true);
  });

  it('Nova conversa (rascunho) liga a visibilidade', () => {
    const { ui, project } = setup([]);
    startComposing(ui, project, { kind: 'marking', id: 'M1' });
    expect(ui.commentPins.value).toBe(true);
  });
});

describe('botão Comentar: armar, colocar e cancelar', () => {
  it('armar liga a visibilidade, guarda a ferramenta de antes e volta ao Navegar', () => {
    const { ui } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    expect(ui.commentPins.value).toBe(true);
    expect(ui.commentArm.value).toEqual({ mode: 'draw' });
    expect(ui.mode.value).toBe('navigate');
  });

  it('Esc cancela: volta à ferramenta de antes e mantém a visibilidade', () => {
    const { ui } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    expect(cancelComment(ui)).toBe(true);
    expect(ui.commentArm.value).toBeNull();
    expect(ui.mode.value).toBe('draw');
    expect(cancelComment(ui)).toBe(false);
  });

  it('o clique abre o rascunho no item e volta à ferramenta de antes', () => {
    const { ui, project } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    placeComment(ui, project, { kind: 'marking', id: 'M2' });
    expect(composingAnchor(ui)).toEqual({ kind: 'marking', id: 'M2' });
    expect(ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(ui.commentArm.value).toBeNull();
    expect(ui.mode.value).toBe('draw');
  });

  it('num lugar vazio, o rascunho fica num ponto e nada é gravado', () => {
    const { ui, project } = setup([]);
    armComment(ui);
    const point = { kind: 'point', containerId: 'I1', x: 10, y: 20 } as const;
    placeComment(ui, project, point);
    expect(composingAnchor(ui)).toEqual(point);
    expect(ui.selection.value).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
