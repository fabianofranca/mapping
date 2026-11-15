// @vitest-environment node
// Phase QM2 (stage #1889, decisions 8 to 10): the texts that feed the quality signals of the queue panel. The final
// notices of the phase, the fix, the tester and the retest gain the lines `CI vermelho depois do PR`, `Revisão` and
// `Subagentes`; the coordinator records them with `painel.py sinal`; the escaped defects are checked once a day;
// the history is recovered once, in the new session; and the supervision reads the `uso`. A text test: it reads the
// files by section (like `contextUsage.test.ts`) and a missing anchor throws, so it never passes by not finding it.
// The notices are frozen Portuguese vocabulary, so the file is a guard block.
// portuguese-guard:begin expected notice lines and panel output, frozen vocabulary matched by the skills
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const supervision = readFileSync('.claude/skills/supervisionar-fila/SKILL.md', 'utf8');

const phase = section(flow, '## For the phase session');
const item7 = (): string =>
  between(phase, '7. When done, notify', '8. Two kinds of question');
const perStage = section(queue, '## 3. Per stage');
const panel = section(queue, '## Panel');
const switching = section(queue, '## Session switch');

describe('QM2 — FLOW, item 7: the three new lines of the phase and fix notice (decision 8)', () => {
  const lines = [
    '`CI vermelho depois do PR: <k>`',
    '`Revisão: <N> achados, <X> corrigidos`',
    '`Revisão: não se aplica`',
    '`Subagentes: <n> <modelo> <esforço>, …`',
    '`Subagentes: nenhum`',
  ];

  it('names every line, before the Contexto line', () => {
    const context = item7().indexOf('`Contexto: <mil> mil`');
    expect(context).toBeGreaterThan(0);
    for (const line of lines) {
      const at = item7().indexOf(line);
      expect(at, line).toBeGreaterThan(-1);
      expect(at, line).toBeLessThan(context);
    }
  });

  it('keeps the Contexto line and the "sem medida" form that the old tests match', () => {
    expect(item7()).toContain('`Contexto: <mil> mil`');
    expect(item7()).toContain('`Contexto: sem medida (<motivo>)`');
  });

  it('gives the rule of each line, for the phase and for the fix', () => {
    const rules = between(item7(), '   - **Signal lines', '   - **Channel:**');
    expect(rules).toContain('phase and the fix');
    expect(rules).toContain('`painel.py sinal`');
    // CI vermelho depois do PR: the Reading CI of item 6, on each commit, without the abandoned runner that passed
    expect(rules).toContain('**Reading CI**');
    expect(rules).toContain('item 6');
    expect(rules).toContain('abandoned runner');
    expect(rules).toContain('after it was opened');
    // Revisão: the numbers of the item 10 line in the PR Summary, or "não se aplica" without item 10
    expect(rules).toContain('item 10');
    expect(rules).toContain('PR Summary');
    // Subagentes: the ones this session created, by model and effort, or "nenhum"
    expect(rules).toContain('grouped by model and effort');
  });
});

describe('QM2 — TESTING-NUVEM, "Report", item 5: the subagents line of the tester notice (decision 8)', () => {
  const notice = (): string => {
    const delivery = between(
      cloud,
      '**Delivery, at the end of the round:**',
      '6. **Paste the Summary',
    );
    return delivery.slice(delivery.indexOf('5. **Notify the coordinator**'));
  };

  it('names the line and where it goes: before the context, which stays at the end', () => {
    expect(notice()).toContain('`; subagentes <n> <modelo> <esforço>, …`');
    expect(notice()).toContain('`; subagentes: nenhum`');
    expect(notice()).toContain('`; contexto <n> mil`');
    expect(notice().indexOf('`; subagentes <n>')).toBeLessThan(
      notice().indexOf('`; contexto <n> mil`'),
    );
  });

  it('brings it in the three examples (normal, group and block), each before the contexto', () => {
    for (const start of [
      '`Relato em`',
      '`Grupo 2 de 3: relato em`',
      '`Bloco 2 de 5: relato em`',
    ]) {
      const example = between(notice(), start, '")');
      const sub = example.indexOf('subagentes');
      expect(sub, start).toBeGreaterThan(-1);
      expect(sub, start).toBeLessThan(example.indexOf('`contexto '));
      expect(example, start).toMatch(/; `contexto \d+ mil`$/);
    }
  });
});

describe('QM2 — implementar-fila, "3. Per stage": the coordinator records the signals (decisions 4, 5, 8, 9 and 12a)', () => {
  it('the notice of the phase and the fix: sinal ci, cr, crFix and sub, in the same apply', () => {
    const notifies = between(perStage, '   When the phase notifies', '3. **Tester.**');
    expect(notifies).toMatch(/sinal <folder> <id> ci=<k> cr=<N> crFix=<X> sub="…"/);
    expect(notifies).toContain('same `apply`');
    expect(notifies).toContain('`Revisão: não se aplica`');
    // an epic older than this stage has no lines: records only what came
    expect(notifies).toContain('only what came');
  });

  it('the notice of the tester and the retest: ok, falha, alta, media, baixa and sub, in the same apply', () => {
    const tester = between(perStage, '   - When a tester notifies', '4. **Fix**');
    expect(tester).toMatch(
      /sinal <folder> <id> ok=<k> falha=<k> alta=<k> media=<k> baixa=<k> sub="…"/,
    );
    expect(tester).toContain('same `apply`');
    expect(tester).toContain('only what came');
  });

  it('"Child that waits for the owner": dono=+1', () => {
    const owner = between(
      perStage,
      '   **Child that waits for the owner**',
      '   **Phase that hands over by context**',
    );
    expect(owner).toMatch(/sinal <folder> <id> dono=\+1/);
  });

  it('the CI cycle action: ciclo=+1', () => {
    const action = between(
      perStage,
      '    - **Action:** if it is a cycle',
      '  - `review_ready` or `idle` with the last turn ended on a `send_later`',
    );
    expect(action).toMatch(/sinal <folder> <id> ciclo=\+1/);
  });

  it('the hourly check: the escaped defects once a day, when the show says "conferir"', () => {
    const escaped = between(
      perStage,
      '- **Escaped defects, once a day',
      '- For each overdue one, read `get_session`',
    );
    expect(escaped).toContain('`escapados: … — conferir`');
    expect(escaped).toContain('`escapadosAt`');
    expect(escaped).toContain('`Origem: etapa #<n>`');
    expect(escaped).toContain('`code-review`');
    expect(escaped).toMatch(
      /escapado <folder> '#<bug>' etapa='#<n>' sev=<high\|medium\|low>/,
    );
    expect(escaped).toContain('escapado <folder> --conferido');
  });

  it('the fix briefing: the finding on a step that a retest gave ✅ comes back as falso=<sev>', () => {
    const fix = between(
      perStage,
      '4. **Fix**',
      '   What needs an owner decision follows rule 1.',
    );
    expect(fix).toContain('`falso: <rótulo do reteste>:<sev>, …`');
    expect(fix).toMatch(/sinal <folder> <id do reteste> falso=<sev>/);
    expect(fix).toContain('retest');
  });
});

describe('QM2 — implementar-fila, "Panel": the new commands and lines', () => {
  it('lists sinal, escapado, historico and uso in the command block', () => {
    const block = between(panel, '```bash\npainel.py init <folder>', '```\n');
    expect(block).toMatch(/^painel\.py sinal <folder> <id> campo=valor…/m);
    expect(block).toMatch(/^painel\.py escapado <folder> '#<bug>' etapa='#<n>' sev=/m);
    expect(block).toMatch(/^painel\.py escapado <folder> --conferido/m);
    expect(block).toMatch(
      /^painel\.py historico <folder> --feito desde=<ISO> ate=<ISO>/m,
    );
    expect(block).toMatch(/^painel\.py uso \[--desde <ISO>\] <folder>/m);
  });

  it('describes the escapados, histórico and candidatos a teste lines of the show', () => {
    expect(panel).toContain(
      '`escapados: <k> (<#bug→#etapa sev>; …) · conferidos há <h> h`',
    );
    expect(panel).toContain('`— conferir`');
    expect(panel).toContain('`histórico: a recuperar`');
    expect(panel).toContain(
      '`histórico: recuperado (<desde> a <ate>; <k> linhas sem sessão)`',
    );
    expect(panel).toContain(
      '`candidatos a teste: <papel> <modelo> <esforço> → <degrau> (<k> seguidas)`',
    );
    expect(panel).toContain('`nenhum`');
  });

  it('keeps the old show line and the costs paragraph', () => {
    expect(panel).toContain('`testador acima do teto:`');
    expect(panel).toContain('`custo: US$ <total> em <k> sessões`');
  });
});

describe('QM2 — implementar-fila, "Session switch" › "In the new session": the one-time history (decision 10)', () => {
  // lazy, so that a missing anchor fails the test that needs it and not the whole file
  const fresh = (): string =>
    switching.slice(switching.indexOf('**In the new session** (`retomar`):'));
  const step = (): string => between(fresh(), '5. **History, once**', '\n\n');
  const briefing = (): string => fresh().slice(fresh().indexOf('5. **History, once**'));

  it('is a single step, triggered by the show saying "a recuperar"', () => {
    expect(fresh()).toContain('5. **History, once**');
    expect(step()).toContain('`histórico: a recuperar`');
    expect(step()).toContain('any cycle that sees it');
  });

  it('sends a Sonnet high subagent and applies its batch file, then marks it done', () => {
    expect(step()).toContain('Sonnet');
    expect(step()).toContain('`high`');
    expect(step()).toContain('scratchpad');
    expect(step()).toMatch(/painel\.py apply <folder> <file>/);
    expect(step()).toMatch(/historico <folder> --feito desde=<ISO> ate=<ISO> linhas=<k>/);
    expect(step()).toContain('same cycle');
  });

  it('the briefing carries the sources and the rules of decision 10', () => {
    expect(briefing()).toContain('**`log`**');
    expect(briefing()).toContain('testador total');
    expect(briefing()).toContain('Total da rodada');
    expect(briefing()).toContain('diagnóstico de ciclo (é ciclo)');
    expect(briefing()).toContain('`ciclo=+1`');
    expect(briefing()).toContain('`dono=+1`');
    expect(briefing()).toContain('**PRs**');
    expect(briefing()).toContain(
      "gh api -X GET search/issues -f q='repo:fabianofranca/mapping is:pr is:merged",
    );
    expect(briefing()).toContain('Parte de #');
    expect(briefing()).toContain('`fases=<código>:#<sub-issue>`');
    expect(briefing()).toContain('`cr=<N> crFix=<X>`');
    expect(briefing()).toContain('**Escaped**');
    expect(briefing()).toContain('`Origem: etapa #<n>`');
    expect(briefing()).toContain('The `ci` is not recovered');
    expect(briefing()).toContain('`linhas=`');
  });

  it('the old steps 1 to 4 of the new session stay as they were', () => {
    for (const n of [
      '1. Read the panel',
      '2. Do not reread',
      '3. Run `painel.py upgrade',
      '4. Check in',
    ]) {
      expect(fresh(), n).toContain(n);
    }
  });
});

describe('QM2 — supervisionar-fila, "On-demand cost": the uso (decision 8 of the stage)', () => {
  const cost = section(supervision, '## On-demand cost');

  it('`custo` also answers with painel.py uso, by role, model and effort, with the rework and the streak', () => {
    expect(cost).toContain('`painel.py uso <folder>`');
    expect(cost).toContain('role, model and effort');
    expect(cost).toContain('rework');
    expect(cost).toContain('streak');
  });

  it('keeps the costs and the sweep lines', () => {
    expect(cost).toContain('`painel.py costs <folder>`');
    expect(cost).toContain('`varredura desde=<ISO>`');
  });
});
// portuguese-guard:end
