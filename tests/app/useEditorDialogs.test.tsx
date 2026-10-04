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
    const found = harness.project().images.find((x) => x.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  return { harness, hook, marking, image };
}

describe('useEditorDialogs: pedir exclusão', () => {
  it('marcação com filhas pede confirmação; sem filhas nem anotações exclui direto', () => {
    const { harness, hook, marking } = setup();
    act(() => hook.result.current.requestDeleteMarking(marking('M1')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteMarking' });
    act(() => hook.result.current.close());
    harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    act(() => hook.result.current.requestDeleteMarking(marking('M3')));
    expect(harness.project().markings.some((m) => m.id === 'M3')).toBe(false);
    expect(harness.ui.selection.value).toBeNull();
  });

  it('marcação trancada: nem confirma nem exclui', () => {
    const { harness, hook, marking } = setup();
    harness.actions.setMarkingLocked('M3', true);
    act(() => hook.result.current.requestDeleteMarking(marking('M3')));
    expect(hook.result.current.current).toBeNull();
    expect(harness.project().markings.some((m) => m.id === 'M3')).toBe(true);
  });

  it('marcação com um descendente trancado também não é excluída', () => {
    const { harness, hook, marking } = setup();
    harness.actions.setMarkingLocked('M3', true);
    act(() => hook.result.current.requestDeleteMarking(marking('M1')));
    expect(hook.result.current.current).toBeNull();
    expect(harness.project().markings).toHaveLength(4);
  });

  it('imagem: pede confirmação, a menos que ela ou uma marcação dela esteja trancada', () => {
    const { harness, hook, image } = setup();
    act(() => hook.result.current.requestDeleteImage(image('I2')));
    expect(hook.result.current.current).toMatchObject({ kind: 'deleteImage' });
    act(() => hook.result.current.close());

    harness.actions.setImageLocked('I2', true);
    act(() => hook.result.current.requestDeleteImage(image('I2')));
    expect(hook.result.current.current).toBeNull();

    harness.actions.setMarkingLocked('M2', true);
    act(() => hook.result.current.requestDeleteImage(image('I1')));
    expect(hook.result.current.current).toBeNull();
  });
});
