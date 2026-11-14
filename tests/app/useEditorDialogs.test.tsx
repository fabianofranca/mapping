import { act, cleanup, renderHook } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

afterEach(cleanup);

function setup() {
  const harness: Harness = createHarness(sampleProject());
  const wrapper = ({ children }: { children?: ComponentChildren }) => (
    <EditorContext.Provider value={harness.context}>{children}</EditorContext.Provider>
  );
  const hook = renderHook(() => useEditorDialogs(), { wrapper });
  const marking = (id: string) => {
    const found = harness.project().markings.find((x) => x.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const image = (id: string) => {
    const found = harness.project().containers.find((x) => x.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  return { harness, hook, marking, image };
}

describe('useEditorDialogs: requesting deletion', () => {
  it('marking with children asks for confirmation; without children or annotations deletes directly', () => {
    const { harness, hook, marking } = setup();
    act(() => hook.result.current.requestDeleteMarking(marking('M1')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteMarking' });
    act(() => hook.result.current.close());
    harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    act(() => hook.result.current.requestDeleteMarking(marking('M3')));
    expect(harness.project().markings.some((m) => m.id === 'M3')).toBe(false);
    expect(harness.ui.selection.value).toBeNull();
  });

  it('locked marking: neither confirms nor deletes', () => {
    const { harness, hook, marking } = setup();
    harness.actions.setMarkingLocked('M3', true);
    act(() => hook.result.current.requestDeleteMarking(marking('M3')));
    expect(hook.result.current.current).toBeNull();
    expect(harness.project().markings.some((m) => m.id === 'M3')).toBe(true);
  });

  it('marking with a locked descendant asks for confirmation (and can be deleted)', () => {
    const { harness, hook, marking } = setup();
    harness.actions.setMarkingLocked('M3', true);
    act(() => hook.result.current.requestDeleteMarking(marking('M1')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteMarking' });
    expect(harness.project().markings).toHaveLength(4);
  });

  it('image: asks for confirmation, unless it is itself locked', () => {
    const { harness, hook, image } = setup();
    act(() => hook.result.current.requestDeleteImage(image('I2')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteImage' });
    act(() => hook.result.current.close());

    harness.actions.setImageLocked('I2', true);
    act(() => hook.result.current.requestDeleteImage(image('I2')));
    expect(hook.result.current.current).toBeNull();

    // Locked markings inside the image do not prevent it: the confirmation says how many.
    harness.actions.setMarkingLocked('M2', true);
    act(() => hook.result.current.requestDeleteImage(image('I1')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteImage' });
  });
});
