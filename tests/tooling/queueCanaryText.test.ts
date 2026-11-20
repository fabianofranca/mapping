// @vitest-environment node
// Stage #2165: canary A (retest on Haiku) was promoted. #2354: canary C (tester on Haiku) was promoted too.
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

describe('implementar-fila: retest and tester on Haiku, canaries A and C promoted', () => {
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

  it('creates every tester on Haiku with no `usar`; C is promoted, never added again (#2354)', () => {
    expect(SKILL).not.toContain('canario <folder> add C');
    expect(SKILL).not.toContain("usar testador '#n'");
    expect(CANARIES).toContain('canary B holds for the phase');
    expect(CANARIES).toContain('canary C (tester, #2354) were promoted');
    for (const t of [
      'the owner promoted C on 2026-11-20 (#2354)',
      '`pode promover`',
      'is not added again',
      '`canario end C motivo="promoted"`',
      'Every tester (step 3) is created with the Haiku id',
      '`claude-haiku-5-5`',
      "at the Tester column's effort, with no `canario usar`",
      'creates the tester on Sonnet medium',
    ]) {
      expect(CANARIES, t).toContain(t);
    }
    expect(CANARIES).not.toContain('canario=C');
  });

  it('the default tester model is Haiku medium in the queue skill, the argument rules and PROCESS.md', () => {
    expect(section(SKILL, '## Arguments')).toContain(
      "every tester and retest on Haiku at the Tester column's effort (medium; #2165 and #2354)",
    );
    expect(section(SKILL, '## 2. Queue')).toContain('canary `C`');
    expect(section(SKILL, '## 2. Queue')).not.toContain('add canary `C`');
    expect(section(SKILL, '## Session switch')).toContain(
      'canary `C` was promoted (#2354) and is not written again',
    );
    const block = between(STAGE, '3. **Tester.**', '4. **Fix**');
    expect(block).not.toContain('canario <folder> usar');
    expect(block).toContain('Create each tester on `claude-haiku-5-5`');
    expect(block).toContain('kind=testador');
    expect(block).not.toContain('canario=C');
    expect(STAGE).toContain('Tester Haiku medium, or "nenhum"');
    expect(STAGE).not.toContain('Tester Sonnet medium');
    expect(readFileSync('docs/PROCESS.md', 'utf8')).toContain(
      'the Tester column (default Haiku, medium)',
    );
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
