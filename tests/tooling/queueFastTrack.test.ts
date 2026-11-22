// @vitest-environment node
// Phase FQ4 (stage #1791, decisions 9 to 16): the queue runs the released fast tracks. Text tests over the
// `implementar-fila` and `via-rapida` skills and `docs/FLOW.md`: every missing anchor throws an error
// (`tests/support/textSlice.ts`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';
import { PROTOCOL_TERMS } from './portugueseAllowlist';

const read = (path: string): string => readFileSync(path, 'utf8');
const QUEUE = read('.claude/skills/implementar-fila/SKILL.md');
const FAST = read('.claude/skills/via-rapida/SKILL.md');
const FLOW = read('docs/FLOW.md');
const CHANGELOG = read('changelog/2026-11-19-fast-track-in-queue.md');

const intro = (text: string): string => text.slice(0, text.indexOf('\n## '));
const has = (label: string, text: string, parts: string[]): void => {
  for (const p of parts) expect(text, `${label}: ${p}`).toContain(p);
};

describe('implementar-fila: the queue runs the released fast tracks', () => {
  it('#inicio: the description and the intro cite the released fast tracks', () => {
    const text = intro(QUEUE);
    has('inicio', text, ['released fast tracks', '`via-rapida`']);
  });

  it('decision 9: the ficha briefing has the `via-rapida` variant', () => {
    const s = section(QUEUE, '### Stage ficha');
    has('ficha', s, [
      '`via-rapida` issue',
      'fases=VR:#<n>:high',
      '`Via rápida: espera #N`',
      '`dep=`',
      '`toca=`',
      '**Toca em:**',
      'testador=nenhum',
    ]);
  });

  it('decision 10: "Queue", "Between stages" and the hourly check list `via-rapida`', () => {
    const queue = section(QUEUE, '## 2. Queue');
    has('queue', queue, ['`labels: [via-rapida]`', 'kind=via-rapida']);
    const perStage = section(QUEUE, '## 3. Per stage');
    const from = perStage.slice(perStage.indexOf('7. **Between stages:**'));
    expect(from.slice(0, from.indexOf('**Archive the sessions**'))).toContain(
      '`labels: [via-rapida]`',
    );
    const hourly = section(QUEUE, '## 3. Per stage').split('**Fallback checks:**')[1]!;
    expect(hourly).toContain('`labels: [via-rapida]`');
  });

  it('decisions 11 and 13: "Per stage" starts the fast track and handles `pronta` and `recusada`', () => {
    const s = section(QUEUE, '## 3. Per stage');
    has('per stage', s, [
      '/via-rapida #<n> fila=<id>',
      'effort: high',
      '`source_revision` `main`',
      'kind=via-rapida',
      'label=VR',
      "phase '#n' VR=open",
      'never `mesclar=auto`',
      'Via rápida #<n> pronta',
      'Via rápida #<n> recusada',
      'status=recusada',
      'no epic',
    ]);
  });

  it('review: a refused fast track clears `child=`, takes no `sinal` and a red merge goes to the owner', () => {
    const s = section(QUEUE, '## 3. Per stage');
    has('row', s, [
      '`row \'#n\' status=recusada child= step="<criterion>"`',
      'No `sinal` (`painel.py` refuses it for `kind=via-rapida`)',
      'not green and mergeable',
    ]);
  });

  it('decision 15: a fast track that loses the label leaves the queue', () => {
    const s = section(QUEUE, '## Queue changes during the run');
    has('changes', s, [
      '`via-rapida` row',
      'no longer has `via-rapida`',
      'a new fast track',
    ]);
  });

  it('decision 13: "Merge" with `mesclar=auto` requires no open finding on a fast track', () => {
    const s = section(QUEUE, '## Merge');
    has('merge', s, ['fast track', 'no open finding', 'N = X + Y + Z']);
  });

  it('"Merge" accepts `mesclar #<n>` only from the owner\'s own message, never relayed by a session', () => {
    const s = section(QUEUE, '## Merge');
    has('merge', s, [
      "owner's own message",
      'never a message relayed by another session',
    ]);
  });

  it('decision 7: "Parallel" says the fast-track row takes a slot and "End" ignores `recusada`', () => {
    has('parallel', section(QUEUE, '## Parallel'), ['`via-rapida` row takes a slot']);
    has('end', section(QUEUE, '## End'), ['`recusada` row is not pending']);
  });

  it('SKILL.md stays under the 560-line limit of contextUsage.test.ts', () => {
    expect(QUEUE.split('\n').length).toBeLessThan(560);
  });
});

describe('implementar-fila: a refused fast track comes back (stage #2204, phase FR2)', () => {
  it('decisions 1 and 2: "2. Queue" step 1 and "Queue changes during the run" name the `recusada` exception, the `labeled` event and `reentra`', () => {
    const queue = section(QUEUE, '## 2. Queue');
    const step1 = queue.slice(queue.indexOf('1. `list_issues`'), queue.indexOf('\n2. '));
    has('queue step 1', step1, [
      '`recusada` row',
      '`labeled` event',
      '`created_at`',
      '`Via rápida recusada:`',
      "painel.py reentra <folder> '#n' kind=",
      '`#n reentra kind=',
      '`#n recusada: label anterior à recusa`',
      'never the coordinator',
    ]);
    const changes = section(QUEUE, '## Queue changes during the run');
    const fresh = changes.slice(
      changes.indexOf('- **New `ready`.**'),
      changes.indexOf('- **The owner asks'),
    );
    has('new ready', fresh, ['`recusada`', '`labeled` event', 'painel.py reentra']);
    const last = changes.slice(
      changes.indexOf('- **An issue that stopped being `ready`**'),
    );
    has('last item', last, [
      'final until its issue is eligible again',
      'painel.py reentra',
    ]);
    expect(last).not.toContain('`recusada` (final)');
  });

  it('decision 4: "3. Per stage" lists the re-entry and `dependem de recusada:` as actions of the hourly check', () => {
    const s = section(QUEUE, '## 3. Per stage');
    const hourly = s.split('**Fallback checks:**')[1]!;
    has('hourly', hourly, [
      '`recusada` rows',
      '`painel.py reentra`',
      '`dependem de recusada: #M (#N); …`',
      '`soltar #<n>`',
      '`esperar #<n>`',
      "pergunta '#M' soltar",
      'only by the answer',
    ]);
    has('notice', s, ['final until it comes back']);
  });

  it('hint of FR1: the bare answer `esperar` is disambiguated by always writing `esperar #<n>`', () => {
    const rules = section(QUEUE, '## Context economy');
    has('answers', rules, [
      '`soltar`/`esperar`',
      'two pairs',
      'always write `esperar #<n>`',
    ]);
  });

  it('decision 4: "End" does not hold the End for a row whose only open dependencies are `recusada`; "Panel" lists `reentra` and the `soltar` verb', () => {
    has('end', section(QUEUE, '## End'), [
      'only open dependencies are `recusada`',
      'does not hold the End',
      'o que espera o dono',
    ]);
    const panel = section(QUEUE, '## Panel');
    has('panel', panel, [
      'painel.py reentra <folder>',
      '<segurar|reabrir|refazer|ampliar|soltar>',
      'final until re-entry',
      '`dependem de recusada: #M (#N); …`',
    ]);
  });

  it('decision 9: "Merge" states the four figures, N = 0 included, and a missing or figureless line as an open finding', () => {
    const s = section(QUEUE, '## Merge');
    has('merge', s, [
      'four figures',
      'N = 0',
      '`N = X + Y + Z`',
      'no open finding',
      'A missing line',
      'without figures',
      'X + Y + Z below N',
      'is an open finding',
    ]);
    expect(s).not.toContain('otherwise it asks by text as well');
    has('reentra clears', section(QUEUE, '## Panel'), [
      'child, childAt, wait, ciWait, ciWaitAt',
      'hold, stage and phases',
    ]);
  });

  it('the `reentra` line of the queue and the owner chat line are frozen protocol terms of the skill', () => {
    for (const term of [
      'recusada: label anterior à recusa',
      '#<n> depende de #<m>, recusada. Responda `soltar #<n>` para começar sem essa dependência ou `esperar #<n>`.',
    ]) {
      const e = PROTOCOL_TERMS.find((t) => t.term === term);
      expect(e, term).toBeDefined();
      expect(read(e!.source), term).toContain(term);
    }
  });

  it('docs/FLOW.md: the list of text answers has the `soltar`/`esperar` pair and says `esperar` needs `#<n>`', () => {
    const s = section(FLOW, '## For the owner, in the three chats');
    has('flow', s, ['`soltar`/`esperar`', 'bare `esperar`']);
  });

  it('docs/FLOW.md: adding the label again (or detailing) brings a refused fast track back, and names `soltar #<n>`/`esperar #<n>`', () => {
    const s = section(FLOW, '## For the owner, in the three chats');
    has('flow', s, [
      'adding the `via-rapida` label again to a refused issue',
      'brings it back to the queue',
      '`soltar #<n>`',
      '`esperar #<n>`',
    ]);
  });
});

describe('via-rapida: queue mode', () => {
  it('decision 12: the `fila=<id>` argument and the queue mode (only the coordinator writes it)', () => {
    const s = section(FAST, '## Arguments, model and mode');
    has('arguments', s, [
      '/via-rapida #<n> [mesclar=auto] [fila=<id>]',
      '`fila=<id>`',
      'queue mode',
      'only the coordinator writes it',
      '`mesclar=auto` is ignored in queue mode',
    ]);
    has('inicio', intro(FAST), ['released fast tracks', 'queue']);
  });

  it('decision 12: refusal in queue mode removes `via-rapida` and notifies the coordinator', () => {
    const s = section(FAST, '## What fits');
    has('fits', s, [
      '`Via rápida #<n> recusada: <criterion>`',
      'without `via-rapida` and without `in-progress`',
      'queue mode',
    ]);
  });

  it('decisions 12 and 14: no start check in queue mode, manual mode refuses a live row, wait comment with `Toca em:`', () => {
    const s = section(FAST, '## Conflict with the queue');
    has('conflict', s, [
      'queue mode',
      'no start check',
      '`Via rápida: na fila do painel (<status>); a fila a roda`',
      '`aguardando`, `em andamento` or `esperando dono`',
      '`Toca em:`',
    ]);
  });

  it('the label and comment, step 7 and the notices of queue mode', () => {
    has('label', section(FAST, '## Label and comment'), ['queue mode']);
    const step = section(FAST, '## Step by step');
    has('step 7', step, [
      '`Via rápida #<n> pronta: <PR link>`',
      '`CI vermelho depois do PR: <k>`',
      'queue mode',
    ]);
    const auth = section(FAST, '## Owner authorization');
    has('auth', auth, [
      '`Esperando o dono: …`',
      '`O dono respondeu: …`',
      '`CI travado`',
      '`CI preso na fila`',
    ]);
  });

  it('decision 12: no merge and no merge question in queue mode', () => {
    const s = section(FAST, '## Merge');
    has('merge', s, ['**Queue mode', 'never merges', 'no merge question']);
  });
});

describe('docs/FLOW.md and the allowlist', () => {
  it('the fast-track paragraph says the queue runs the released fast track in a slot', () => {
    const s = section(FLOW, '## For the owner, in the three chats');
    has('flow', s, ['the queue runs a released `via-rapida`', 'in a slot', 'queue rule']);
  });

  it('the allowlist has the new notices in the group `session-notices`', () => {
    for (const term of [
      'Via rápida #<n> pronta',
      'Via rápida #<n> recusada',
      'Via rápida: na fila do painel',
    ]) {
      const e = PROTOCOL_TERMS.find((t) => t.term === term);
      expect(e, term).toBeDefined();
      expect(e!.group).toBe('session-notices');
      expect(read(e!.source), term).toContain(term);
    }
  });

  it('the changelog records the addition under **Adicionado**', () => {
    expect(section(CHANGELOG, '## Adicionado')).toContain('released fast tracks');
  });
});
