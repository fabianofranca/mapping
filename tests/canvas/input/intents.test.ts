import { describe, expect, it } from 'vitest';
import {
  canGrab,
  cursorFor,
  dragModeOf,
  grabIntentAt,
  intentAt,
  isRepeatTap,
  tapSelection,
  type IntentContext,
} from '../../../src/canvas/input/intents';
import { setImageLocked, setMarkingLocked } from '../../../src/model';
import { canvasProject } from '../harness';

const project = canvasProject();
const ctx = (overrides: Partial<IntentContext> = {}): IntentContext => ({
  project,
  readOnly: false,
  mode: 'navigate',
  selection: null,
  zoom: 1,
  spaceDown: false,
  ...overrides,
});
const NONE = new Map();

describe('intentAt', () => {
  it('sem seleção, arrastar faz pan', () => {
    expect(intentAt(ctx(), { x: 150, y: 150 })).toEqual({ kind: 'pan' });
  });

  it('marcação selecionada: alça redimensiona, dentro move, fora faz pan', () => {
    const c = ctx({ selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 102, y: 98 })).toEqual({
      kind: 'resize-marking',
      markingId: 'M1',
      corner: 'nw',
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('imagem selecionada: alça de 44 px de tela, independente do zoom', () => {
    const c = ctx({ selection: { kind: 'image', id: 'I2' }, zoom: 2 });
    // 10 unidades do canvas = 20 px de tela do canto: dentro do raio de 22.
    expect(intentAt(c, { x: 1610, y: 510 })).toEqual({
      kind: 'resize-image',
      imageId: 'I2',
      corner: 'se',
    });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({
      kind: 'move-image',
      imageId: 'I2',
    });
  });

  it('modo Desenhar: sobre uma imagem desenha (mesmo nas alças); fora, pan', () => {
    const c = ctx({ mode: 'draw', selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 100, y: 100 })).toEqual({ kind: 'draw', imageId: 'I1' });
    expect(intentAt(c, { x: 1050, y: 100 })).toEqual({ kind: 'pan' });
  });

  it('Espaço, só leitura ou sem projeto: sempre pan', () => {
    const selection = { kind: 'marking', id: 'M1' } as const;
    const inside = { x: 400, y: 400 };
    expect(intentAt(ctx({ selection, spaceDown: true }), inside)).toEqual({
      kind: 'pan',
    });
    expect(intentAt(ctx({ selection, readOnly: true }), inside)).toEqual({ kind: 'pan' });
    expect(intentAt(ctx({ project: null }), inside)).toEqual({ kind: 'pan' });
  });
});

describe('canGrab', () => {
  it('só no modo Navegar, com edição liberada e sem Espaço', () => {
    expect(canGrab(ctx())).toBe(true);
    expect(canGrab(ctx({ mode: 'draw' }))).toBe(false);
    expect(canGrab(ctx({ readOnly: true }))).toBe(false);
    expect(canGrab(ctx({ spaceDown: true }))).toBe(false);
    expect(canGrab(ctx({ project: null }))).toBe(false);
  });
});

describe('grabIntentAt', () => {
  it('pega a marcação mais interna sob o dedo; fora delas, a imagem', () => {
    expect(grabIntentAt(project, null, NONE, { x: 250, y: 250 })).toEqual({
      kind: 'move-marking',
      markingId: 'M2',
    });
    expect(grabIntentAt(project, null, NONE, { x: 900, y: 700 })).toEqual({
      kind: 'move-image',
      imageId: 'I1',
    });
    expect(grabIntentAt(project, null, NONE, { x: 1050, y: 0 })).toBeNull();
  });

  it('prefere a selecionada quando o dedo está nela', () => {
    const selection = { kind: 'marking', id: 'M1' } as const;
    expect(grabIntentAt(project, selection, NONE, { x: 250, y: 250 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
  });

  it('ignora as marcações ocultas', () => {
    const hidden = new Map([['M2', 'hidden' as const]]);
    expect(grabIntentAt(project, null, hidden, { x: 250, y: 250 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
  });
});

describe('tapSelection', () => {
  it('seleciona a mais interna; tocar de novo sobe para o pai; fora, a imagem', () => {
    const p = { x: 250, y: 250 };
    const first = tapSelection(project, null, NONE, p, false);
    expect(first).toEqual({ kind: 'marking', id: 'M2' });
    const second = tapSelection(project, first, NONE, p, true);
    expect(second).toEqual({ kind: 'marking', id: 'M1' });
    expect(tapSelection(project, second, NONE, { x: 900, y: 700 }, false)).toEqual({
      kind: 'image',
      id: 'I1',
    });
  });

  it('fora das imagens (ou sem projeto), limpa a seleção', () => {
    const selection = { kind: 'image', id: 'I1' } as const;
    expect(tapSelection(project, selection, NONE, { x: 1050, y: 0 }, false)).toBeNull();
    expect(tapSelection(null, selection, NONE, { x: 250, y: 250 }, false)).toBeNull();
  });
});

describe('isRepeatTap', () => {
  it('perto do anterior em px de tela (12 px)', () => {
    expect(isRepeatTap(null, { x: 0, y: 0 }, 1)).toBe(false);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBe(true);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toBe(false);
  });
});

describe('dragModeOf e cursorFor', () => {
  it('classificam a intenção', () => {
    expect(dragModeOf({ kind: 'pan' })).toBe('pan');
    expect(dragModeOf({ kind: 'draw', imageId: 'I1' })).toBe('draw');
    expect(dragModeOf({ kind: 'move-image', imageId: 'I1' })).toBe('move');
    expect(dragModeOf({ kind: 'resize-marking', markingId: 'M1', corner: 'ne' })).toBe(
      'resize',
    );
    expect(cursorFor({ kind: 'pan' })).toBe('');
    expect(cursorFor({ kind: 'move-marking', markingId: 'M1' })).toBe('move');
    expect(cursorFor({ kind: 'resize-image', imageId: 'I1', corner: 'se' })).toBe(
      'nwse-resize',
    );
    expect(cursorFor({ kind: 'resize-image', imageId: 'I1', corner: 'ne' })).toBe(
      'nesw-resize',
    );
    expect(cursorFor({ kind: 'draw', imageId: 'I1' })).toBe('crosshair');
  });
});

describe('trava (etapa 2.5)', () => {
  const lockedMarking = (id: string) => setMarkingLocked(project, id, true);
  const select = (id: string) => ({ kind: 'marking', id }) as const;

  it('marcação selecionada e trancada: sem alças, e arrastar dentro dela é "locked"', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M1') });
    // O canto onde ficaria a alça também é só "locked".
    expect(intentAt(c, { x: 102, y: 102 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('descendente de um pai trancado também fica sem alças', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M2') });
    expect(intentAt(c, { x: 202, y: 202 })).toEqual({ kind: 'locked' });
  });

  it('pai com um descendente trancado: redimensiona e move normalmente', () => {
    const c = ctx({ project: lockedMarking('M2'), selection: select('M1') });
    expect(intentAt(c, { x: 102, y: 98 })).toMatchObject({ kind: 'resize-marking' });
    expect(intentAt(c, { x: 500, y: 450 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
  });

  it('imagem selecionada e trancada: sem alças e sem mover', () => {
    const c = ctx({
      project: setImageLocked(project, 'I2', true),
      selection: { kind: 'image', id: 'I2' },
    });
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' });
  });

  it('o modo Desenhar não é afetado pela trava', () => {
    const c = ctx({
      project: lockedMarking('M1'),
      mode: 'draw',
      selection: select('M1'),
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'draw', imageId: 'I1' });
  });

  it('cursor "não permitido" e arrastar tentaria mover', () => {
    expect(cursorFor({ kind: 'locked' })).toBe('not-allowed');
    expect(dragModeOf({ kind: 'locked' })).toBe('move');
  });

  it('segurar-e-mover não pega item trancado (nem a imagem trancada)', () => {
    const p = lockedMarking('M2');
    expect(grabIntentAt(p, null, NONE, { x: 250, y: 250 })).toBeNull();
    // O pai de uma marcação trancada é pego: mover o pai leva a filha trancada junto.
    expect(grabIntentAt(p, null, NONE, { x: 150, y: 150 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    // Uma marcação livre (de outra imagem) continua pegável.
    expect(grabIntentAt(p, null, NONE, { x: 1200, y: 100 })).toEqual({
      kind: 'move-marking',
      markingId: 'M3',
    });
    const image = setImageLocked(project, 'I1', true);
    expect(grabIntentAt(image, null, NONE, { x: 900, y: 700 })).toBeNull();
  });

  it('segurar numa marcação sob um pai trancado não a pega', () => {
    expect(grabIntentAt(lockedMarking('M1'), null, NONE, { x: 250, y: 250 })).toBeNull();
  });

  it('tocar continua selecionando o item trancado', () => {
    const p = lockedMarking('M2');
    expect(tapSelection(p, null, NONE, { x: 250, y: 250 }, false)).toEqual({
      kind: 'marking',
      id: 'M2',
    });
  });
});
