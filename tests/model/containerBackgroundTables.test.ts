// The token tables of the background resolution are built lazily and shared by `spec.tokens` (stage #1900, NV4).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addBackgroundContainer,
  containerBackgroundColor,
  type Project,
  type ProjectSpecialization,
} from '../../src/model';
import { createTokenTables } from '../../src/model/components/tokens';
import { emptyProject } from './fixtures';

vi.mock('../../src/model/components/tokens', async (original) => {
  const actual = await original<typeof import('../../src/model/components/tokens')>();
  return { ...actual, createTokenTables: vi.fn(actual.createTokenTables) };
});

const tokens = { values: { surface: '#123456' } };
const SPEC = {
  id: 'ui',
  spec: { layers: [], types: [], tokens },
} as unknown as ProjectSpecialization;

function withBackground(background: string | { $token: string }): Project {
  return addBackgroundContainer(
    { ...emptyProject(), specializations: [SPEC] },
    { id: 'B1', width: 100, height: 100, background, center: { x: 0, y: 0 } },
  );
}

describe('container background token tables', () => {
  beforeEach(() => vi.mocked(createTokenTables).mockClear());

  it('a #RRGGBB container builds no token tables', () => {
    expect(containerBackgroundColor(withBackground('#ABCDEF'), 'B1')).toBe('#ABCDEF');
    expect(createTokenTables).not.toHaveBeenCalled();
  });

  it('project versions that share spec.tokens reuse the tables', () => {
    const first = withBackground({ $token: 'surface' });
    expect(containerBackgroundColor(first, 'B1')).toBe('#123456');
    const second = { ...first, name: 'other' };
    expect(containerBackgroundColor(second, 'B1')).toBe('#123456');
    expect(createTokenTables).toHaveBeenCalledTimes(1);
  });
});
