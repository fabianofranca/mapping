import { describe, expect, it } from 'vitest';
import { addAnnotation, createArrow, removeLayer, removeMarking } from '../../src/model';
import {
  addSelectedItems,
  collapseTree,
  createEditorUi,
  existingItems,
  expandSections,
  goToAnnotation,
  peekSelectedItems,
  isSectionCollapsed,
  sectionKey,
  toggleSection,
  resolveSelection,
  revealInTree,
  selectItems,
  showAllLayers,
  toggleLayerVisible,
  toggleTreeNode,
  treeKey,
  visibleLayers,
} from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';

describe('editor UI state', () => {
  it('starts with no selection, in Navigate mode', () => {
    const ui = createEditorUi();
    expect(ui.selection.value).toBeNull();
    expect(ui.mode.value).toBe('navigate');
    expect(ui.listShowEmpty.value).toBe(false);
  });

  it('resolves the selection in the current project', () => {
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

  it('an item that no longer exists (e.g. after deleting or undoing) becomes an empty selection', () => {
    const p = removeMarking(sampleProject(), 'M1');
    expect(resolveSelection(p, { kind: 'marking', id: 'M3' })).toBeNull();
    expect(resolveSelection(p, { kind: 'image', id: 'X' })).toBeNull();
  });

  describe('visible layers', () => {
    const ids = (ui: ReturnType<typeof createEditorUi>) =>
      visibleLayers(sampleProject(), ui.hiddenLayers.value).map((l) => l.id);

    it('starts with all visible', () => {
      const ui = createEditorUi();
      expect(ids(ui)).toEqual(['L1', 'L2']);
      expect(visibleLayers(null, new Set())).toEqual([]);
    });

    it('toggles the visibility', () => {
      const ui = createEditorUi();
      toggleLayerVisible(ui, 'L2');
      expect(ids(ui)).toEqual(['L1']);
      toggleLayerVisible(ui, 'L2');
      expect(ids(ui)).toEqual(['L1', 'L2']);
    });

    it('any layer can be hidden, including the last visible one', () => {
      const ui = createEditorUi();
      toggleLayerVisible(ui, 'L1');
      expect(ids(ui)).toEqual(['L2']);
      toggleLayerVisible(ui, 'L2');
      expect(ids(ui)).toEqual([]);
    });

    it('showing all clears the hidden ones', () => {
      const ui = createEditorUi();
      toggleLayerVisible(ui, 'L2');
      showAllLayers(ui);
      expect(ids(ui)).toEqual(['L1', 'L2']);
    });

    it('a hidden and deleted layer disappears from the visible list', () => {
      const p = removeLayer(sampleProject(), 'L2');
      expect(visibleLayers(p, new Set(['L1'])).map((l) => l.id)).toEqual([]);
    });
  });

  describe('collapsed tree nodes', () => {
    it('starts with everything open and toggles a node', () => {
      const ui = createEditorUi();
      expect(ui.collapsedTree.value.size).toBe(0);
      toggleTreeNode(ui, treeKey('marking', 'M1'));
      expect(ui.collapsedTree.value.has('marking:M1')).toBe(true);
      toggleTreeNode(ui, treeKey('marking', 'M1'));
      expect(ui.collapsedTree.value.size).toBe(0);
    });

    it('the keys distinguish image and marking with the same id', () => {
      expect(treeKey('image', 'X')).not.toBe(treeKey('marking', 'X'));
    });

    it('collapsing all closes only the nodes with children', () => {
      const ui = createEditorUi();
      collapseTree(ui, sampleProject());
      // I1 and I2 have markings; M1 and M2 have children; M3 and M4 do not.
      expect([...ui.collapsedTree.value].sort()).toEqual([
        'image:I1',
        'image:I2',
        'marking:M1',
        'marking:M2',
      ]);
      collapseTree(ui, null);
      expect(ui.collapsedTree.value.size).toBe(4);
    });

    it('revealing opens the image and the ancestors of the marking, and only them', () => {
      const ui = createEditorUi();
      const p = sampleProject();
      collapseTree(ui, p);
      expect(revealInTree(ui, p, { kind: 'marking', id: 'M3' })).toBe(true);
      expect([...ui.collapsedTree.value].sort()).toEqual(['image:I2']);
    });

    it('revealing touches nothing when there is nothing to open', () => {
      const ui = createEditorUi();
      const p = sampleProject();
      expect(revealInTree(ui, p, { kind: 'marking', id: 'M3' })).toBe(false);
      collapseTree(ui, p);
      const before = ui.collapsedTree.value;
      // Selected image and a selection that no longer exists: nothing to open.
      expect(revealInTree(ui, p, { kind: 'image', id: 'I1' })).toBe(false);
      expect(revealInTree(ui, p, { kind: 'marking', id: 'X' })).toBe(false);
      expect(revealInTree(ui, p, null)).toBe(false);
      expect(ui.collapsedTree.value).toBe(before);
    });
  });

  // B15: collapsible sections of Details, UI state (outside the project and undo).
  it('collapses and opens sections of Details', () => {
    const ui = createEditorUi();
    const layer = { kind: 'layer', id: 'L1' } as const;
    expect(sectionKey(layer)).toBe('layer:L1');
    expect(sectionKey({ kind: 'marking' })).toBe('marking');
    expect(isSectionCollapsed(ui, layer)).toBe(false);
    toggleSection(ui, layer);
    expect(isSectionCollapsed(ui, layer)).toBe(true);
    toggleSection(ui, layer);
    expect(isSectionCollapsed(ui, layer)).toBe(false);

    toggleSection(ui, { kind: 'marking' });
    const before = ui.collapsed.value;
    // Opening what is already open does not replace the set (nothing re-renders).
    expandSections(ui, [layer]);
    expect(ui.collapsed.value).toBe(before);
    expandSections(ui, [{ kind: 'marking' }]);
    expect(ui.collapsed.value.size).toBe(0);
  });

  it('going to an annotation opens the collapsed layer and annotation and asks for focus on the field', () => {
    const ui = createEditorUi();
    toggleSection(ui, { kind: 'annotations' });
    toggleSection(ui, { kind: 'layer', id: 'L1' });
    toggleSection(ui, { kind: 'annotation', id: 'A1' });
    toggleSection(ui, { kind: 'layer', id: 'L2' });
    ui.hiddenLayers.value = new Set(['L1']);
    goToAnnotation(ui, { id: 'A1', markingId: 'M1', layerId: 'L1' }, 'owner');
    expect([...ui.collapsed.value]).toEqual(['layer:L2']);
    expect(ui.hiddenLayers.value.has('L1')).toBe(false);
    expect(ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(ui.focusAnnotation.value).toBe('A1');
    expect(ui.focusField.value).toBe('owner');
  });
});

describe('UI state: arrows (ME4)', () => {
  const withArrow = () =>
    createArrow(sampleProject(), { id: 'R1', from: 'M2', to: 'M4' });

  it('resolves the selected arrow; the one that vanished resolves to nothing', () => {
    const p = withArrow();
    expect(resolveSelection(p, { kind: 'arrow', id: 'R1' })).toMatchObject({
      kind: 'arrow',
      arrow: { id: 'R1', from: 'M2', to: 'M4' },
    });
    expect(resolveSelection(p, { kind: 'arrow', id: 'R9' })).toBeNull();
    // An arrow id does not resolve as a marking.
    expect(resolveSelection(p, { kind: 'marking', id: 'R1' })).toBeNull();
  });

  it('multiple selection accepts arrows and existingItems drops the ones that vanished', () => {
    const p = withArrow();
    const ui = createEditorUi();
    selectItems(ui, [
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: 'R1' },
    ]);
    expect(ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
    const items = peekSelectedItems(ui);
    expect(items).toEqual([
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: 'R1' },
    ]);
    expect(existingItems(p, items)).toEqual(items);
    expect(existingItems({ ...p, arrows: [] }, items)).toEqual([
      { kind: 'marking', id: 'M1' },
    ]);
  });

  it('going to the annotation of an arrow selects the arrow (with the project), not the marking', () => {
    const p = addAnnotation(withArrow(), { id: 'AR1', markingId: 'R1', layerId: 'L1' });
    const note = { id: 'AR1', markingId: 'R1', layerId: 'L1' };
    const ui = createEditorUi();
    goToAnnotation(ui, note, null, p);
    expect(ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
    expect(ui.focusAnnotation.value).toBe('AR1');
    // Marking annotation: stays a marking, with or without the project.
    goToAnnotation(ui, { id: 'A1', markingId: 'M1', layerId: 'L1' }, null, p);
    expect(ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    goToAnnotation(ui, note);
    expect(ui.selection.value).toEqual({ kind: 'marking', id: 'R1' });
  });

  it('revealing the arrow in the Tree opens the source marking and its ancestors', () => {
    const p = withArrow();
    const ui = createEditorUi();
    collapseTree(ui, p);
    expect(ui.collapsedTree.value.has(treeKey('marking', 'M2'))).toBe(true);
    expect(revealInTree(ui, p, { kind: 'arrow', id: 'R1' })).toBe(true);
    expect(ui.collapsedTree.value.has(treeKey('marking', 'M2'))).toBe(false);
    expect(ui.collapsedTree.value.has(treeKey('marking', 'M1'))).toBe(false);
    expect(ui.collapsedTree.value.has(treeKey('image', 'I1'))).toBe(false);
    expect(revealInTree(ui, p, { kind: 'arrow', id: 'R9' })).toBe(false);
  });

  describe('addSelectedItems (rectangle selection)', () => {
    const m = (id: string) => ({ kind: 'marking' as const, id });

    it('adds without removing anything and the current primary stays', () => {
      const ui = createEditorUi();
      selectItems(ui, [m('a'), m('b')]);
      addSelectedItems(ui, [m('c'), m('d')]);
      expect(peekSelectedItems(ui)).toEqual([m('c'), m('d'), m('a'), m('b')]);
      expect(ui.selection.value).toEqual(m('b'));
    });

    it('with no selection before, the primary is the first of the new ones', () => {
      const ui = createEditorUi();
      addSelectedItems(ui, [m('a'), m('b'), m('c')]);
      expect(ui.selection.value).toEqual(m('a'));
      expect(
        peekSelectedItems(ui)
          .map((i) => i.id)
          .sort(),
      ).toEqual(['a', 'b', 'c']);
    });

    it('ignores what is already selected', () => {
      const ui = createEditorUi();
      selectItems(ui, [m('a'), m('b')]);
      addSelectedItems(ui, [m('a'), m('c')]);
      expect(peekSelectedItems(ui)).toEqual([m('c'), m('a'), m('b')]);
      expect(ui.selection.value).toEqual(m('b'));
    });

    it('an effectively empty list writes nothing', () => {
      const ui = createEditorUi();
      selectItems(ui, [m('a'), m('b')]);
      const { value: selection } = ui.selection;
      const { value: group } = ui.selectionGroup;
      addSelectedItems(ui, []);
      addSelectedItems(ui, [m('a')]);
      expect(ui.selection.value).toBe(selection);
      expect(ui.selectionGroup.value).toBe(group);
    });
  });
});
