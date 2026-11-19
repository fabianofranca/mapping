// @vitest-environment node
// portuguese-guard:begin expected notice lines and panel commands, frozen vocabulary matched by the skills
// Phase CB2 (stage #2260, decisions 10 to 12): the coordinator text for the canary baseline (`sem base — rodar canario
// base`), the false findings of the fix notice (`Achados falsos:`, recorded as `xFalso=+1`) and the steps not executed
// of the tester notice (`naoExec=<k>`). A text test: it reads the files by section (like `queueQualityText.test.ts`)
// and a missing anchor throws, so it never passes by not finding it. The panel commands and the notices are frozen
// Portuguese vocabulary, so the file is a guard block.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

const phase = section(flow, '## For the phase session');
const item7 = (): string =>
  between(phase, '7. When done, notify', '8. Two kinds of question');
const perStage = section(queue, '## 3. Per stage');
const panel = section(queue, '## Panel');

const canaries = (): string =>
  between(perStage, '   **Canaries B and C**', '   - **Reverted canary**');

describe('CB2 — implementar-fila, paragraph "Canaries B and C": the baseline rule (decision 12)', () => {
  it('names the `sem base` line of `show` and the command that answers it', () => {
    expect(canaries()).toContain('`sem base — rodar canario base`');
    expect(canaries()).toContain('`canario base <id> <folder> fonte=<panel url>`');
  });

  it('lists the panels as in step 1 of "Find or create", leaving out the current one', () => {
    expect(canaries()).toContain('step 1 of "Find or create"');
    expect(canaries()).toContain('leaving out the current one');
  });

  it('tries the next panel on code 1, up to 3, and falls back to `--nenhuma` with a log line', () => {
    expect(canaries()).toContain('code 1');
    expect(canaries()).toContain('up to 3');
    expect(canaries()).toContain('`canario base <id> --nenhuma`');
    expect(canaries()).toContain('`log`');
  });

  it('acts in the cycle where `show` asks, canary C of the live panel included', () => {
    expect(canaries()).toContain('in that cycle');
    expect(canaries()).toContain('canary C');
    expect(canaries()).toContain('XAdCiaqXjhFMpNR5HJNv3W');
  });
});

describe('CB2 — implementar-fila, "Panel": the commands, the import and the usage paragraph (decisions 3, 4 and 9)', () => {
  it('the commands block lists `canario … base`, `--nenhuma` and the new `sinal` fields', () => {
    const commands = between(panel, '```bash', '```\n');
    expect(commands).toContain('canario <folder> base <id> <old folder> [fonte=<text>]');
    expect(commands).toContain('(or `base <id> --nenhuma`)');
    const sinal = commands.split('\n').find((l) => l.startsWith('painel.py sinal'));
    expect(sinal).toContain('xFalso');
    expect(sinal).toContain('naoExec');
  });

  it('step 3 of "Import": the canaries come with their `base` and the sessions they counted', () => {
    const step3 = between(
      panel,
      '3. Run `painel.py import <folder> <old>`',
      '4. Whoever imports with a stage in progress',
    );
    expect(step3).toContain('with their `base`');
    expect(step3).toContain('`fonte: import`');
    expect(step3).toContain('the sessions they counted');
    expect(step3).toContain('without `cost`');
  });

  it('"Usage and quality": the cost per tested step, `sem base` and the new signals', () => {
    const usage = between(panel, 'Usage and quality (stage #1889)', 'The line `custo:');
    expect(usage).toContain('`sem base`');
    expect(usage).toContain('per tested step');
    expect(usage).toContain('`xFalso`');
    expect(usage).toContain('`naoExec`');
    expect(usage).toContain('recorded and shown');
  });
});

describe('CB2 — decision 10: the false findings of the fix notice', () => {
  it('FLOW item 7 has the `Achados falsos:` line and its definition', () => {
    const rules = between(item7(), '   - **Signal lines', '   - **Channel:**');
    expect(rules).toContain('`Achados falsos: <k.n>:<sev> (<roteiro|esperado>), …`');
    expect(rules).toContain('`Achados falsos: nenhum`');
    expect(rules).toContain('only `docs/TESTING.md`');
    expect(rules).toContain('or nothing');
    expect(rules).toContain('fix');
  });

  it('the skill writes `xFalso=+1` on the session of block or group `k`, in the same `apply`', () => {
    const notifies = between(perStage, '   When the phase notifies', '3. **Tester.**');
    expect(notifies).toContain('`Achados falsos: <k.n>:<sev> (<roteiro|esperado>), …`');
    expect(notifies).toContain('`Achados falsos: nenhum`');
    expect(notifies).toContain('`sinal <id> xFalso=+1`');
    expect(notifies).toContain('block or group `k`');
    expect(notifies).toContain('same `apply`');
    expect(notifies).toContain('latest by `created`');
  });
});

describe('CB2 — decision 11: the steps not executed of the tester notice', () => {
  const notice = (): string => {
    const delivery = between(
      cloud,
      '**Delivery, at the end of the round:**',
      '6. **Paste the Summary',
    );
    return delivery.slice(delivery.indexOf('5. **Notify the coordinator**'));
  };

  it('TESTING-NUVEM item 5 asks for `<k> not executed` in every mode', () => {
    expect(notice()).toContain('`<k> not executed`');
    expect(notice()).toContain('every mode');
  });

  it('brings it in the three examples (normal, group and block), before the subagents', () => {
    for (const start of [
      '`Relato em`',
      '`Grupo 2 de 3: relato em`',
      '`Bloco 2 de 6: relato em`',
    ]) {
      const example = between(notice(), start, '")');
      const skipped = example.indexOf('not executed');
      expect(skipped, start).toBeGreaterThan(-1);
      expect(skipped, start).toBeLessThan(example.indexOf('subagentes'));
    }
  });

  it('the skill writes `naoExec=<k>` in the same `sinal` as `ok` and `falha`; a notice without it writes none', () => {
    const tester = between(perStage, '   - When a tester notifies', '4. **Fix**');
    expect(tester).toContain('`naoExec=<k>`');
    expect(tester).toContain('same `sinal`');
    expect(tester).toContain('`ok`');
    expect(tester).toContain('`falha`');
    expect(tester).toContain('writes no `naoExec`');
  });
});
// portuguese-guard:end
