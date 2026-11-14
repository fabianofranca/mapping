// @vitest-environment node
// Etapa #680, fase IA1: a skill `spec-author` e o guia do agente acompanham a versão do formato.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_FORMAT_VERSION as N } from '../../src/model/spec';

const SKILL = readFileSync('.claude/skills/spec-author/SKILL.md', 'utf8');
const GUIDE = readFileSync('docs/AGENT-GUIDE.md', 'utf8');
const FORMAT = readFileSync('docs/SPEC-FORMAT.md', 'utf8');

/** Padrão único da frase da versão atual, para a skill e para o guia. */
const CURRENT = /A versão atual do formato é a (\d+)\b/g;

function currentVersions(text: string): number[] {
  return [...text.matchAll(CURRENT)].map((m) => Number(m[1]));
}

/** Texto da seção "### 13. Versão" até o próximo `## ` ou `### `. */
function versionSection(text: string): string {
  const start = text.indexOf('### 13. Versão');
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const next = rest.search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('versão do formato nos docs dos agentes', () => {
  it('(a) a skill diz "A versão atual do formato é a N" e nenhuma outra versão como atual', () => {
    expect(currentVersions(SKILL)).toEqual([N]);
  });

  it('(b) o guia diz "A versão atual do formato é a N" e nenhuma outra versão como atual', () => {
    expect(currentVersions(GUIDE)).toEqual([N]);
  });

  it('(c) a seção "13. Versão" da skill lista as formatVersion 1 a N, uma vez cada', () => {
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
