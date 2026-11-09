import { describe, expect, it } from 'vitest';
import {
  composingAnchor,
  selectedThreadId,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { createEditorUi } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';

// Etapa #940, decisão 3 (item 42): mudar a seleção esquece a conversa escolhida e o rascunho.

const POINT = { kind: 'point', containerId: null, x: 5, y: 6 } as const;

describe('conversa de ponto solto e a seleção', () => {
  it('a conversa escolhida não volta ao clicar num item e depois no vazio', () => {
    const ui = createEditorUi();
    const project = sampleProject();
    selectThread(ui, project, sampleThread({ id: 'p', anchor: POINT }));
    expect(selectedThreadId(ui)).toBe('p');
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(selectedThreadId(ui)).toBeNull();
  });

  it('o rascunho de conversa nova não volta, mas o texto continua em threadDrafts', () => {
    const ui = createEditorUi();
    const project = sampleProject();
    startComposing(ui, project, POINT);
    ui.threadDrafts.value = new Map([[`new:${JSON.stringify(POINT)}`, 'texto']]);
    expect(composingAnchor(ui)).toEqual(POINT);
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(composingAnchor(ui)).toBeNull();
    expect(ui.threadDrafts.value.get(`new:${JSON.stringify(POINT)}`)).toBe('texto');
    startComposing(ui, project, POINT);
    expect(composingAnchor(ui)).toEqual(POINT);
  });
});
