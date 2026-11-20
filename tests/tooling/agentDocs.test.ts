// @vitest-environment node
// Stage #680, phase IA1: the `spec-author` skill and the agent guide follow the format version.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT_VERSIONS } from '../../src/model/components/componentFormat';
import { ICONS_FORMAT_VERSION } from '../../src/model/components/icons';
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

  // Stage #1926, phase SA3 (decisions 7 and 8): the texts that repeat a version read the code.

  it('(e) the prompt template lists `formatVersion` <1|…|N>, every number from 1 to N in order', () => {
    const start = SKILL.indexOf('## Prompt that invokes this skill');
    expect(start).toBeGreaterThanOrEqual(0);
    const section = SKILL.slice(start);
    const lists = [...section.matchAll(/`formatVersion` <([\d|]+)>/g)].map((m) =>
      (m[1] ?? '').split('|').map(Number),
    );
    const expected = Array.from({ length: N }, (_, i) => i + 1);
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect(list).toEqual(expected);
  });

  it('(f) the skill says "The current component format version is N" once, N the last component version', () => {
    const last = COMPONENT_FORMAT_VERSIONS[COMPONENT_FORMAT_VERSIONS.length - 1];
    const found = [
      ...SKILL.matchAll(/The current component format version is (\d+)\b/g),
    ].map((m) => Number(m[1]));
    expect(found).toEqual([last]);
  });

  it('(g) each `mapping-icons` line of the skill and of the guide gives the icon set version first', () => {
    for (const [name, text] of [
      ['skill', SKILL],
      ['guide', GUIDE],
    ] as const) {
      const given = text
        .split('\n')
        .map((line, i) => ({ line, n: i + 1, at: line.indexOf('mapping-icons') }))
        .filter((l) => l.at >= 0)
        .map((l) => ({
          n: l.n,
          version: /formatVersion`?"?:?\s*`?(\d+)/.exec(l.line.slice(l.at))?.[1],
        }))
        .filter((l) => l.version !== undefined);
      expect(
        given.length,
        `${name}: no mapping-icons line gives a formatVersion`,
      ).toBeGreaterThan(0);
      for (const l of given)
        expect(Number(l.version), `${name} line ${l.n}`).toBe(ICONS_FORMAT_VERSION);
    }
  });

  it('(h) the example package versions in the skill and in SPEC-FORMAT.md equal the files', () => {
    const versions = packageVersions();
    expect(versions.size).toBeGreaterThan(0);
    let checked = 0;
    for (const [name, text] of [
      ['skill', SKILL],
      ['SPEC-FORMAT.md', FORMAT],
    ] as const) {
      text.split('\n').forEach((line, i) => {
        const hits = [...line.matchAll(PACKAGE_PATH)];
        hits.forEach((hit, k) => {
          const path = hit[1] ?? '';
          const end = (hit.index ?? 0) + hit[0].length;
          const segment = line.slice(end, hits[k + 1]?.index ?? line.length);
          const given = /\(v(\d+)\b|\(`formatVersion` (\d+)\b/.exec(segment);
          if (!given) return;
          const real = versions.get(path);
          expect(
            real,
            `${name} line ${i + 1}: ${path} is not an example package`,
          ).toBeDefined();
          expect(Number(given[1] ?? given[2]), `${name} line ${i + 1}: ${path}`).toBe(
            real,
          );
          checked += 1;
        });
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});

/** A backticked path of an example package (folder) or file, as the docs cite them. */
const PACKAGE_PATH =
  /`((?:examples\/)?libraries\/[a-z0-9-]+|examples\/specs\/[a-z0-9-]+\.json)\/?`/g;

/** `formatVersion` of each example package, by the path as the docs write it (no trailing slash). */
function packageVersions(): Map<string, number> {
  const out = new Map<string, number>();
  const read = (file: string): number =>
    (JSON.parse(readFileSync(file, 'utf8')) as { formatVersion: number }).formatVersion;
  for (const root of ['libraries', 'examples/libraries']) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const f of readdirSync(`${root}/${dir.name}`).filter((n) =>
        n.endsWith('.spec.json'),
      ))
        out.set(`${root}/${dir.name}`, read(`${root}/${dir.name}/${f}`));
    }
  }
  for (const f of readdirSync('examples/specs').filter((n) => n.endsWith('.json')))
    out.set(`examples/specs/${f}`, read(`examples/specs/${f}`));
  return out;
}
