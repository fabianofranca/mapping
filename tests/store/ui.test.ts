import { describe, expect, it } from 'vitest';
import { removeLayer, removeMarking } from '../../src/model';
import {
  createEditorUi,
  resolveActiveLayerId,
  resolveSelection,
  setActiveLayer,
  showAllLayers,
  toggleLayerVisible,
  visibleLayers,
} from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';

describe('estado da UI do editor', () => {
  it('começa sem seleção, no modo Navegar', () => {
    const ui = createEditorUi();
    expect(ui.selection.value).toBeNull();
    expect(ui.mode.value).toBe('navigate');
    expect(ui.listShowEmpty.value).toBe(false);
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

  describe('camadas visíveis e ativa', () => {
    const ids = (ui: ReturnType<typeof createEditorUi>) => {
      const p = sampleProject();
      const active = resolveActiveLayerId(p, ui.activeLayer.value);
      return visibleLayers(p, ui.hiddenLayers.value, active).map((l) => l.id);
    };

    it('começa com todas visíveis e a primeira camada ativa', () => {
      const ui = createEditorUi();
      expect(resolveActiveLayerId(sampleProject(), ui.activeLayer.value)).toBe('L1');
      expect(ids(ui)).toEqual(['L1', 'L2']);
      expect(resolveActiveLayerId(null, null)).toBeNull();
    });

    it('liga e desliga a visibilidade', () => {
      const ui = createEditorUi();
      const p = sampleProject();
      toggleLayerVisible(ui, p, 'L2');
      expect(ids(ui)).toEqual(['L1']);
      toggleLayerVisible(ui, p, 'L2');
      expect(ids(ui)).toEqual(['L1', 'L2']);
    });

    it('a camada ativa não pode ser escondida', () => {
      const ui = createEditorUi();
      toggleLayerVisible(ui, sampleProject(), 'L1');
      expect(ids(ui)).toEqual(['L1', 'L2']);
    });

    it('tornar uma camada ativa a torna visível', () => {
      const ui = createEditorUi();
      const p = sampleProject();
      toggleLayerVisible(ui, p, 'L2');
      setActiveLayer(ui, 'L2');
      expect(ui.hiddenLayers.value.has('L2')).toBe(false);
      expect(ids(ui)).toEqual(['L1', 'L2']);
      // Agora a L1 pode ser escondida.
      toggleLayerVisible(ui, p, 'L1');
      expect(ids(ui)).toEqual(['L2']);
    });

    it('mostrar todas limpa as escondidas', () => {
      const ui = createEditorUi();
      toggleLayerVisible(ui, sampleProject(), 'L2');
      showAllLayers(ui);
      expect(ids(ui)).toEqual(['L1', 'L2']);
    });

    it('camada ativa excluída volta para a primeira; ativa escondida aparece', () => {
      const ui = createEditorUi();
      setActiveLayer(ui, 'L2');
      const p = removeLayer(sampleProject(), 'L2');
      expect(resolveActiveLayerId(p, ui.activeLayer.value)).toBe('L1');
      expect(visibleLayers(p, new Set(['L1']), 'L1').map((l) => l.id)).toEqual(['L1']);
    });
  });
});
