// Reading direction of the project and of the container (schema v20, stage "direction and anchor", R2): the
// project's (absent = ltr), the one the container fixes and the effective one. Pure model functions.
import { describe, expect, it } from 'vitest';
import {
  deserialize,
  effectiveDirection,
  migrations,
  serialize,
  setContainerDirection,
  setProjectDirection,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

function projectWithContainer(): { p: Project; containerId: string } {
  const p = sampleProject();
  return { p, containerId: p.containers[0]!.id };
}

function open(raw: Raw) {
  return deserialize(JSON.stringify(raw), migrations);
}

const rawOf = (p: Project): Raw => JSON.parse(serialize(p)) as Raw;

describe('project and container direction', () => {
  it('setProjectDirection sets, switches and removes (null); the same value returns the same project', () => {
    const { p } = projectWithContainer();
    const rtl = setProjectDirection(p, 'rtl');
    expect(rtl.direction).toBe('rtl');
    expect(setProjectDirection(rtl, 'ltr').direction).toBe('ltr');
    const cleared = setProjectDirection(rtl, null);
    expect(cleared.direction).toBeUndefined();
    expect('direction' in cleared).toBe(false);
    expect(setProjectDirection(rtl, 'rtl')).toBe(rtl);
    expect(setProjectDirection(p, null)).toBe(p);
  });

  it('setContainerDirection sets and goes back to following the project with null', () => {
    const { p, containerId } = projectWithContainer();
    const fixed = setContainerDirection(p, containerId, 'rtl');
    expect(fixed.containers[0]!.direction).toBe('rtl');
    const follow = setContainerDirection(fixed, containerId, null);
    expect(follow.containers[0]!.direction ?? null).toBeNull();
    expect(setContainerDirection(p, containerId, null)).toBe(p);
    expect(setContainerDirection(fixed, containerId, 'rtl')).toBe(fixed);
    expect(() => setContainerDirection(p, 'does-not-exist', 'rtl')).toThrow();
  });

  it("the effective direction: the container's, else the project's, else ltr", () => {
    const { p, containerId } = projectWithContainer();
    expect(effectiveDirection(p, containerId)).toBe('ltr');
    expect(effectiveDirection(p, null)).toBe('ltr');
    const rtl = setProjectDirection(p, 'rtl');
    expect(effectiveDirection(rtl, containerId)).toBe('rtl');
    // Canvas and floating (null containerId) follow the project.
    expect(effectiveDirection(rtl, null)).toBe('rtl');
    const fixedLtr = setContainerDirection(rtl, containerId, 'ltr');
    expect(effectiveDirection(fixedLtr, containerId)).toBe('ltr');
    expect(effectiveDirection(fixedLtr, null)).toBe('rtl');
    const fixedRtl = setContainerDirection(p, containerId, 'rtl');
    expect(effectiveDirection(fixedRtl, containerId)).toBe('rtl');
    expect(effectiveDirection(fixedRtl, null)).toBe('ltr');
    // `null` goes back to following the project.
    expect(
      effectiveDirection(setContainerDirection(fixedLtr, containerId, null), containerId),
    ).toBe('rtl');
    // An unknown container follows the project.
    expect(effectiveDirection(rtl, 'does-not-exist')).toBe('rtl');
  });

  it('the schema accepts ltr and rtl on the project and on the container and refuses the rest', () => {
    const { p, containerId } = projectWithContainer();
    const base = rawOf(
      setContainerDirection(setProjectDirection(p, 'rtl'), containerId, 'ltr'),
    );
    expect(open(base).ok).toBe(true);
    for (const bad of ['up', '', 3, true]) {
      expect(open({ ...base, direction: bad }).ok).toBe(false);
      const containers = (base.containers as Raw[]).map((c) => ({
        ...c,
        direction: bad,
      }));
      expect(open({ ...base, containers }).ok).toBe(false);
    }
  });

  it('absent is ltr and null on the container is the same as absent', () => {
    const { p, containerId } = projectWithContainer();
    const raw = rawOf(p);
    expect('direction' in raw).toBe(false);
    const opened = open(raw);
    if (!opened.ok) throw new Error('invalid');
    expect(effectiveDirection(opened.project, containerId)).toBe('ltr');
    const containers = (raw.containers as Raw[]).map((c) => ({ ...c, direction: null }));
    const withNull = open({ ...raw, containers });
    if (!withNull.ok) throw new Error('invalid');
    expect(effectiveDirection(withNull.project, containerId)).toBe('ltr');
  });
});
