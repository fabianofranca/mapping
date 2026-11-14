import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILD_VERSION, SERVER_VERSION } from '../../mcp/version';

// Server version × documentation (phase 8.5, M13): `SERVER_VERSION` (`mcp/version.ts`) is the
// only place with the version in the code; the docs that cite it must cite the same one. The
// `docs/TESTING.md` is not covered here: it says "a versão em `mcp/version.ts`" and has its own rule.

const VERSION = /\b\d+\.\d+\.\d+\b/g;
const TAG = /mcp-v(\d+\.\d+\.\d+)/g;

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

describe('server version in the docs', () => {
  it('is x.y.z', () => {
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("without the build suffix, the announced version is the code's", () => {
    expect(BUILD_VERSION).toBe(SERVER_VERSION);
  });

  it('docs/MCP.md cites the tag mcp-v<SERVER_VERSION> and no other version', () => {
    const text = readFileSync('docs/MCP.md', 'utf8');
    expect(text).toContain(`mcp-v${SERVER_VERSION}`);
    const tags = [...text.matchAll(TAG)].map((m) => m[1]);
    expect(new Set(tags)).toEqual(new Set([SERVER_VERSION]));
    const publish = section(text, '## Publishing a version');
    expect(publish).not.toBe('');
    expect(new Set(publish.match(VERSION))).toEqual(new Set([SERVER_VERSION]));
  });

  it('docs/AGENT-GUIDE.md, if it cites the version, cites the same one', () => {
    const text = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    for (const tag of text.matchAll(TAG)) expect(tag[1]).toBe(SERVER_VERSION);
  });
});
