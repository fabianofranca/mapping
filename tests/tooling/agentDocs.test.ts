// @vitest-environment node
// Stage #680, phase IA1: the `spec-author` skill and the agent guide follow the format version.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_FORMAT_VERSION as N } from '../../src/model/spec';

const SKILL = readFileSync('.claude/skills/spec-author/SKILL.md', 'utf8');
const GUIDE = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
const FORMAT = readFileSync('docs/SPEC-FORMAT.md', 'utf8');

/** Single pattern of the current-version sentence, for the skill and for the guide. */
const CURRENT = /The current format version is (\d+)\b/g;

function currentVersions(text: string): number[] {
  return [...text.matchAll(CURRENT)].map((m) => Number(m[1]));
}

/** Text of the section "### 13. Version" up to the next `## ` or `### `. */
function versionSection(text: string): string {
  const start = text.indexOf('### 13. Version');
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const next = rest.search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('format version in the agent docs', () => {
  it('(a) the skill says "The current format version is N" and no other version as current', () => {
    expect(currentVersions(SKILL)).toEqual([N]);
  });

  it('(b) the guide says "The current format version is N" and no other version as current', () => {
    expect(currentVersions(GUIDE)).toEqual([N]);
  });

  it('(c) the "13. Version" section of the skill lists formatVersion 1 to N, once each', () => {
    const section = versionSection(SKILL);
    expect(section).not.toBe('');
    const listed = [...section.matchAll(/^[-*] `formatVersion` (\d+)\b/gm)].map((m) =>
      Number(m[1]),
    );
    const expected = Array.from({ length: N }, (_, i) => i + 1);
    expect(listed).toEqual(expected);
  });

  it('(d) SPEC-FORMAT.md has "`formatVersion` k is k−1 plus" for each k from 2 to N', () => {
    for (let k = 2; k <= N; k += 1) {
      expect(FORMAT, `missing "\`formatVersion\` ${k} is ${k - 1}"`).toContain(
        `\`formatVersion\` ${k} is ${k - 1} `,
      );
    }
  });
});
