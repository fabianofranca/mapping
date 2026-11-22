import { describe, expect, it } from 'vitest';
import { addBackgroundContainer, type Project } from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { NOW, sampleProject } from '../model/fixtures';

// CX2 (stage #1901, decision 12): the choice of a container's class goes through a store action,
// one undo entry per call; `null` removes the set and an invalid name returns an error.

function setup(project: Project = sampleProject()) {
  const store = createProjectStore({ now: () => NOW });
  const actions = createProjectActions(store, { newId: () => 'id' });
  store.load(project);
  const current = () => {
    if (!store.project.value) throw new Error('no project');
    return store.project.value;
  };
  return { store, actions, current };
}

describe('action setContainerClass', () => {
  it('changes one set in one undo entry; null removes it', () => {
    const { store, actions, current } = setup();
    const id = current().containers[0]?.id ?? '';
    expect(actions.setContainerClass(id, 'platform', 'android').ok).toBe(true);
    expect(actions.setContainerClass(id, 'form', 'phone').ok).toBe(true);
    expect(current().containers[0]?.classes).toEqual({
      platform: 'android',
      form: 'phone',
    });

    expect(actions.setContainerClass(id, 'platform', null).ok).toBe(true);
    expect(current().containers[0]?.classes).toEqual({ form: 'phone' });

    expect(store.undo()).toBe(true); // the null: platform is back
    expect(current().containers[0]?.classes).toEqual({
      platform: 'android',
      form: 'phone',
    });
    expect(store.undo()).toBe(true); // form
    expect(current().containers[0]?.classes).toEqual({ platform: 'android' });
    expect(store.undo()).toBe(true); // platform: the key is gone
    expect('classes' in (current().containers[0] ?? {})).toBe(false);
    expect(store.canUndo.value).toBe(false);
  });

  it('changing a class to another is one entry and undo restores the previous one', () => {
    const { store, actions, current } = setup();
    const id = current().containers[0]?.id ?? '';
    actions.setContainerClass(id, 'platform', 'android');
    actions.setContainerClass(id, 'platform', 'ios');
    expect(current().containers[0]?.classes).toEqual({ platform: 'ios' });
    expect(store.undo()).toBe(true);
    expect(current().containers[0]?.classes).toEqual({ platform: 'android' });
  });

  it('a nonexistent container and an invalid name return an error without changing the project', () => {
    const { actions, current } = setup();
    const before = current();
    const id = before.containers[0]?.id ?? '';
    expect(actions.setContainerClass('missing', 'platform', 'android').ok).toBe(false);
    expect(actions.setContainerClass(id, 'Platform', 'android').ok).toBe(false);
    expect(actions.setContainerClass(id, 'platform', 'And roid').ok).toBe(false);
    expect(current()).toBe(before);
  });

  it('a call that changes nothing does not add an undo entry', () => {
    const { store, actions, current } = setup();
    const id = current().containers[0]?.id ?? '';
    actions.setContainerClass(id, 'platform', 'android');
    actions.setContainerClass(id, 'platform', 'android');
    actions.setContainerClass(id, 'other', null);
    expect(store.undo()).toBe(true);
    expect(store.canUndo.value).toBe(false);
  });
});

describe('addContainer and addBackgroundContainer with classes', () => {
  it('create the container with the choice; an empty map writes no key', () => {
    const { current } = setup();
    const withChoice = addBackgroundContainer(current(), {
      id: 'c9',
      width: 360,
      height: 800,
      background: '#FFFFFF',
      classes: { platform: 'android' },
    });
    expect(withChoice.containers.find((c) => c.id === 'c9')?.classes).toEqual({
      platform: 'android',
    });
    const empty = addBackgroundContainer(current(), {
      id: 'c8',
      width: 360,
      height: 800,
      background: '#FFFFFF',
      classes: {},
    });
    expect('classes' in (empty.containers.find((c) => c.id === 'c8') ?? {})).toBe(false);
  });
});
