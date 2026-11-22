// @vitest-environment node
// Phase GW4 (stage #2293, decisions 9 to 11; absorbed #2325 and #2326): the re-entry of a refused fast track is decided by
// two GitHub times (the latest `labeled` event against the latest `Via rápida recusada:` comment), and the answers that
// arrive after the End (`soltar #<n>`, `retomar fila`) have a path through the registered coordinator. Text tests over the
// `implementar-fila` skill and the changelog: every missing anchor throws an error (`tests/support/textSlice.ts`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';
import { PROTOCOL_TERMS } from './portugueseAllowlist';

const read = (path: string): string => readFileSync(path, 'utf8');
const QUEUE = read('.claude/skills/implementar-fila/SKILL.md');
const CHANGELOG = read('changelog/queue-graph-waves.md');

const has = (label: string, text: string, parts: string[]): void => {
  for (const p of parts) expect(text, `${label}: ${p}`).toContain(p);
};

const step1 = (): string => {
  const queue = section(QUEUE, '## 2. Queue');
  return queue.slice(queue.indexOf('1. `list_issues`'), queue.indexOf('\n2. '));
};

const changes = (): string => section(QUEUE, '## Queue changes during the run');
const newReady = (): string =>
  changes().slice(
    changes().indexOf('- **New `ready`.**'),
    changes().indexOf('- **The owner asks'),
  );
const stoppedReady = (): string =>
  changes().slice(changes().indexOf('- **An issue that stopped being `ready`**'));

describe('implementar-fila: the re-entry clock is GitHub against GitHub (decision 9)', () => {
  it('"2. Queue", step 1: the briefing reads the comments in the same call as the events and compares with the refusal comment', () => {
    has('step 1', step1(), [
      '`GET repos/fabianofranca/mapping/issues/<n>/events`',
      '`GET repos/fabianofranca/mapping/issues/<n>/comments`',
      '`Via rápida recusada:`',
      '`created_at`',
      'same call',
      "row's `ended`",
      'only when there is no such comment',
      '`#n reentra kind=',
      '`#n recusada: label anterior à recusa`',
    ]);
    expect(step1()).not.toContain("later than the row's `ended`");
  });

  it('"Queue changes during the run": the two items say the same', () => {
    for (const [label, text] of [
      ['New ready', newReady()],
      ['stopped being ready', stoppedReady()],
    ] as const) {
      has(label, text, [
        '`Via rápida recusada:`',
        '`created_at`',
        "row's `ended`",
        'only when there is no such comment',
      ]);
      expect(text, label).not.toContain("later than the row's `ended`");
      expect(text, label).not.toContain("after the row's `ended`, decision 1");
    }
  });
});

describe('implementar-fila: the answers that arrive after the End have a path (decisions 10 and 11)', () => {
  const end = (): string => section(QUEUE, '## End');

  it('"End": a late `soltar #<n>` is served by the registered coordinator, with `start` and a new fallback check or `end` again', () => {
    has('end', end(), [
      'Late answers, after the End',
      '`soltar #<n>`',
      '`painel.py roles`',
      "row '#n' plan=",
      '`pergunta',
      '`painel.py show`',
      '`começar agora:`',
      '`painel.py start',
      '`painel.py reserve`',
      'new fallback check',
      '`painel.py end`',
    ]);
  });

  it('"End": `retomar fila` is the owner\'s own message, re-reads step 1 of "2. Queue" and is never a bare `retomar`', () => {
    const text = end();
    has('end', text, [
      '`retomar fila`',
      "owner's own message",
      'step 1 of "2. Queue"',
      '`retomar anterior=<id>`',
      '"Arguments"',
      'bare `retomar`',
    ]);
    // Every `retomar` in the section is `retomar fila`, `retomar anterior=<id>` or the "bare `retomar`" that is refused.
    for (const m of text.matchAll(/retomar(?! fila| anterior=)/g)) {
      expect(text.slice(m.index - 6, m.index), 'bare retomar').toBe('bare `');
    }
  });

  it('"End": the table lists each `recusada` row under "o que espera o dono", with the hint `retomar fila`', () => {
    const text = end();
    const table = text.slice(text.indexOf('With nothing pending from the queue:'));
    has('table', table, ['`recusada` row', 'o que espera o dono', '`retomar fila`']);
  });

  it('"End": a session that is no longer the registered one forwards the late answer', () => {
    const late = end().slice(end().indexOf('Late answers, after the End'));
    has('late', late, ['no longer the registered one', 'forwards', '"Session switch"']);
  });

  it('"3. Per stage": the `soltar` text of the hourly check points to the late path of "End"', () => {
    const hourly = section(QUEUE, '## 3. Per stage').split('**Fallback checks:**')[1]!;
    const soltar = hourly.slice(hourly.indexOf('`soltar #<n>`: '));
    has('hourly', soltar.slice(0, soltar.indexOf('A redone ficha')), [
      '"End" › "Late answers, after the End"',
    ]);
  });
});

describe('the `retomar fila` command and the records (GW4)', () => {
  it('`retomar fila` is a frozen protocol term of the skill (owner chat)', () => {
    const term = PROTOCOL_TERMS.find((t) => t.term === 'retomar fila');
    expect(term).toBeDefined();
    expect(term!.source).toBe('.claude/skills/implementar-fila/SKILL.md');
    expect(term!.group).toBe('owner-chat');
    expect(QUEUE).toContain('`retomar fila`');
  });

  it('the changelog records the re-entry by the GitHub clock and the late answers under `## Corrigido`', () => {
    const fixed = section(CHANGELOG, '## Corrigido');
    has('changelog', fixed, ['re-enters', 'GitHub', 'after the End', '`retomar fila`']);
  });

  it('SKILL.md stays under the 540-line limit of contextUsage.test.ts', () => {
    expect(QUEUE.split('\n').length).toBeLessThan(540);
  });
});
