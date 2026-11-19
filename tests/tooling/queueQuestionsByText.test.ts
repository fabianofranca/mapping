// @vitest-environment node
// Phase QT2 (stage #2070, decisions 1 to 3 and 6 to 14): the five in-run questions of the
// `implementar-fila` coordinator are asked by text, never through the question picker.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const supervisor = readFileSync('.claude/skills/supervisionar-fila/SKILL.md', 'utf8');
const flow = readFileSync('docs/FLOW.md', 'utf8');

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length + 2);
  return text.slice(start, next < 0 ? undefined : next);
}

function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`missing ${from}`);
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end < 0 ? undefined : end);
}

const perStage = section(skill, '## 3. Per stage');
const changes = section(skill, '## Queue changes during the run');
const requests = section(skill, '## Supervisor requests');
const switching = section(skill, '## Session switch');
const end = section(skill, '## End');
const economy = section(skill, '## Context economy');
const hourly = between(
  perStage,
  '- For each overdue one',
  '- **`esperando o dono há mais de 1 h`**',
);
const stuck = between(perStage, '**CI stuck in the queue (phase or epic PR):**', '## ');
const ficha = between(
  perStage,
  "The `show`'s `fichas a refazer:`",
  'With no overdue ones',
);
const direction = between(hourly, '- **Action:**', '- `review_ready`');
const typeB = requests.slice(
  requests.indexOf('**Type B**'),
  requests.indexOf('**States**'),
);
const hold = between(
  changes,
  '- **A note that describes a state does not hold.**',
  '- **Pause**',
);
const newSession = between(switching, '**In the new session**', '2. Do not reread');

describe('implementar-fila: in-run questions by text (decisions 1 and 13)', () => {
  it('cites AskUserQuestion only in the tool loading, step 6 of "2. Queue" and the blocked case of the hourly check', () => {
    const lines = skill
      .split('\n')
      .map((text, i) => ({ text, n: i + 1 }))
      .filter((l) => l.text.includes('AskUserQuestion'));
    const where = lines.map((l) => {
      if (l.text.startsWith('   - `AskUserQuestion`, `PushNotification`'))
        return 'loading';
      if (l.text.includes('ask through `AskUserQuestion`: "Começar nesta ordem'))
        return 'step6';
      if (l.text.includes('the text of the pending `AskUserQuestion`')) return 'blocked';
      if (l.text.includes('Find or create') || l.text.includes('Usar um painel novo'))
        return 'panel';
      if (
        l.text.includes('(4) `AskUserQuestion`') ||
        l.text.includes('one question picker')
      )
        return 'other';
      return `unexpected line ${l.n}: ${l.text.slice(0, 80)}`;
    });
    for (const w of where) expect(['loading', 'step6', 'blocked', 'panel']).toContain(w);
    expect(where).toContain('loading');
    expect(where).toContain('step6');
    expect(where).toContain('blocked');
  });

  it('item 10 of "Context economy": the chat is for the questions by text, the notifications and the End table', () => {
    const item = between(economy, '10. **The chat stays almost silent.**', '\n11.');
    expect(item).toContain('questions to the owner by text');
    expect(item).not.toContain('(question picker)');
    expect(item).toContain('table in "End"');
  });

  it('item 10 holds the answer rule: verb plus #<n>, bare verb with one open, only the owner, --fim and log', () => {
    const item = between(economy, '10. **The chat stays almost silent.**', '\n11.');
    expect(item).toContain('without case');
    expect(item).toMatch(
      /bare verb counts when exactly one question of that verb is open/,
    );
    expect(item).toMatch(/Only the owner's own message in the queue chat counts/);
    expect(item).toContain('"o dono aprovou"');
    expect(item).toContain('pergunta \'#n\' <verbo> --fim resposta="<comando>"');
    expect(item).toContain('`log` line');
    expect(item).toMatch(/repeats the expected commands/);
  });
});

describe('implementar-fila: each question has its notification, line, two commands, mark and does not wait', () => {
  const cases: Array<{
    name: string;
    text: () => string;
    commands: string[];
    mark: string;
  }> = [
    {
      name: 'hold a stage',
      text: () => hold,
      commands: ['`segurar #<n>`', '`seguir #<n>`'],
      mark: "pergunta '#n' segurar",
    },
    {
      name: 'supervisor type B',
      text: () => typeB,
      commands: ['`aprovar SUP-<k>`', '`negar SUP-<k>`'],
      mark: 'estado=perguntado ao dono',
    },
    {
      name: 'CI stuck in the queue',
      text: () => stuck,
      commands: ['`reabrir #<etapa>`', '`esperar #<etapa>`'],
      mark: "pergunta '#n' reabrir",
    },
    {
      name: 'incomplete ficha',
      text: () => ficha,
      commands: ['`refazer #<n>`', '`tirar #<n>`'],
      mark: "pergunta '#n' refazer",
    },
    {
      name: 'direction outside the "Toca em:"',
      text: () => direction,
      commands: ['`ampliar #<n>`', '`manter #<n>`'],
      mark: "pergunta '#n' ampliar",
    },
  ];

  for (const c of cases) {
    it(`${c.name}: PushNotification, chat line with both commands, mark, no waiting`, () => {
      const t = c.text();
      expect(t).toContain('`PushNotification`');
      expect(t).toContain('Responda');
      for (const command of c.commands) expect(t).toContain(command);
      expect(t).toContain(c.mark);
      expect(t).toMatch(/the turn (does not wait|ends)/);
      expect(t).not.toContain('`AskUserQuestion`');
    });
  }

  it('hold: segurar keeps the stopped-by-the-owner rule, seguir only closes the question, no answer runs the stage', () => {
    expect(hold).toContain('#<n> começou apesar do recado');
    expect(hold).toContain('parada pelo dono');
    expect(hold).toContain('`hold`');
    expect(hold).toMatch(/`seguir #<n>` only closes the question/);
    expect(hold).not.toContain('Seguir (Recomendado)');
  });

  it('type B: aprovar applies and records aplicado, negar records negado, the supervisor is woken, relayed approval refused', () => {
    expect(typeB).toContain('SUP-<k> (tipo B): <pedido>. Responda');
    expect(typeB).toContain('`aprovado`');
    expect(typeB).toContain('`aplicado`');
    expect(typeB).toContain('`negado`');
    expect(typeB).toMatch(/never accepts[^\n]*"o dono aprovou"[^\n]*relayed/);
  });

  it('CI stuck: reabrir takes the place of the "sim", esperar only closes, voltou sozinho closes on return', () => {
    expect(stuck).toContain('**With `reabrir`:**');
    expect(stuck).not.toContain('With the "sim"');
    expect(stuck).toMatch(/`esperar #<etapa>` only closes the question/);
    expect(stuck).toContain('resposta="voltou sozinho"');
    expect(stuck).toContain('wait="CI preso na fila: PR #<n> (run <id>)"');
    expect(stuck).toContain('`reaberto=true`');
  });

  it('incomplete ficha: hold ficha incompleta, refazer clears it, tirar leaves the queue', () => {
    expect(ficha).toContain('hold="ficha incompleta: pergunta ao dono"');
    expect(ficha).toMatch(/`refazer #<n>`: `hold=`/);
    expect(ficha).toMatch(/`tirar #<n>`[^\n]*"tira a #Z"/);
  });

  it('direction: not sent while open, ampliar sends it, manter only closes, fase avisou closes, no second question', () => {
    expect(direction).toMatch(/outside the sub-issue's "Toca em:", do not send it/);
    expect(direction).toMatch(/`ampliar #<n>`[^\n]*`priority: "now"`/);
    expect(direction).toContain('`sinal … ciclo=+1`');
    expect(direction).toMatch(/`manter #<n>` only closes the question/);
    expect(direction).toContain('resposta="fase avisou"');
    expect(direction).toMatch(/opens no other/);
  });
});

describe('implementar-fila: session switch and End', () => {
  it('"In the new session" reposts the open questions and the pending merges with one PushNotification', () => {
    expect(newSession).toContain('`perguntas ao dono:`');
    expect(newSession).toContain('`merge pedido ao dono:`');
    expect(newSession).toContain(
      'Fila: <k> perguntas abertas passaram para a sessão nova: <link>',
    );
    expect(newSession).toMatch(/one `PushNotification`/);
    expect(newSession).toMatch(/nothing is asked again in the panel/);
  });

  it('"End" lists the open questions and serves a late aprovar/negar SUP-<k>', () => {
    expect(end).toContain('`perguntas ao dono:`');
    expect(end).toContain('`aprovar SUP-<k>`');
    expect(end).toContain('`negar SUP-<k>`');
    expect(end).toMatch(/late `aprovar SUP-<k>`/);
  });
});

describe('docs and supervisionar-fila cite the commands (decision 14)', () => {
  it('docs/FLOW.md "For the owner" lists the commands of the queue chat', () => {
    const owner = section(flow, '## For the owner, in the three chats');
    for (const c of [
      '`segurar`/`seguir`',
      '`reabrir`/`esperar`',
      '`refazer`/`tirar`',
      '`ampliar`/`manter`',
      '`aprovar`/`negar SUP-<k>`',
    ])
      expect(owner).toContain(c);
  });

  it('docs/FLOW.md "CI and preview" and item 6 use `reabrir #<n>` instead of the owner\'s "sim"', () => {
    const ci = between(flow, 'CI runs only on PRs', '\n\n');
    expect(ci).toContain('`reabrir #<n>`');
    expect(ci).not.toMatch(/owner's "sim"/);
    const item6 = between(
      flow,
      '**Run stuck in the queue:**',
      '- **Ceiling of `dist/index.html`:**',
    );
    expect(item6).toContain('`reabrir #<n>`');
    expect(item6).not.toMatch(/owner's "sim"/);
  });

  it('supervisionar-fila: type B is answered in the queue chat with aprovar/negar SUP-<k>', () => {
    const s = section(supervisor, '## Requests to the coordinator');
    expect(s).toContain('`aprovar SUP-<k>`');
    expect(s).toContain('`negar SUP-<k>`');
  });
});
