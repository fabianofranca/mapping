// @vitest-environment node
// Phase FQ3 (stage #1791): the queue skill fixes. Checks, by reading the delivery flow files, that
// the resume never reorders the queue (decision 1), that the successor message and the lineage
// limit command do not copy the resume arguments (decision 2, finding 3 of #1789), that the merge
// is asked by text and served late, after the End (decision 3, finding 4), and that the End runs
// `painel.py end` (decision 6).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const read = (p: string): string => readFileSync(p, 'utf8');
const skill = read('.claude/skills/implementar-fila/SKILL.md');
const flow = read('docs/FLOW.md');

describe('implementar-fila: resume without reordering (decision 1)', () => {
  const start = section(skill, '## 1. Start');
  const step5 = start.slice(start.indexOf('5. With `retomar`'));

  it('step 5 no longer sends the session back to step 4 of "Queue"', () => {
    expect(step5).not.toMatch(/step 4 of "Queue"/);
  });

  it('step 5 continues where it left off, without steps 4 to 7 of "Queue"', () => {
    expect(step5).toContain('continues where it left off');
    expect(step5).toMatch(/steps 4 to 7 of "2\. Queue"/);
    expect(step5).toContain('Queue changes during the run');
  });
});

describe('implementar-fila: successor message (decision 2, finding 3 of #1789)', () => {
  const lineage = between(skill, '**Lineage limit.**', '**In the old session:**');
  const oldSession = between(skill, '**In the old session:**', '**In the new session**');
  const message = oldSession.slice(oldSession.indexOf('- message:'));

  it.each([
    ['"Lineage limit" command', lineage],
    ['the successor message', message],
  ])(
    '%s leaves out painel=, importar=, retomar and anterior= from the copied arguments',
    (_n, text) => {
      for (const arg of ['`painel=`', '`importar=`', '`retomar`', '`anterior=`']) {
        expect(text).toContain(arg);
      }
      expect(text).toMatch(/except/);
      expect(text).not.toContain("this session's same arguments");
    },
  );

  it('the successor message still copies `mesclar=auto` only when the owner wrote it', () => {
    expect(message).toContain('`mesclar=auto` only if the owner wrote it');
    expect(message).toContain('`sem-confirmar`');
  });
});

describe('implementar-fila: merge asked by text (decision 3, finding 4 of #1789)', () => {
  const merge = section(skill, '## Merge');
  const dflt = between(merge, '- **Default**', '- **With `mesclar=auto`**');

  it('"Default" does not use the question picker', () => {
    expect(dflt).not.toContain('AskUserQuestion');
    expect(dflt).not.toContain('Mesclar (Recomendado)');
    expect(dflt).toContain('PushNotification');
  });

  it('"Default" writes the chat line with `mesclar #<n>` and `ainda não #<n>`', () => {
    expect(dflt).toContain('#<n> pronta para mesclar: <resumo>. PR: <link>.');
    expect(dflt).toContain('`mesclar #<n>`');
    expect(dflt).toContain('`ainda não #<n>`');
  });

  it('"Default" records the wait on the panel and ends the turn', () => {
    expect(dflt).toContain('wait="merge pedido ao dono: PR #<p>"');
    expect(dflt).toContain('status="esperando dono"');
    expect(dflt).toMatch(/end the turn/);
    expect(dflt).toMatch(/no `child`/);
  });

  it('"mesclar #<n>" runs the pre-merge check and merges; "ainda não #<n>" only logs', () => {
    expect(merge).toContain('`pode mesclar #<n>`');
    expect(merge).toMatch(/`ainda não #<n>`[^\n]*`log`/);
    expect(merge).toContain('merge_pull_request');
  });

  it('the late merge after the End is served by the registered coordinator', () => {
    expect(merge).toMatch(/after the End/);
    expect(merge).toContain('`painel.py end <folder>`');
  });

  it('`mesclar=auto` keeps merging straight away', () => {
    expect(merge).toContain('**With `mesclar=auto`**');
    expect(merge).toContain('"#<n> mesclada: <resumo>"');
  });
});

describe('implementar-fila: End runs `painel.py end` (decision 6)', () => {
  const end = section(skill, '## End');

  it('step 2 runs `painel.py end <folder>`', () => {
    const step2 = between(end, '2. Run `painel.py end', '3. Send');
    expect(step2).toContain('painel.py end <folder>');
  });

  it('serves a late `mesclar #<n>` after the End', () => {
    expect(end).toContain('`mesclar #<n>`');
    expect(end).toMatch(/late/i);
    expect(end).toContain('merge pedido ao dono:');
  });
});

describe('docs/FLOW.md: the merge is requested by text (decision 3)', () => {
  it('the sentence about the merge of each epic cites `mesclar #<n>`, not the question picker', () => {
    expect(flow).toContain('The merge of each epic is requested from the owner by text');
    expect(flow).toContain('`mesclar #<n>`');
    expect(flow).not.toContain('requested from the owner through the question picker');
  });
});
