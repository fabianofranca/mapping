// @vitest-environment node
// Phase VR2 (stage #1864, decisions 1 to 15): the `via-rapida` skill and the "except the fast track"
// exception in `CLAUDE.md`, `docs/PROCESS.md`, `docs/FLOW.md` and `supervisionar-fila`. Text tests: every
// missing anchor throws an error (`tests/support/textSlice.ts`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const read = (path: string): string => readFileSync(path, 'utf8');
const SKILL = read('.claude/skills/via-rapida/SKILL.md');
const FLOW = read('docs/FLOW.md');
const PROCESS = read('docs/PROCESS.md');
const CLAUDE = read('CLAUDE.md');
const SUPERVISOR = read('.claude/skills/supervisionar-fila/SKILL.md');
const DETALHAR = read('.claude/skills/detalhar-backlog/SKILL.md');

describe('skill via-rapida', () => {
  it('has the frontmatter with name and the usage triggers in the description', () => {
    const m = SKILL.match(/^---\nname: via-rapida\ndescription: (.+)\n---\n/);
    expect(m).not.toBeNull();
    for (const trigger of ['fast track', 'small process tweak', '/via-rapida']) {
      expect(m![1], trigger).toContain(trigger);
    }
  });

  it('decision 1: arguments, Sonnet in Auto mode with effort high, checks the model and edits directly', () => {
    expect(SKILL).toContain('/via-rapida #<n> [mesclar=auto]');
    for (const s of [
      'Sonnet',
      '**Auto** mode',
      'effort: high',
      'session_context.model',
    ]) {
      expect(SKILL, s).toContain(s);
    }
    expect(SKILL).toContain('with no editing subagent');
    expect(SKILL).toContain('the supervision does not include it in the command');
  });

  it('decision 2: roadmap or bug straight to in-progress, never through ready, with the `Via rápida:` comment', () => {
    const s = section(SKILL, '## Label and comment');
    for (const t of [
      'in-progress',
      '`Via rápida:`',
      'full list of labels',
      'never goes through `ready`',
      'painel.py toca',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decision 3: merge with the "Mesclar" of the owner, and `mesclar=auto` only written by them', () => {
    const s = section(SKILL, '## Merge');
    for (const t of [
      'PushNotification',
      'AskUserQuestion',
      'Mesclar (Recomendado)',
      'Ainda não',
      'merge_method: merge',
      '`mesclar=auto`',
      'is never added on its own',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decision 4: what fits (spec-author and the panel index.html out, 80 lines) and the refusal', () => {
    const s = section(SKILL, '## What fits');
    for (const t of [
      '`.claude/skills/**`',
      '`docs/PROCESS.md`',
      '`docs/FLOW.md`',
      '`docs/TESTING-NUVEM.md`',
      '`CLAUDE.md`',
      '`.github/**`',
      '`scripts/ci/**`',
      '`tests/tooling/**`',
      '`.claude/skills/spec-author/`',
      '`.claude/skills/implementar-fila/painel/index.html`',
      '`isReleaseInput`',
      '`git diff --numstat origin/main...HEAD`',
      '80 lines',
      '`Via rápida recusada: <criterion>`',
      "close the epic's PR without merging",
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decision 5: conflict check by painel.py conflito, without writing to the panel', () => {
    const s = section(SKILL, '## Conflict with the queue');
    for (const t of [
      'painel.py conflito',
      '--pasta',
      '--com',
      '`Via rápida: espera #',
      'does not hold the merge',
      'bring `main` into the epic before the closing (merge, never rebase)',
      'never writes to the panel',
      'Reading the sources',
      '`Via rápida:` comment',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decision 6: step by step of the epic, with changelog, DS record, PR with `Closes #` and the CI wait', () => {
    const s = section(SKILL, '## Step by step');
    for (const t of [
      'git switch -C epic/<name> origin/main',
      '`changelog/<name>.md`',
      '`docs/design-system/<name>.md`',
      'text test',
      'npm run lint && npm run typecheck && npm test && npm run build',
      'Closes #<n>',
      'CI wait',
      'Reading CI',
      '`git mv`',
      'Origem: via rápida #<n>',
      '`Impacto: <level> — <why>`',
      'ask the owner',
    ]) {
      expect(s, t).toContain(t);
    }
    expect(SKILL).toContain('docs/FLOW.md');
  });

  it('step 1: the DS record template says `None (process only).` in English, so the Portuguese guard accepts it once committed (#2363)', () => {
    const s = section(SKILL, '## Step by step');
    expect(s).toContain('`## Pendências` "None (process only)."');
  });

  it('step 6: the DS record says `None.` in `## Ficou sem gravar`, in English, with `Sem impacto…` kept in `## Sincronização` (#2570)', () => {
    const s = section(SKILL, '## Step by step');
    expect(s).toContain('`## Sincronização` "Sem impacto…"');
    expect(s).toContain('`## Ficou sem gravar` "None." in the DS one');
    expect(s).not.toContain('"Nada."');
  });

  it('decision 7: the owner authorization is asked in the fast-track chat, never relayed', () => {
    const s = section(SKILL, '## Owner authorization');
    for (const t of [
      '.github/workflows/',
      'item 8',
      'PushNotification',
      'AskUserQuestion',
      'relayed',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('decision 8: the review comes from riskTriggers.mjs (high with a trigger, medium without)', () => {
    const s = section(SKILL, '## Review');
    for (const t of [
      'node scripts/ci/riskTriggers.mjs --base origin/main',
      '`gatilho:`',
      '`/code-review high <base>..HEAD`',
      '`git merge-base origin/main HEAD`',
      '`nenhum gatilho`',
      '`/code-review medium`',
      'without `--comment` or `--fix`',
      'item 10',
    ]) {
      expect(s, t).toContain(t);
    }
  });
});

describe('fast-track rules in the flow documents (decisions 11 to 14)', () => {
  it('docs/FLOW.md, "For the owner, in the three chats": the fast-track paragraph', () => {
    const s = section(FLOW, '## For the owner, in the three chats');
    for (const t of [
      '/via-rapida #<n>',
      '`in-progress`',
      'Ainda não',
      '`mesclar=auto`',
      'supervision',
      '.claude/skills/via-rapida/SKILL.md',
    ]) {
      expect(s, t).toContain(t);
    }
  });

  it('CLAUDE.md: the exception in the workflow summary, and the file stays at up to 15000 characters', () => {
    const s = section(CLAUDE, '## Workflow (summary)');
    expect(s).toContain('except the fast track');
    expect(s).toContain('.claude/skills/via-rapida/SKILL.md');
    expect(CLAUDE.length).toBeLessThanOrEqual(15000);
  });

  it('docs/PROCESS.md: the exception in Labels and in Stages, the **Fast track** bullet and the 26000-byte ceiling', () => {
    const workflow = section(PROCESS, '## Workflow');
    const labels = workflow.split('\n').find((l) => l.startsWith('  - **Labels:**'))!;
    expect(labels).toContain('except the fast track');
    expect(section(PROCESS, '## Stages')).toContain('except the fast track');
    const lines = workflow.split('\n');
    const epic = lines.findIndex((l) =>
      l.startsWith('- **Everything reaches `main` through an epic.**'),
    );
    const fast = lines.findIndex((l) => l.startsWith('- **Fast track'));
    expect(epic).toBeGreaterThanOrEqual(0);
    expect(fast).toBe(epic + 1);
    expect(lines[fast]).toContain('.claude/skills/via-rapida/SKILL.md');
    expect(Buffer.byteLength(PROCESS)).toBeLessThanOrEqual(26000);
  });

  it('docs/PROCESS.md: the two cuts of "Bug evidence" that repeat docs/FLOW.md', () => {
    expect(PROCESS).not.toContain('- **The `evidencias`** only receives images');
    expect(PROCESS).not.toContain('Push refused because the branch moved');
    expect(FLOW).toContain('## Bug evidence');
  });

  it('supervisionar-fila: the first item of "Role and limits" cites the fast-track session', () => {
    const items = section(SUPERVISOR, '## Role and limits')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(items[0]).toContain('the fast-track session');
    expect(items[items.length - 1]).toContain('esta sessão:');
  });

  it('detalhar-backlog: "Detailing effort" cites the via-rapida skill among the triggers', () => {
    const s = section(DETALHAR, '## Detailing effort');
    expect(s).toContain('`via-rapida`');
  });

  it('review: `mesclar=auto` only counts when written by the owner; the supervision does not put it in the command', () => {
    expect(SKILL).not.toContain('the supervision only puts it in the command');
    expect(SKILL).toContain('the supervision does not include it');
    expect(SUPERVISOR).toContain('without `mesclar=auto`');
  });

  it('review: the check of step 2 excludes the own issue of the fast track', () => {
    expect(SKILL).toContain('except the issue of this very fast track (#n)');
  });

  it('review: FLOW lists `docs/TESTING-NUVEM.md` and says the merge is asked through the picker', () => {
    const s = section(FLOW, '## For the owner, in the three chats');
    expect(s).toContain('`docs/TESTING-NUVEM.md`');
    expect(s).toContain(
      'asks about the merge through the picker ("Mesclar" / "Ainda não")',
    );
    expect(s).not.toContain('merges only with your `pode mesclar`');
  });
});
