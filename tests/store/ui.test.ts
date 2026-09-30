import { describe, expect, it } from 'vitest';
import { removeMarking } from '../../src/model';
import { createEditorUi, resolveSelection } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';

describe('estado da UI do editor', () => {
  it('começa sem seleção, no modo Navegar', () => {
    const ui = createEditorUi();
    expect(ui.selection.value).toBeNull();
    expect(ui.mode.value).toBe('navigate');
  });

  it('resolve a seleção no projeto atual', () => {
    const p = sampleProject();
    expect(resolveSelection(p, { kind: 'image', id: 'I2' })).toMatchObject({
      kind: 'image',
      image: { id: 'I2' },
    });
    expect(resolveSelection(p, { kind: 'marking', id: 'M2' })).toMatchObject({
      kind: 'marking',
      marking: { id: 'M2' },
      image: { id: 'I1' },
    });
    expect(resolveSelection(p, null)).toBeNull();
    expect(resolveSelection(null, { kind: 'image', id: 'I1' })).toBeNull();
  });

  it('item que não existe mais (ex.: após excluir ou desfazer) vira seleção vazia', () => {
    const p = removeMarking(sampleProject(), 'M1');
    expect(resolveSelection(p, { kind: 'marking', id: 'M3' })).toBeNull();
    expect(resolveSelection(p, { kind: 'image', id: 'X' })).toBeNull();
  });
});
