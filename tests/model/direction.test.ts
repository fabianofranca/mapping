// Direção de leitura do projeto e do container (schema v20, etapa "direção e âncora", R2): a do
// projeto (ausente = ltr), a que o container fixa e a efetiva. Funções puras do modelo.
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

describe('direção do projeto e do container', () => {
  it('setProjectDirection fixa, troca e remove (null); igual devolve o mesmo projeto', () => {
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

  it('setContainerDirection fixa e volta a seguir o projeto com null', () => {
    const { p, containerId } = projectWithContainer();
    const fixed = setContainerDirection(p, containerId, 'rtl');
    expect(fixed.containers[0]!.direction).toBe('rtl');
    const follow = setContainerDirection(fixed, containerId, null);
    expect(follow.containers[0]!.direction ?? null).toBeNull();
    expect(setContainerDirection(p, containerId, null)).toBe(p);
    expect(setContainerDirection(fixed, containerId, 'rtl')).toBe(fixed);
    expect(() => setContainerDirection(p, 'nao-existe', 'rtl')).toThrow();
  });

  it('a direção efetiva: o container fixa, senão o projeto, senão ltr', () => {
    const { p, containerId } = projectWithContainer();
    expect(effectiveDirection(p, containerId)).toBe('ltr');
    expect(effectiveDirection(p, null)).toBe('ltr');
    const rtl = setProjectDirection(p, 'rtl');
    expect(effectiveDirection(rtl, containerId)).toBe('rtl');
    // Canvas e flutuante (containerId nulo) seguem o projeto.
    expect(effectiveDirection(rtl, null)).toBe('rtl');
    const fixedLtr = setContainerDirection(rtl, containerId, 'ltr');
    expect(effectiveDirection(fixedLtr, containerId)).toBe('ltr');
    expect(effectiveDirection(fixedLtr, null)).toBe('rtl');
    const fixedRtl = setContainerDirection(p, containerId, 'rtl');
    expect(effectiveDirection(fixedRtl, containerId)).toBe('rtl');
    expect(effectiveDirection(fixedRtl, null)).toBe('ltr');
    // `null` volta a seguir o projeto.
    expect(
      effectiveDirection(setContainerDirection(fixedLtr, containerId, null), containerId),
    ).toBe('rtl');
    // Container desconhecido segue o projeto.
    expect(effectiveDirection(rtl, 'nao-existe')).toBe('rtl');
  });

  it('o schema aceita ltr e rtl no projeto e no container e recusa o resto', () => {
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

  it('ausente vale ltr e null no container é o mesmo que ausente', () => {
    const { p, containerId } = projectWithContainer();
    const raw = rawOf(p);
    expect('direction' in raw).toBe(false);
    const opened = open(raw);
    if (!opened.ok) throw new Error('inválido');
    expect(effectiveDirection(opened.project, containerId)).toBe('ltr');
    const containers = (raw.containers as Raw[]).map((c) => ({ ...c, direction: null }));
    const withNull = open({ ...raw, containers });
    if (!withNull.ok) throw new Error('inválido');
    expect(effectiveDirection(withNull.project, containerId)).toBe('ltr');
  });
});
