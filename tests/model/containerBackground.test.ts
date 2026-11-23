// Container background by token (stage #1900, NV4): the stored form, the resolution in the effective
// selection and the model operations. Pure model functions.
import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  buildProposal,
  colorTokenNames,
  containerBackgroundColor,
  deserialize,
  isBackgroundToken,
  parseProposal,
  resolveBackground,
  serialize,
  serializeProposal,
  setBackgroundContainer,
  setContainerDrawingMode,
  setProjectDrawingMode,
  undeclaredBackgroundTokens,
  validateProject,
  type Project,
  type ProjectSpecialization,
} from '../../src/model';
import { colorOverWhite } from '../../src/model/components/tokens';
import { emptyProject, sampleProject } from './fixtures';

const AT = '2026-11-07T10:00:00.000Z';

function specOf(id: string, tokens: unknown): ProjectSpecialization {
  return {
    id,
    spec: { layers: [], types: [], tokens },
  } as unknown as ProjectSpecialization;
}

const THEMED = specOf('ui', {
  axes: { theme: ['light', 'dark'], contrast: ['normal', 'high'] },
  values: {
    surface: {
      $axis: 'theme',
      light: '#FFFFFF',
      dark: { $axis: 'contrast', normal: '#202020', high: '#000000' },
    },
    scrim: '#00000080',
    ghost: 'transparent',
    gap: 8,
  },
});

function withSpecs(p: Project, ...specs: ProjectSpecialization[]): Project {
  return { ...p, specializations: specs };
}

function projectWithToken(token: string, ...specs: ProjectSpecialization[]): Project {
  const base = withSpecs(emptyProject(), ...(specs.length === 0 ? [THEMED] : specs));
  return addBackgroundContainer(base, {
    id: 'B1',
    width: 100,
    height: 80,
    background: { $token: token },
  });
}

describe('background token: stored form', () => {
  it('a v24 file with a token reads and writes back identical, key order kept', () => {
    const p = addBackgroundContainer(emptyProject(), {
      id: 'B1',
      width: 100,
      height: 80,
      background: { $token: 'surface' },
    });
    expect(validateProject(p)).toEqual([]);
    const text = serialize(p);
    const parsed = deserialize(text);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.project.containers[0]!.background).toEqual({ $token: 'surface' });
    expect(serialize(parsed.project)).toBe(text);
    expect(text).toContain('"background": {\n');
  });

  it('container-content accepts the token and still rejects a token on a container with a file', () => {
    const p = projectWithToken('surface');
    expect(validateProject(p).map((i) => i.code)).not.toContain('container-content');
    const withFile = sampleProject();
    const broken: Project = {
      ...withFile,
      containers: withFile.containers.map((c, i) =>
        i === 0 ? { ...c, background: { $token: 'surface' } } : c,
      ),
    };
    expect(validateProject(broken).map((i) => i.code)).toContain('container-content');
    const noFile: Project = {
      ...p,
      containers: p.containers.map((c) => ({ ...c, file: 'a.png' })),
    };
    expect(validateProject(noFile).map((i) => i.code)).toContain('container-content');
  });

  it('a name outside the pattern is a schema error', () => {
    const text = serialize(projectWithToken('surface')).replace(
      '"surface"',
      '"Bad Name"',
    );
    expect(deserialize(text).ok).toBe(false);
  });

  it('isBackgroundToken tells the forms apart', () => {
    expect(isBackgroundToken({ $token: 'x' })).toBe(true);
    expect(isBackgroundToken('#FFFFFF')).toBe(false);
    expect(isBackgroundToken(null)).toBe(false);
    expect(isBackgroundToken(undefined)).toBe(false);
  });
});

describe('background token: resolution', () => {
  it('follows the effective selection: the project map, the container pin, the pinned argument', () => {
    let p = projectWithToken('surface');
    expect(containerBackgroundColor(p, 'B1')).toBe('#FFFFFF');
    p = setProjectDrawingMode(p, { theme: 'dark' });
    expect(containerBackgroundColor(p, 'B1')).toBe('#202020');
    p = setContainerDrawingMode(p, 'B1', { contrast: 'high' });
    expect(containerBackgroundColor(p, 'B1')).toBe('#000000');
    expect(containerBackgroundColor(p, 'B1', { theme: 'light' })).toBe('#FFFFFF');
    expect(resolveBackground(p, { $token: 'surface' }, { theme: 'dark' })).toBe(
      '#202020',
    );
  });

  it('the first applied specialization that declares the name as a color wins', () => {
    const numberFirst = specOf('a', { values: { surface: 4 } });
    const first = specOf('b', { values: { surface: '#111111' } });
    const second = specOf('c', { values: { surface: '#222222' } });
    const p = projectWithToken('surface', numberFirst, first, second);
    expect(containerBackgroundColor(p, 'B1')).toBe('#111111');
    expect(colorTokenNames(p)).toEqual(['surface']);
  });

  it('alpha is composited over white; transparent and none become white', () => {
    const p = projectWithToken('scrim');
    expect(containerBackgroundColor(p, 'B1')).toBe('#7F7F7F');
    expect(resolveBackground(p, { $token: 'ghost' })).toBe('#FFFFFF');
    expect(colorOverWhite('none')).toBe('#FFFFFF');
    expect(colorOverWhite('#112233')).toBe('#112233');
    expect(colorOverWhite('Inter')).toBeUndefined();
  });

  it('an undeclared token resolves white and is listed', () => {
    const p = projectWithToken('surface');
    const gone = withSpecs(p);
    expect(containerBackgroundColor(gone, 'B1')).toBe('#FFFFFF');
    expect(undeclaredBackgroundTokens(gone)).toEqual([
      { containerId: 'B1', token: 'surface' },
    ]);
    expect(undeclaredBackgroundTokens(p)).toEqual([]);
    const number = projectWithToken('gap');
    expect(undeclaredBackgroundTokens(number)).toEqual([
      { containerId: 'B1', token: 'gap' },
    ]);
  });

  it('a #RRGGBB background resolves to itself in uppercase; a file container gives null', () => {
    const p = addBackgroundContainer(emptyProject(), {
      id: 'B2',
      width: 10,
      height: 10,
      background: '#abcdef',
    });
    expect(containerBackgroundColor(p, 'B2')).toBe('#ABCDEF');
    expect(containerBackgroundColor(sampleProject(), 'I1')).toBeNull();
  });

  it('colorTokenNames lists the color names in specialization order, no repeats', () => {
    const p = withSpecs(
      emptyProject(),
      THEMED,
      specOf('x', { values: { surface: '#fff' } }),
    );
    expect(colorTokenNames(p)).toEqual(['surface', 'scrim', 'ghost']);
  });

  it('is memoized by project', () => {
    const p = projectWithToken('surface');
    expect(colorTokenNames(p)).toBe(colorTokenNames(p));
  });
});

describe('background token: operations and proposals', () => {
  it('addBackgroundContainer and setBackgroundContainer accept a token and refuse a bad name', () => {
    const p = projectWithToken('surface');
    const set = setBackgroundContainer(p, 'B1', { background: { $token: 'scrim' } });
    expect(set.containers[0]!.background).toEqual({ $token: 'scrim' });
    expect(setBackgroundContainer(p, 'B1', { background: { $token: 'surface' } })).toBe(
      p,
    );
    expect(() =>
      setBackgroundContainer(p, 'B1', { background: { $token: 'Bad Name' } }),
    ).toThrow(expect.objectContaining({ code: 'invalid-color' }));
    expect(() =>
      addBackgroundContainer(emptyProject(), {
        id: 'B3',
        width: 10,
        height: 10,
        background: { $token: '' },
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-color' }));
  });

  it('a proposal with a token is written in formatVersion 12; one with #RRGGBB is not', () => {
    const base = withSpecs(emptyProject(), THEMED);
    const fixed = addBackgroundContainer(base, {
      id: 'B1',
      width: 100,
      height: 80,
      background: '#FFFFFF',
    });
    const created = buildProposal(base, fixed, { title: 'x', createdAt: AT });
    expect(created.formatVersion).toBeLessThan(12);
    const token = setBackgroundContainer(fixed, 'B1', {
      background: { $token: 'surface' },
    });
    const changed = buildProposal(fixed, token, { title: 'x', createdAt: AT });
    expect(changed.formatVersion).toBe(12);
    expect(changed.changes).toMatchObject([
      { field: 'background', from: '#FFFFFF', to: { $token: 'surface' } },
    ]);
    const tokenCreated = buildProposal(base, projectWithToken('surface'), {
      title: 'x',
      createdAt: AT,
    });
    expect(tokenCreated.formatVersion).toBe(12);
    const text = serializeProposal(tokenCreated);
    expect(parseProposal(JSON.parse(text)).ok).toBe(true);
    const old = { ...JSON.parse(text), formatVersion: 11 };
    expect(parseProposal(old).ok).toBe(false);
  });
});
