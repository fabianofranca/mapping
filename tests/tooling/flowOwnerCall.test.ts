// @vitest-environment node
// Phase DN1 (stage #1826, decisions 1 to 6 and 8): "calling the owner" is defined once in the
// "Orchestrator — step by step" (paragraph `**Call the owner:**`), the phase and the tester that do not
// notify follow the ladder of the `implementar-fila` skill before the owner is called, the reviewer's
// "Known limitations" do not repeat the commands of item 6 of the message, and the `code-review` rule
// leaves the list of "## 1. Candidates". Text-only test (reads `docs/FLOW.md` and the `detalhar-backlog` skill).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');

const orchestrator = section(flow, '## Orchestrator — step by step');
const fixPhase = section(flow, '## Fix phase');
const groups = section(flow, '## Directed round in groups');
const fiveBlocks = section(flow, '## Full round in 5 blocks');
const limitations = section(flow, '### Known limitations');
const candidates = section(skill, '## 1. Candidates');

/** Paragraph (block of lines up to the blank line) that starts with `start`. */
function paragraph(text: string, start: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`anchor not found: ${start}`);
  const end = text.indexOf('\n\n', from);
  return text.slice(from, end < 0 ? undefined : end);
}

const limits = (): string => paragraph(orchestrator, '**Limits:**');
const callTheOwner = (): string => paragraph(orchestrator, '**Call the owner:**');

describe('DN1 — "Call the owner" defined once (#1826, decision 1)', () => {
  it('the `**Call the owner:**` paragraph comes right after **Limits**', () => {
    const after = orchestrator.indexOf('\n\n', orchestrator.indexOf('**Limits:**'));
    expect(orchestrator.slice(after + 2).startsWith('**Call the owner:**')).toBe(true);
  });

  it('says PushNotification, AskUserQuestion with the recommended one first, item 8 and the queue', () => {
    const p = callTheOwner();
    expect(p).toContain('`PushNotification`');
    expect(p).toContain('with the reason and the link');
    expect(p).toContain('`AskUserQuestion`');
    expect(p).toContain('with the recommended option first');
    expect(p).toContain('item 8 of "For the phase session"');
    expect(p).toContain('the question belongs to the phase, in its chat');
    expect(p).toContain('`implementar-fila`');
    expect(p).toContain('rules 1 and 2 of "Rules of this queue"');
  });
});

describe('DN1 — the phase that does not notify follows the ladder before calling the owner (decision 2)', () => {
  it('**Limits** carries the ladder: working, resume send_message, recreate once, Call the owner', () => {
    const p = limits();
    expect(p).toContain('`implementar-fila`');
    expect(p).toContain('`working`');
    expect(p).toContain('another fallback check');
    expect(p).toContain(
      '`review_ready` or `idle` with no pending `send_later` of the phase',
    );
    expect(p).toContain(
      '"Conferência do orquestrador: a fase não avisou. Retome do ponto em que parou (CI do PR, merge, aviso) e avise o coordenador."',
    );
    expect(p).toContain('creates the session again **once**');
    expect(p).toContain('a sessão anterior (<id>) parou em: <o que os eventos mostram>');
    expect(p).toMatch(/if it happens again, calls the owner \("Call the owner"/);
  });

  it('a failure or stopped session no longer calls the owner at once', () => {
    expect(limits()).not.toContain(
      'with a failure or a stopped session, the orchestrator calls the owner',
    );
  });

  it('the question of the stopped phase is read "before notifying the owner"', () => {
    expect(limits()).toContain('before notifying the owner');
    expect(limits()).not.toContain('before calling the owner');
  });
});

describe('DN1 — the tester that does not notify follows the same (decision 3)', () => {
  const fallback = (text: string): string => {
    const line = text.split('\n').find((l) => l.startsWith('- **Fallback check:**'));
    if (!line) throw new Error('Fallback check not found');
    return line;
  };

  it('Directed round in groups cites **Limits** and keeps the send_later and the n notices', () => {
    const l = fallback(groups);
    expect(l).toContain('60 min `send_later`');
    expect(l).toContain('**n notices**');
    expect(l).toContain(
      'same as the phase that does not report (**Limits** paragraph of "Orchestrator — step by step")',
    );
    expect(l).not.toMatch(/calls the owner/i);
  });

  it('Full round in 5 blocks cites **Limits** and keeps the send_later and the five notices', () => {
    const l = fallback(fiveBlocks);
    expect(l).toContain('60 min `send_later`');
    expect(l).toContain('**five notices**');
    expect(l).toContain(
      'same as the phase that does not report (**Limits** paragraph of "Orchestrator — step by step")',
    );
    expect(l).not.toMatch(/calls the owner/i);
  });
});

describe('DN1 — the fix that fails again cites "Call the owner" with the same three cases (decision 4)', () => {
  const item = (): string => {
    const line = orchestrator.split('\n').find((l) => l.startsWith('- **with ❌**'));
    if (!line) throw new Error('item "with ❌" not found');
    return line;
  };
  const lastSentence = (): string => {
    const from = fixPhase.lastIndexOf('On the second failure');
    if (from < 0) throw new Error('last sentence of the Fix phase not found');
    return fixPhase.slice(from).trimEnd();
  };

  it('the "with ❌" item of the orchestrator', () => {
    const l = item();
    expect(l).toMatch(/calls the owner \("Call the owner"[^)]*\) if it fails again, /);
    expect(l).toContain(
      'if the finding is about data loss, `mapping.json` integrity or security',
    );
    expect(l).toContain('or if the fix requires a product decision');
  });

  it('the last sentence of the "Fix phase"', () => {
    const f = lastSentence();
    expect(f).toContain('On the second failure');
    expect(f).toContain('data loss, `mapping.json` integrity or security');
    expect(f).toContain('product decision');
    expect(f).toMatch(/the orchestrator calls the owner \("Call the owner"/);
  });
});

describe('DN1 — every "calls the owner" of docs/FLOW.md cites "Call the owner" (decision 1 and acceptance)', () => {
  it('each occurrence, up to the next ". ", ";" or end of line, cites "Call the owner"', () => {
    const missing: string[] = [];
    const lines = flow.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/calls the owner/gi)) {
        const rest = line.slice(m.index);
        const end = rest.search(/\. |;|$/);
        const excerpt = rest.slice(0, end < 0 ? undefined : end);
        if (!excerpt.includes('"Call the owner"'))
          missing.push(`line ${i + 1}: ${excerpt}`);
      }
    });
    expect(missing).toEqual([]);
  });

  it('there are occurrences in the text (the test does not pass empty)', () => {
    expect((flow.match(/calls the owner/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('DN1 — "Known limitations" does not repeat item 6 of the reviewer (decision 5)', () => {
  const item = (): string => {
    const line = limitations.split('\n').find((l) => l.includes('REST API'));
    if (!line) throw new Error('REST API item not found');
    return line;
  };

  it('states only the limitation and points to item 6 of "For the per-epic CR reviewer"', () => {
    const l = item();
    expect(l).not.toMatch(/^- Use the REST API/);
    expect(l).toContain('`gh issue create`, `gh repo clone` and GraphQL');
    expect(l).toContain('item 6 of "For the per-epic CR reviewer"');
  });

  it('without the `gh api -X POST` commands nor the `-X GET` sentence', () => {
    const l = item();
    expect(l).not.toContain('-X POST');
    expect(l).not.toContain('-X GET');
    expect(l).not.toContain('gh api');
  });

  it('item 6 of the reviewer message keeps the commands', () => {
    const message = section(flow, '### For the per-epic CR reviewer');
    const item6 = between(message, '\n6. ', '\n7. ');
    expect(item6).toContain('gh api -X POST repos/fabianofranca/mapping/issues');
    expect(item6).toContain('gh api -X GET search/issues');
  });

  it('the search item (search/issues, 30 calls per minute) remains', () => {
    expect(limitations).toContain('Search (`search/issues`) accepts 30 calls per minute');
  });
});

describe('DN1 — "## 1. Candidates" of detalhar-backlog (decision 6)', () => {
  const steps = (): string[] => candidates.split('\n').filter((l) => /^\d+\. /.test(l));

  it('has 4 numbered steps and "With no candidates" is the 4th', () => {
    const p = steps();
    expect(p).toHaveLength(4);
    expect(p[3]).toBe('4. With no candidates, say so and finish.');
  });

  it('steps 1 to 3 remain (queuePanel reads step 2 between "2. " and "\\n3. ")', () => {
    const p = steps();
    expect(p[0]).toMatch(/^1\. `list_issues`/);
    expect(p[1]).toMatch(/^2\. Keep only those that have \*\*neither\*\* `ready`/);
    expect(p[2]).toMatch(/^3\. Order: /);
  });

  it('the `**Code reviewer issues**` paragraph comes after the list, with the text of the rule', () => {
    const afterList = candidates.slice(candidates.indexOf('4. With no candidates'));
    const p = paragraph(afterList, '**Code reviewer issues**');
    expect(afterList.split('\n\n')[1]).toBe(p);
    expect(p).toContain('(label `code-review`, `docs/PROCESS.md` "Code review")');
    expect(p).toContain(
      'each high or medium defect in it already has its own `bug` issue, cited in the body',
    );
    expect(p).toContain('covers only the findings that do **not** point to a `bug`');
    expect(p).toContain('without detailing the same finding twice');
  });
});
