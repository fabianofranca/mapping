// @vitest-environment node
// Phase FS1 (stage #1322): the queue without waiting. Checks, by reading the delivery flow files,
// that the queue skill chooses the MCP version at the closing, runs the dependent fix as a `ready`
// `bug`, does not count a stopped stage as a slot, checks its own `bug` rows at the end and closes
// during the CI, and that the panel no longer keeps the issues table.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const QUEUE = '.claude/skills/implementar-fila';
const read = (p: string): string => readFileSync(p, 'utf8');
const queue = read(`${QUEUE}/SKILL.md`);
const detail = read('.claude/skills/detalhar-backlog/SKILL.md');
const flow = read('docs/FLOW.md');
const processDoc = read('docs/PROCESS.md');
const page = read(`${QUEUE}/painel/index.html`);
const painelPy = read(`${QUEUE}/painel/painel.py`);

describe('implementar-fila: MCP version at the closing (decision 1)', () => {
  const rules = section(queue, '## Rules of this queue');
  const rule3 = rules.slice(rules.indexOf('\n3. '));

  it('rule 3 says the version is provisional and chosen at the closing', () => {
    expect(rule3).toContain('provisional');
    expect(rule3).toContain('chosen at the closing');
    expect(rule3).toContain('git merge origin/main');
    expect(rule3).toContain('tests/mcp/version.test.ts');
    expect(rule3).not.toContain('fixed at the start');
  });

  it('step 1 of "Per stage" uses the provisional version, not a fixed one', () => {
    const perStage = section(queue, '## 3. Per stage');
    expect(perStage).toContain('provisional MCP version');
    expect(perStage).not.toContain('Fix the MCP version');
  });

  it('the closing chooses the version before the push and the Merge checks the SERVER_VERSION of origin/main', () => {
    const perStage = section(queue, '## 3. Per stage');
    expect(perStage).toContain('SERVER_VERSION');
    const merge = section(queue, '## Merge');
    expect(merge).toContain('SERVER_VERSION');
    expect(merge).toContain('origin/main');
  });
});

describe('implementar-fila: parallel and order (decisions 2 and 3)', () => {
  const parallel = section(queue, '## Parallel');

  it('"Parallel" no longer has the MCP clause', () => {
    expect(parallel).not.toMatch(/do not change the MCP/);
    expect(parallel).toMatch(/do not change the schema at the same time/);
    expect(parallel).toContain('mcp/version.ts');
  });

  it('only `em andamento` takes a slot and the "Toca em:" are also compared with the stopped stages', () => {
    expect(parallel).toContain('only the `em andamento` stages take a slot');
    expect(parallel).toContain('esperando dono');
    expect(parallel).toMatch(/stopped/);
  });

  it('the "Order" no longer talks about the order of the versions', () => {
    expect(section(queue, '## 2. Queue')).not.toContain('order of the versions');
  });
});

describe('implementar-fila: a dependent fix becomes a ready bug (decisions 4 and 5)', () => {
  const perStage = section(queue, '## 3. Per stage');
  const changes = section(queue, '## Queue changes during the run');

  it('the fix step separates the findings that depend on another epic and creates the `ready` `bug`', () => {
    expect(perStage).toContain('depende de #N');
    expect(perStage).toContain('(correção que depende de #N)');
    expect(perStage).toContain('**Depende de:** #N');
    expect(perStage).toContain('severity: high');
    expect(perStage).toContain('`kind=bug`');
  });

  it("the queue's own `bug` enters even with the `#n ...` list", () => {
    expect(changes).toContain('kind=bug');
    expect(changes).toContain('`#n ...` list');
  });
});

describe('implementar-fila: the End checks the queue bug rows (decision 6)', () => {
  const end = section(queue, '## End');

  it('checks the kind=bug rows before ending', () => {
    expect(end).toContain('kind=bug');
    expect(end).toContain('aguardando');
    expect(end).toContain('falhou');
    expect(end).toContain('esperando dono');
  });
});

describe('detalhar-backlog: Depende de (decision 7)', () => {
  it('requires Depende de on the ready and in-progress ones with a file in common', () => {
    expect(detail).toContain('`ready` or `in-progress`');
    expect(detail).toContain('file in common');
    expect(detail).toContain('mcp/version.ts');
    expect(detail).not.toContain('fixed when the epic starts');
    expect(detail).toContain('chosen at the epic closing');
  });

  it("the coordinator compares the round's ready ones when receiving each PRONTA", () => {
    const during = section(detail, '## 4. During');
    expect(during).toContain('Sobreposição');
    expect(during).toContain('Depende de');
    expect(during).toContain('ORDEM');
  });
});

describe('implementar-fila: closing during the CI (decision 9)', () => {
  it('the issues for what was left for later and the comment go out through a subagent during the CI', () => {
    const perStage = section(queue, '## 3. Per stage');
    expect(perStage).toContain('during the CI');
    expect(perStage).toContain('Closes #<etapa>');
    const merge = section(queue, '## Merge');
    expect(merge).toContain('does not wait');
    expect(merge).toContain('subagent');
  });
});

describe('docs: process and messages (decision 8)', () => {
  it('the "MCP version per epic" item says the version is provisional until the closing', () => {
    expect(processDoc).toContain('provisional until the closing');
    expect(processDoc).toContain('next free one on `origin/main`');
  });

  it('the FLOW cites the news of the queue and of the detailing', () => {
    expect(flow).toContain('MCP version at closing');
    expect(flow).toContain('`Depende de` covers the `ready` and `in-progress` ones');
    const fix = section(flow, '## Fix phase');
    expect(fix).toContain('depende de #N');
    expect(fix).toContain('`ready` `bug`');
  });
});

describe('panel without the issues table (decision 10)', () => {
  it('the page swaps the section for the card with the GitHub search link', () => {
    expect(page).not.toContain('Bugs and roadmaps per stage');
    expect(page).not.toContain('mp-issues');
    expect(page).toContain('Issues created by the queue');
    expect(page).toContain(
      'https://github.com/fabianofranca/mapping/issues?q=is%3Aissue+is%3Aopen+%22Origem%3A+etapa%22',
    );
  });

  it('painel.py has neither the issue subcommand nor issues.json', () => {
    expect(painelPy).not.toContain('issues.json');
    expect(painelPy).not.toContain('cmd_issue');
    const dir = mkdtempSync(path.join(tmpdir(), 'painel-nw-'));
    try {
      execFileSync('python3', [`${QUEUE}/painel/painel.py`, 'init', dir]);
      expect(existsSync(path.join(dir, 'issues.json'))).toBe(false);
      expect(() =>
        execFileSync(
          'python3',
          [`${QUEUE}/painel/painel.py`, 'issue', dir, 'number=#1'],
          {
            stdio: 'pipe',
          },
        ),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the queue skill and detalhar-backlog require the `Origem: etapa #<n>` line', () => {
    expect(queue).toContain('Origem: etapa #<n>');
    expect(detail).toContain('Origem: etapa #<n>');
    expect(queue).not.toContain('in the `issues` dataset');
    expect(queue).not.toContain('painel.py issue');
  });

  it('the closing swaps files/index.html and deletes datasets/issues of the published panel', () => {
    const perStage = section(queue, '## 3. Per stage');
    expect(perStage).toContain('datasets/issues');
    expect(perStage).toContain('files/index.html');
  });
});

describe('implementar-fila: new skill on main (decision 11)', () => {
  const switching = section(queue, '## Session switch');

  it('a large change becomes a session switch, with the lineage checked first', () => {
    // CR1 (owner decision of 2026-11-10, comment on #1324): 60 lines, or a change in "Rules of this queue".
    expect(switching).toContain('more than 60 changed lines');
    expect(switching).not.toContain('more than 30 changed lines');
    expect(switching).toContain('a change in "Rules of this queue"');
    expect(switching).not.toContain('Context economy", "Per stage"');
    expect(switching).toContain('git diff --numstat');
    expect(switching).toMatch(
      /lineage[\s\S]*before that switch|before that switch[\s\S]*lineage/,
    );
  });

  it('a small change is a reread of the whole SKILL.md, with proof in the log', () => {
    expect(switching).toContain('the whole `SKILL.md`, never just the diff');
    expect(switching).toContain('skill <commit>: <regra> → <o que faço agora>');
  });

  it('the reread uses Read without offset or limit, and the proof starts with "relido inteiro, <n> linhas" (RS1, decision 8)', () => {
    const small = switching.slice(switching.indexOf('**Small:**'));
    expect(small).toContain('`Read`');
    expect(small).toContain('without `offset` or `limit`');
    expect(small).toContain('skill <commit>: relido inteiro, <n> linhas');
    expect(small).toMatch(/`git diff --numstat` is only for classifying/);
    expect(small).toMatch(/`SKILL.md` diff is not opened before/);
    const fallback = between(queue, '**Fallback checks:**', '**Red CI');
    expect(fallback).toContain('`Read`');
    expect(fallback).toContain('without `offset` or `limit`');
  });

  it('the reread is an exception to the context economy: it is neither delegated nor summarized (RS1, decision 8)', () => {
    const economy = section(queue, '## Context economy');
    const item = economy
      .split('\n')
      .find((l) => /^\d+\. \*\*Rereading the skill/.test(l));
    expect(item).toBeDefined();
    expect(item).toMatch(/exception/);
    expect(item).toMatch(/not delegated to a subagent nor summarized/);
  });
});

describe('/code-review high review of the epic (closing of stage #1322)', () => {
  it('FLOW.md no longer says the switch is only by context and cites the large skill', () => {
    const line = flow
      .split('\n')
      .find((l) => l.startsWith('To implement all the `ready` ones in sequence'))!;
    expect(line).not.toMatch(/is only by context/);
    expect(line).toMatch(/large new skill on `main`/);
  });

  it('FLOW.md uses the 60-line or "Rules of this queue" criterion and the reread with Read (RS1, decision 9)', () => {
    const line = flow
      .split('\n')
      .find((l) => l.startsWith('To implement all the `ready` ones in sequence'))!;
    expect(line).toContain(
      'more than 60 changed lines or a change in "Rules of this queue"',
    );
    expect(line).not.toContain('more than 30 lines');
    expect(line).toMatch(
      /rereading the whole `SKILL.md` with `Read` and proof in the `log`/,
    );
  });

  it('version changed at the closing: the old rc does not go away by itself and the new number redoes the rc', () => {
    const rules = section(queue, '## Rules of this queue');
    expect(rules).not.toMatch(/does not need to be redone/);
    expect(rules).toMatch(/rc of the old number/);
    expect(rules).toMatch(/MCP pre-release/);
  });

  it('the merge without the closing comment id posts a new comment', () => {
    const per = section(queue, '## 3. Per stage');
    expect(per).toMatch(/without the closing comment's id[^\n]*new comment/);
  });

  it('the End does not require a blind "none waiting" and handles the queue\'s `bug`', () => {
    const end = section(queue, '## End');
    expect(end).not.toMatch(/When no stage is waiting or in progress/);
    expect(end).toMatch(/apart from the queue's own `bug` rows/);
  });

  it('detalhar-backlog checks for cycles before adding Depende de', () => {
    expect(detail).toMatch(/transitive dependency|cycle/);
  });

  it('PROCESS.md keeps the check trigger and the changelog title on the provisional version', () => {
    expect(processDoc).toMatch(
      /what goes in the release changed without raising the version/,
    );
    expect(processDoc).toMatch(/changelog title/);
  });
});
