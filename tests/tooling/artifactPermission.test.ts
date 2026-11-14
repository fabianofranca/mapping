// @vitest-environment node
// Stage #1390, phase DS2: the closing writes to the DS artifact, and without this rule the Auto
// mode classifier denies `Artifact` and the queue stops. It must not vanish in a cleanup.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('.claude/settings.json', () => {
  it('permissions.allow allows the Artifact tool', () => {
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
      permissions?: { allow?: string[] };
    };
    expect(settings.permissions?.allow).toContain('Artifact');
  });

  it('permissions.allow allows archive_session (the successor archives the previous coordinator; FM4)', () => {
    const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
      permissions?: { allow?: string[] };
    };
    expect(settings.permissions?.allow).toContain(
      'mcp__claude-code-remote__archive_session',
    );
  });
});
