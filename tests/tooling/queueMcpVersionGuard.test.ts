// @vitest-environment node
// Fast track #2823: the MCP version check of the closing (rule 3) and the one before the merge
// ("Merge") only apply when the epic's diff touches the release inputs
// (`scripts/release/releaseInputs.mjs`), as the closing step already does. An epic with "MCP
// unchanged" has the same `SERVER_VERSION` as `origin/main`, so "greater than or equal" would raise
// the version for nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

/** The line that holds `anchor`; a missing anchor throws instead of passing silently. */
function lineWith(text: string, anchor: string): string {
  const line = text.split('\n').find((l) => l.includes(anchor));
  if (!line) throw new Error(`anchor not found: ${anchor}`);
  return line;
}

describe('implementar-fila: MCP version check only for epics that touch the release inputs (#2823)', () => {
  const rule3 = between(skill, '3. **One MCP version per epic', '4. ');
  const closingCheck = lineWith(rule3, 'At the closing, before the push');
  const mergeCheck = lineWith(
    section(skill, '## Merge'),
    'also check the `SERVER_VERSION`',
  );

  it('the closing check (rule 3) is limited to epics whose diff touches the release inputs', () => {
    expect(closingCheck).toContain('git diff --name-only origin/main...HEAD');
    expect(closingCheck).toContain('isReleaseInput');
    expect(closingCheck).toContain('scripts/release/releaseInputs.mjs');
    expect(closingCheck).toContain('Only if a path of');
    expect(closingCheck).toContain('an epic that does not touch them');
  });

  it('the check before the merge is limited the same way', () => {
    expect(mergeCheck).toContain('git diff --name-only origin/main...HEAD');
    expect(mergeCheck).toContain('isReleaseInput');
    expect(mergeCheck).toContain('scripts/release/releaseInputs.mjs');
    expect(mergeCheck).toContain('only if a path of');
    expect(mergeCheck).toContain('an epic that does not touch them');
  });

  it('an epic that does not touch the release inputs keeps its version and is not raised', () => {
    for (const line of [closingCheck, mergeCheck]) {
      expect(line).toMatch(/keeps its version and (there is|has) nothing to raise/);
    }
  });
});
