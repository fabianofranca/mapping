// @vitest-environment node
// Stage #2165: canary A (retest on Haiku) was promoted and canary C (tester on Haiku) is tried.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SKILL = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const STAGE = section(SKILL, '## 3. Per stage');
const CANARIES = between(
  STAGE,
  '**Canaries B and C**',
  '**Child that waits for the coordinator**',
);
const PAINEL = '.claude/skills/implementar-fila/painel/painel.py';
const ADD_C =
  'canario <folder> add C papel=testador de="Sonnet medium" modelo=Haiku esforco=medium n=12 volta=2';

describe('implementar-fila: retest on Haiku, canary C on the tester', () => {
  it('creates every retest on Haiku with no `usar`, checks the model and falls back to Sonnet', () => {
    expect(SKILL).not.toContain('usar reteste');
    expect(SKILL).not.toContain('canario add A');
    for (const t of ['Canary A was promoted', '2026-11-19', 'claude-haiku-5-5']) {
      expect(CANARIES, t).toContain(t);
    }
    for (const t of ['no `canario usar`', '`session_context.model`', 'Sonnet medium']) {
      expect(CANARIES, t).toContain(t);
    }
  });

  it('adds C when missing, at the start of a queue and on a resume; B holds for the phase, C for the tester', () => {
    expect(CANARIES).toContain(ADD_C);
    expect(CANARIES).toContain('canary B holds for the phase, canary C for the tester');
    expect(CANARIES).toContain('canario end C motivo="create_session recusou Haiku:');
    for (const s of ['## 2. Queue', '## Session switch']) {
      expect(section(SKILL, s), s).toContain('canary `C`');
    }
  });

  it('runs `usar testador` before the tester `create_session` that registers `kind=testador`', () => {
    const block = between(STAGE, '3. **Tester.**', '4. **Fix**');
    const usar = block.indexOf('canario <folder> usar testador');
    expect(usar).toBeGreaterThan(-1);
    expect(block.indexOf('kind=testador')).toBeGreaterThan(usar);
    expect(block).toContain('canario=C');
    const cmd = SKILL.split('\n').find((l) =>
      l.startsWith('painel.py canario <folder> usar'),
    );
    expect(cmd).toContain('testador');
  });

  it('the `canario` help and the painel.py docstring name canaries B and C and list `testador` in `usar`', () => {
    const help = execFileSync('python3', [PAINEL, 'canario', '--help'], {
      encoding: 'utf8',
    });
    const docstring = readFileSync(PAINEL, 'utf8').split('"""')[1] ?? '';
    for (const raw of [help, docstring]) {
      const text = raw.replace(/\s+/g, ' ');
      expect(text).toContain('<fase|correção|reteste|testador>');
      expect(text).toMatch(/\bB\b.*\bC\b/);
      expect(text).not.toContain('canaries A and B');
    }
  });
});
