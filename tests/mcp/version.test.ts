import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../../mcp/version';

// Versão do servidor × documentação (fase 8.5, M13): `SERVER_VERSION` (`mcp/version.ts`) é o
// único lugar com a versão no código; os docs que a citam precisam citar a mesma. O
// `docs/TESTING.md` não entra aqui: ele diz "a versão em `mcp/version.ts`" e tem regra própria.

const VERSION = /\b\d+\.\d+\.\d+\b/g;
const TAG = /mcp-v(\d+\.\d+\.\d+)/g;

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

describe('versão do servidor nos docs', () => {
  it('é x.y.z', () => {
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('docs/MCP.md cita a tag mcp-v<SERVER_VERSION> e nenhuma outra versão', () => {
    const text = readFileSync('docs/MCP.md', 'utf8');
    expect(text).toContain(`mcp-v${SERVER_VERSION}`);
    const tags = [...text.matchAll(TAG)].map((m) => m[1]);
    expect(new Set(tags)).toEqual(new Set([SERVER_VERSION]));
    const publish = section(text, '## Publicar uma versão');
    expect(publish).not.toBe('');
    expect(new Set(publish.match(VERSION))).toEqual(new Set([SERVER_VERSION]));
  });

  it('docs/AGENT-GUIDE.md, se citar a versão, cita a mesma', () => {
    const text = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
    for (const tag of text.matchAll(TAG)) expect(tag[1]).toBe(SERVER_VERSION);
  });
});
