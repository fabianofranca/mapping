// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BUILD_ID, formatBuildId, resolveBuildId } from '../../src/utils/build';

const NOW = new Date('2026-10-10T15:30:00.000Z');

describe('identificação do build', () => {
  it('SHA curto do commit mais a data do build', () => {
    expect(formatBuildId('abcdef0123456789', NOW)).toBe('abcdef0 · 2026-10-10');
  });

  it('usa o commit do git; sem git, o GITHUB_SHA do CI; sem os dois, `dev`', () => {
    const git = () => 'fedcba9\n';
    const noGit = () => {
      throw new Error('not a git repository');
    };
    // O deploy faz checkouts próprios (main e preview): vale o commit do checkout.
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

  it('a constante do build é um texto não vazio', () => {
    expect(typeof BUILD_ID).toBe('string');
    expect(BUILD_ID.length).toBeGreaterThan(0);
  });
});
