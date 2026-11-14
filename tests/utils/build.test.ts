// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BUILD_ID, formatBuildId, resolveBuildId } from '../../src/utils/build';

const NOW = new Date('2026-10-10T15:30:00.000Z');

describe('build identification', () => {
  it('short commit SHA plus the build date', () => {
    expect(formatBuildId('abcdef0123456789', NOW)).toBe('abcdef0 · 2026-10-10');
  });

  it('uses the git commit; without git, the CI GITHUB_SHA; without both, `dev`', () => {
    const git = () => 'fedcba9\n';
    const noGit = () => {
      throw new Error('not a git repository');
    };
    // The deploy makes its own checkouts (main and preview): the checkout commit wins.
    expect(resolveBuildId({ githubSha: '0123456789abcdef', gitSha: git, now: NOW })).toBe(
      'fedcba9 · 2026-10-10',
    );
    expect(
      resolveBuildId({ githubSha: '0123456789abcdef', gitSha: noGit, now: NOW }),
    ).toBe('0123456 · 2026-10-10');
    expect(resolveBuildId({ githubSha: '', gitSha: noGit, now: NOW })).toBe(
      'dev · 2026-10-10',
    );
  });

  it('the build constant is a non-empty string', () => {
    expect(typeof BUILD_ID).toBe('string');
    expect(BUILD_ID.length).toBeGreaterThan(0);
  });
});
