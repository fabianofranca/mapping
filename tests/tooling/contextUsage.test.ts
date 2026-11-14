// @vitest-environment node
// Stage #1699, phase CM1 (decisions 1 to 11): the context measure through the session's own local
// transcript (`scripts/ci/contextUsage.mjs`) and the flow texts that start to use it. The unit and the CLI
// run with `.jsonl` fixtures in a temporary folder (`CLAUDE_CONFIG_DIR` and
// `CLAUDE_CODE_SESSION_ID` in the process `env`); the rest is a text test.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error .mjs module without type declarations
import { lastContext } from '../../scripts/ci/contextUsage.mjs';
import { scriptMeasureProblems } from '../support/contextMeasure';
import { between, section } from '../support/textSlice';

interface Usage {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
const lastOf = lastContext as (text: string) => number | null;

/** Assistant message line, in the real transcript format (a subset of the keys). */
function assistant(
  usage: Usage,
  extra: { isSidechain?: boolean; model?: string } = {},
): string {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: extra.isSidechain ?? false,
    message: { model: extra.model ?? 'claude-sonnet-5-5', role: 'assistant', usage },
  });
}
const user = JSON.stringify({
  type: 'user',
  isSidechain: false,
  message: { role: 'user' },
});
const main = (n: number): string =>
  assistant({
    input_tokens: 2,
    cache_read_input_tokens: n - 2 - 100,
    cache_creation_input_tokens: 100,
  });

let dir: string;
let counter = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'context-usage-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  values: Record<string, string>;
}

/** Creates `<config>/projects/p/<id>.jsonl` with the lines and returns the config folder. */
function transcript(id: string, lines: string[]): { config: string; file: string } {
  const config = join(dir, `cfg-${counter++}`);
  const folder = join(config, 'projects', 'p');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${id}.jsonl`);
  writeFileSync(file, lines.join('\n') + '\n');
  return { config, file };
}

function cli(args: string[], env: Record<string, string | undefined>): Run {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.CLAUDE_CODE_SESSION_ID;
  delete clean.CLAUDE_CONFIG_DIR;
  const r = spawnSync('node', ['scripts/ci/contextUsage.mjs', ...args], {
    encoding: 'utf8',
    env: { ...clean, ...env },
  });
  const values: Record<string, string> = {};
  for (const line of r.stdout.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) values[line.slice(0, i)] = line.slice(i + 1);
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, values };
}

describe('CM1 — contextUsage.mjs: the count (decision 2)', () => {
  it('the last message of the main thread wins', () => {
    const text = [main(100_000), user, main(120_000), user].join('\n');
    expect(lastOf(text)).toBe(120_000);
  });

  it('isSidechain, <synthetic>, zero-sum and non-JSON lines are left out', () => {
    const text = [
      main(150_000),
      assistant(
        { input_tokens: 9, cache_read_input_tokens: 900_000 },
        { isSidechain: true },
      ),
      assistant(
        { input_tokens: 5, cache_read_input_tokens: 800_000 },
        { model: '<synthetic>' },
      ),
      assistant({ input_tokens: 0, cache_read_input_tokens: 0 }),
      '{"type":"assistant","message":{"usage":{"input_tok',
    ].join('\n');
    expect(lastOf(text)).toBe(150_000);
  });

  it('a usage without cache_creation_input_tokens counts 0 for it', () => {
    const text = assistant({ input_tokens: 3, cache_read_input_tokens: 40_000 });
    expect(lastOf(text)).toBe(40_003);
  });

  it('without an assistant message with usage it gives null', () => {
    expect(lastOf([user, '', 'not json'].join('\n'))).toBeNull();
    expect(lastOf('')).toBeNull();
  });
});

describe('CM1 — contextUsage.mjs: the CLI (decisions 1 and 3)', () => {
  it('reads the transcript of CLAUDE_CODE_SESSION_ID and prints the keys, with fonte=sessao', () => {
    const { config, file } = transcript('abc', [user, main(112_697)]);
    const r = cli([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'abc' });
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n').map((l) => l.split('=')[0])).toEqual([
      'contexto',
      'mil',
      'acima',
      'fonte',
      'arquivo',
      '',
    ]);
    expect(r.values).toMatchObject({
      contexto: '112697',
      mil: '113',
      acima: 'false',
      fonte: 'sessao',
      arquivo: file,
    });
  });

  it('without the variable, fonte=recente: the newest directly in projects/*/, ignoring subagents/', () => {
    const { config, file } = transcript('old', [main(50_000)]);
    const folder = join(config, 'projects', 'p');
    const newest = join(folder, 'novo.jsonl');
    writeFileSync(newest, main(70_000) + '\n');
    mkdirSync(join(folder, 'novo', 'subagents'), { recursive: true });
    const sub = join(folder, 'novo', 'subagents', 'agent-1.jsonl');
    writeFileSync(
      sub,
      assistant({ input_tokens: 1, cache_read_input_tokens: 900_000 }) + '\n',
    );
    utimesSync(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(
      newest,
      new Date('2026-01-02T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    utimesSync(sub, new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));
    const r = cli([], { CLAUDE_CONFIG_DIR: config });
    expect(r.status).toBe(0);
    expect(r.values).toMatchObject({
      contexto: '70000',
      fonte: 'recente',
      arquivo: newest,
    });
  });

  it('the same id in two projects/ folders: the most recent transcript counts', () => {
    const { config, file } = transcript('dup', [main(10_000)]);
    const other = join(config, 'projects', 'q');
    mkdirSync(other, { recursive: true });
    const newer = join(other, 'dup.jsonl');
    writeFileSync(newer, main(20_000) + '\n');
    utimesSync(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(newer, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
    const r = cli([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'dup' });
    expect(r.values).toMatchObject({
      contexto: '20000',
      fonte: 'sessao',
      arquivo: newer,
    });
  });

  it('--arquivo reads that file, with fonte=arquivo', () => {
    const { file } = transcript('any', [main(33_333)]);
    const r = cli(['--arquivo', file], {});
    expect(r.status).toBe(0);
    expect(r.values).toMatchObject({
      contexto: '33333',
      mil: '34',
      fonte: 'arquivo',
      arquivo: file,
    });
  });

  it('--teto: 300000 is not above, 300001 is (the default is 300000)', () => {
    const a = transcript('a', [main(300_000)]);
    const b = transcript('b', [main(300_001)]);
    const env = (c: string, id: string) => ({
      CLAUDE_CONFIG_DIR: c,
      CLAUDE_CODE_SESSION_ID: id,
    });
    expect(cli([], env(a.config, 'a')).values.acima).toBe('false');
    expect(cli([], env(b.config, 'b')).values.acima).toBe('true');
    expect(cli(['--teto', '299999'], env(a.config, 'a')).values.acima).toBe('true');
    expect(cli(['--teto', '300001'], env(b.config, 'b')).values.acima).toBe('false');
  });

  it('--max prints pct, rounded up, after arquivo=', () => {
    const { file } = transcript('m', [main(350_001)]);
    const r = cli(['--arquivo', file, '--max', '1000000'], {});
    expect(r.status).toBe(0);
    expect(r.values.pct).toBe('36');
    expect(r.stdout.trimEnd().split('\n').pop()).toBe('pct=36');
    expect(cli(['--arquivo', file], {}).values.pct).toBeUndefined();
  });

  it('without a measure gives code 1, with contexto=? and motivo=', () => {
    const empty = transcript('v', [user]);
    const r = cli([], { CLAUDE_CONFIG_DIR: empty.config, CLAUDE_CODE_SESSION_ID: 'v' });
    expect(r.status).toBe(1);
    expect(r.values.contexto).toBe('?');
    expect(r.values.motivo).toBeTruthy();

    const noFile = cli([], {
      CLAUDE_CONFIG_DIR: join(dir, 'does-not-exist'),
      CLAUDE_CODE_SESSION_ID: 'x',
    });
    expect(noFile.status).toBe(1);
    expect(noFile.values.contexto).toBe('?');
    expect(noFile.values.motivo).toBeTruthy();
  });

  // Finding CL1.2: `mil` (rounded up) and `acima` (exact value) must tell the same story.
  it('CL1.2: 300001 gives mil=301 and acima=true; 299500 gives mil=300 and acima=false', () => {
    const a = transcript('a', [main(300_001)]);
    const b = transcript('b', [main(299_500)]);
    const ra = cli([], { CLAUDE_CONFIG_DIR: a.config, CLAUDE_CODE_SESSION_ID: 'a' });
    const rb = cli([], { CLAUDE_CONFIG_DIR: b.config, CLAUDE_CODE_SESSION_ID: 'b' });
    expect(ra.values).toMatchObject({ mil: '301', acima: 'true' });
    expect(rb.values).toMatchObject({ mil: '300', acima: 'false' });
  });

  it('CL1.2: with a ceiling that is a multiple of a thousand, acima=true exactly when the shown mil passes the ceiling in thousands', () => {
    for (const ceiling of [100_000, 250_000, 300_000]) {
      for (const n of [
        ceiling - 1000,
        ceiling - 1,
        ceiling,
        ceiling + 1,
        ceiling + 999,
        ceiling + 1000,
      ]) {
        const t = transcript('t', [main(n)]);
        const r = cli(['--teto', String(ceiling)], {
          CLAUDE_CONFIG_DIR: t.config,
          CLAUDE_CODE_SESSION_ID: 't',
        });
        expect(r.values.acima, `ceiling ${ceiling}, context ${n}`).toBe(
          String(Number(r.values.mil) > ceiling / 1000),
        );
      }
    }
  });

  it('CL1.3: a repeated flag gives code 2 and says which', () => {
    const r = cli(['--teto', '1', '--teto', '2'], {});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--teto.*(repetid|duas vezes)/);
  });

  it('CL1.3: a value that starts with -- gives code 2 and says the flag needs a value', () => {
    const r = cli(['--arquivo', '--x.jsonl'], {});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--arquivo pede um valor/);
    const r2 = cli(['--max', '--teto', '5'], {});
    expect(r2.status).toBe(2);
    expect(r2.stderr).toMatch(/--max pede um valor/);
    const r3 = cli(['--arquivo'], {});
    expect(r3.status).toBe(2);
    expect(r3.stderr).toMatch(/--arquivo pede um valor/);
  });

  it('CL1.3: a stray token gives code 2 and is called stray, in any position', () => {
    for (const args of [
      ['stray', '--teto', '5'],
      ['--teto', '5', 'stray'],
      ['--teto', '5', '7'],
    ]) {
      const r = cli(args, {});
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr, args.join(' ')).toMatch(/Argumento solto/);
    }
  });

  it('a usage error gives code 2, with the message on stderr', () => {
    const r1 = cli(['--teto'], {});
    expect(r1.status).toBe(2);
    expect(r1.stderr).toContain('Uso:');
    const r2 = cli(['--max', 'abc'], {});
    expect(r2.status).toBe(2);
    expect(r2.stderr).toContain('Uso:');
    const r3 = cli(['--desconhecida'], {});
    expect(r3.status).toBe(2);
    expect(r3.stderr).toContain('Uso:');
  });
});

describe('CM1 — flow texts that use the measure (decisions 5 to 10)', () => {
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const supervision = readFileSync('.claude/skills/supervisionar-fila/SKILL.md', 'utf8');

  const phase = section(flow, '## For the phase session');
  const item3 = between(phase, '3. Subagents and effort', '4. Every briefing');
  const ceiling = item3.slice(item3.indexOf('   - **Phase context ceiling:**'));
  const item7 = between(phase, '7. When done, notify', '8. ');

  it('FLOW item 3: the measure is the script, and get_session is left out because it reads 0 in the turn', () => {
    expect(ceiling).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(ceiling).toContain('`acima=true`');
    expect(ceiling).toContain('300 thousand');
    expect(ceiling).toContain('300,000');
    expect(ceiling).toContain('`external_metadata.context_usage.used_tokens`');
    expect(ceiling).toMatch(/only changes at the end of a turn/);
    expect(ceiling).toContain('item 8');
  });

  it('FLOW item 3: the transition through git show and the "no measurement"', () => {
    expect(ceiling).toContain('git show origin/main:scripts/ci/contextUsage.mjs');
    expect(ceiling).toContain('`Contexto: sem medida (<motivo>)`');
    expect(ceiling).toContain('code 1');
  });

  it('FLOW item 3: the number in the switch request is the mil of the script', () => {
    expect(ceiling).toContain('`mil`');
    expect(ceiling).toContain(
      '`Troca de sessão da fase <código>: contexto <n> mil; passagem em',
    );
  });

  it('FLOW item 7: the final notice carries the Contexto line', () => {
    expect(item7).toContain('`Contexto: <mil> mil`');
    expect(item7).toContain('`Contexto: sem medida (<motivo>)`');
  });

  const context = between(cloud, '**Context up to 300 thousand.**', '\n\n');
  const delivery = between(
    cloud,
    '**Delivery, at the end of the round:**',
    '6. **Paste the Summary',
  );
  const notice = delivery.slice(delivery.indexOf('5. **Notify the coordinator**'));

  it('TESTING-NUVEM: the tester measures before each batch and before the notice, with no new action', () => {
    expect(context).toContain('300 thousand');
    expect(context).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(context).toContain('before handing over each batch');
    expect(context).toContain('before the notice');
    expect(context).toContain('`Context per batch: ');
    expect(context).toContain('"What got in the way"');
    expect(context).toContain('`get_session`');
    expect(context).toContain('or calling the owner');
  });

  it('TESTING-NUVEM: the notice ends with "; contexto <mil> mil" in the three formats', () => {
    expect(notice).toContain('`; contexto <n> mil`');
    expect(notice).toContain('`; contexto sem medida (<reason>)`');
    expect(notice).toContain('19min32s; `contexto ');
    expect(notice).toMatch(/Grupo 2 de 3: [^"]*; `contexto \d+ mil`"/);
    expect(notice).toMatch(/Bloco 2 de 5: [^"]*; `contexto \d+ mil`"/);
  });

  const perStage = section(queue, '## 3. Per stage');
  const switching = section(queue, '## Session switch');

  it('implementar-fila: the fallback check measures with --max and falls back to get_session with no measure', () => {
    const check = between(
      perStage,
      '- At the check, the **first step** is the context',
      '- Then check whether the skill',
    );
    expect(check).toContain('`node scripts/ci/contextUsage.mjs --max <max_tokens>`');
    expect(check).toContain('`painel.py context <folder> --medir --max <max_tokens>`');
    expect(check).toContain('`painel.py context <folder> <pct> --fonte get_session`');
    expect(check).toContain('`pct`');
    expect(check).toContain('`used_tokens`');
  });

  it('implementar-fila: step 3 of "In the new session" records the context with --medir --max <max_tokens>', () => {
    const fresh = between(queue, '**In the new session**', '## End');
    expect(fresh).toContain('--medir --max <max_tokens>');
    expect(fresh).not.toContain('`painel.py context <pasta> <pct>`');
    expect(fresh).not.toContain('`painel.py context <folder> <pct>`');
  });

  it('implementar-fila: the "Session switch" measures with --max and the ctx of its own cost comes from the script', () => {
    expect(switching).toContain('`node scripts/ci/contextUsage.mjs --max <max_tokens>`');
    expect(switching).toContain('`painel.py context <pasta> --medir --max <max_tokens>`');
    expect(switching).toContain('`painel.py context <pasta> <pct> --fonte get_session`');
    const old = between(
      switching,
      '**In the old session:**',
      '2. Create the new session',
    );
    expect(old).toContain('`ctx`');
    expect(old).toContain("the script's `contexto`");
    expect(old).toContain('`usd`');
  });

  it('implementar-fila: "Cost" has the still-working case and the sentinel with the divergent log', () => {
    const cost = between(
      perStage,
      '- **Cost:**',
      '- **Only ids registered in the panel are archived',
    );
    expect(cost).toContain('`status_bucket`');
    expect(cost).toContain('`working`');
    expect(cost).toContain('`ainda trabalhando`');
    expect(cost).toContain('Sentinel');
    expect(cost).toContain('0 ≤ ctx − n ≤ 15');
    expect(cost).toContain(
      '<rótulo>: medida de contexto divergente (aviso <n> mil, get_session <ctx> mil)',
    );
    expect(cost).toContain('The stage does not stop');
  });

  const costText = between(
    perStage,
    '- **Cost:**',
    '- **Only ids registered in the panel are archived',
  );

  it('CL1.1: the "ainda trabalhando" has a limit of 2 repetitions and says what to do in the same cycle as the send_message', () => {
    expect(costText).toMatch(/at most 2 times/);
    expect(costText).toContain('third reading');
    expect(costText).toContain('custo lido com a sessão ainda trabalhando');
    expect(costText).toMatch(/send_message[^.]*same cycle[^.]*next cycle/);
  });

  it('CL1.7: the sentinel only counts with the turn finished and the divergence is a record, never blocks', () => {
    const sentinel = costText.slice(costText.indexOf('**Sentinel:**'));
    expect(sentinel).toMatch(/only counts with the (child's )?turn finished/);
    expect(sentinel).toContain('record');
    expect(sentinel).toMatch(/never (blocks|stops)/);
    expect(sentinel).toContain('is not proof that the measure is wrong');
  });

  it('CL1.6: TESTING-NUVEM keeps the reason for the pkill and the example of the 25,000 cut (they do not belong to the epic)', () => {
    expect(cloud).toContain(
      '`pkill -f chrome` (it kills the shell itself and makes Chrome restore tabs)',
    );
    expect(cloud).toContain('(for example, the 25,000 cut or a missing excerpt)');
    // The ceiling went from 32,000 to 32,500 in stage #1712 (restoring the wording from before PR #1709).
    expect(cloud.length).toBeLessThanOrEqual(32_500);
  });

  it('CL1.5: the hardened measure catches the text that goes back to the old measure (mutation)', () => {
    const phase = section(flow, '## For the phase session');
    const item3 = between(phase, '3. Subagents and effort', '4. Every briefing');
    const ceiling = item3.slice(item3.indexOf('   - **Phase context ceiling:**'));
    const sup = between(
      section(supervision, '## Session switch'),
      '**Size and baseline.**',
      '**Switch on return',
    );
    expect(scriptMeasureProblems(ceiling)).toEqual([]);
    expect(scriptMeasureProblems(sup)).toEqual([]);
    for (const original of [ceiling, sup]) {
      const oldAsInstruction = original
        .replaceAll('`node scripts/ci/contextUsage.mjs`', 'the `get_session`')
        .replace(/It is not the `external/, 'It is the `external')
        .replace(/, not the `external/, ', and the `external');
      // The old assertion (just citing the `used_tokens`) still passes on the mutated text…
      expect(oldAsInstruction).toContain('`external_metadata.context_usage.used_tokens`');
      // …and the new one does not.
      expect(scriptMeasureProblems(oldAsInstruction).length).toBeGreaterThan(0);
    }
  });

  it('implementar-fila: the change is small (the large-skill rule is 60 lines)', () => {
    expect(queue.split('\n').length).toBeLessThan(540);
    expect(section(queue, '## Rules of this queue')).not.toContain('contextUsage');
  });

  it('supervisionar-fila: "Size and baseline" measures through the script, baseline at the end of the first turn and ~50% through the pct', () => {
    const supSwitch = section(supervision, '## Session switch');
    const size = between(supSwitch, '**Size and baseline.**', '**Switch on return');
    expect(size).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(size).toContain('`contexto`');
    expect(size).toContain('--max <max_tokens>');
    expect(size).toContain('`pct`');
    expect(size).toContain("end of this session's first turn");
    expect(size).toContain('~50%');
    expect(size).toContain('`external_metadata.context_usage.used_tokens`');
  });
});
