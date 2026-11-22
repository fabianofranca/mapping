// @vitest-environment node
// Stage #1856, phases GC1 (decisions 1 to 8, 10 and 12a) and GC2 (the text of `docs/FLOW.md`, decisions 9 and 10): the `PostToolUse` hook that measures the
// context of the phase session after each tool call and warns of the switch above the trigger
// (`scripts/ci/contextGuard.mjs`), and its entry in `.claude/settings.json`. The hook runs as a
// process (`spawnSync`), with the input on stdin and `CLAUDE_CODE_REMOTE` and `TMPDIR` in the `env`; the
// transcript is a `.jsonl` fixture in the format of `contextUsage.test.ts`.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';
import {
  GATILHO,
  GATILHO_COORDENADOR,
  GATILHO_TESTADOR,
  MARCADOR,
  MARCADOR_COORDENADOR,
  MARCADOR_RETOMADA,
  MARCADOR_TESTADOR,
  opensPullRequest,
  sessionRole,
  shouldWarn,
  // @ts-expect-error .mjs module without type declarations
} from '../../scripts/ci/contextGuard.mjs';

const TRIGGER = GATILHO as number;
const COORD_TRIGGER = GATILHO_COORDENADOR as number;
const COORD_MARK = MARCADOR_COORDENADOR as RegExp;
const TESTER_TRIGGER = GATILHO_TESTADOR as number;
const roleOf = sessionRole as (
  texts: string[],
) => 'fase' | 'coordenador' | 'testador' | null;
const opensPr = opensPullRequest as (toolName: unknown, toolInput: unknown) => boolean;
const warns = shouldWarn as (
  contexto: number,
  ultimoAviso: number | null,
  gatilho?: number,
) => boolean;
const MARK = MARCADOR as string;
const TAIL = 2 * 1024 * 1024;

const phasePrompt = `${MARK}GC1 — the hook of stage #1856 of the repository \`fabianofranca/mapping\`.`;
// What the coordinator actually sends (skill `implementar-fila`, "Per stage"): it opens with `Fase <código> —`.
const queuePrompt =
  'Fase GC1 — Context hook of the phase da etapa #1856 (sub-issue #1882), of the repository `fabianofranca/mapping`, in the automated flow.';

/** `user` line with the prompt as a string. */
const userLine = (content: unknown): string =>
  JSON.stringify({
    type: 'user',
    isSidechain: false,
    message: { role: 'user', content },
  });

/** Assistant line with the context sum `n`, in the real transcript format. */
const measure = (n: number, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    message: {
      model: 'claude-sonnet-5-5',
      role: 'assistant',
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: n - 2 - 100,
        cache_creation_input_tokens: 100,
      },
    },
    ...extra,
  });

let root: string;
let counter = 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'context-guard-'));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

interface Sandbox {
  /** The hook's `TMPDIR`. */
  tmp: string;
  transcript: string;
  sessionId: string;
  state: string;
}

function sandbox(lines: string[] = []): Sandbox {
  const base = join(root, `s${counter++}`);
  mkdirSync(base, { recursive: true });
  const transcript = join(base, 'transcript.jsonl');
  writeFileSync(transcript, lines.map((l) => `${l}\n`).join(''));
  const sessionId = `sess-${counter}`;
  return {
    tmp: base,
    transcript,
    sessionId,
    state: join(base, 'context-guard', `${sessionId}.json`),
  };
}

interface Call {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  agent_id?: string;
  transcript_path?: string;
}

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

function hook(
  box: Sandbox,
  call: Call = {},
  options: { remote?: boolean; raw?: string } = {},
): Result {
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: box.tmp };
  delete env.CLAUDE_CODE_REMOTE;
  if (options.remote !== false) env.CLAUDE_CODE_REMOTE = 'true';
  const input =
    options.raw ??
    JSON.stringify({
      session_id: box.sessionId,
      transcript_path: box.transcript,
      tool_name: 'Bash',
      tool_input: { command: 'true' },
      ...call,
    });
  const r = spawnSync('node', ['scripts/ci/contextGuard.mjs'], {
    encoding: 'utf8',
    env,
    input,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

interface State {
  fase: boolean;
  papel?: 'fase' | 'coordenador' | 'testador' | 'nenhum';
  contexto?: number;
  ferramenta?: string;
  ultimoAviso: number | null;
  saltos: { rotulo: string; mil: number }[];
  erro?: { mensagem: string; em: string } | null;
}
const stateOf = (box: Sandbox): State =>
  JSON.parse(readFileSync(box.state, 'utf8')) as State;
const silent = (r: Result): void => {
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
};

interface Warning {
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
}
const warningOf = (r: Result): Warning => {
  expect(r.status).toBe(0);
  expect(r.stdout.trimEnd().split('\n')).toHaveLength(1);
  return JSON.parse(r.stdout) as Warning;
};

describe('GC1 — contextGuard.mjs: the constants (decisions 1 and 4)', () => {
  it('the trigger is 270,000 and the marker is the first sentence of the phase message', () => {
    expect(TRIGGER).toBe(270_000);
    expect(MARK).toBe('Você é o agente da fase ');
  });
});

describe('GC1 — contextGuard.mjs: the silent outputs (decision 4)', () => {
  it('without CLAUDE_CODE_REMOTE: code 0, no output, no state', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, {}, { remote: false }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('with agent_id (a subagent call): no output and the state is not even written', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, { agent_id: 'agent-1' }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('empty or missing transcript_path: no output', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, { transcript_path: '' }));
    silent(hook(box, { transcript_path: join(box.tmp, 'does-not-exist.jsonl') }));
  });

  it('a session that is not a phase one: no output, fase=false in the state and no rereading of the prompt', () => {
    const box = sandbox([
      userLine('Hi, can you help me with the project?'),
      measure(300_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
    // The second call reuses the state: swapping the prompt for a phase one does not change the decision.
    writeFileSync(
      box.transcript,
      [userLine(phasePrompt), measure(300_000)].join('\n') + '\n',
    );
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
  });

  it('the supervision and the fast track stay out (papel nenhum), and so does a tester described in prose', () => {
    for (const prompt of [
      'You are the tester of stage #1856.',
      '/supervisionar-fila',
      '/via-rapida #1856 fila=x',
    ]) {
      const box = sandbox([userLine(prompt), measure(300_000)]);
      silent(hook(box));
      expect(stateOf(box).fase, prompt).toBe(false);
      expect(stateOf(box).papel, prompt).toBe('nenhum');
    }
  });

  it('the coordinator (/implementar-fila) is a coordinator, not a phase: fase false, papel coordenador', () => {
    const box = sandbox([userLine('/implementar-fila #1856'), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: false, papel: 'coordenador' });
  });
});

describe('CH1 — contextGuard.mjs: the constants (decisions 1 and 3)', () => {
  it('the coordinator trigger is 320,000 and the phase one is still 270,000', () => {
    expect(COORD_TRIGGER).toBe(320_000);
    expect(TRIGGER).toBe(270_000);
  });
});

describe('CH1 — contextGuard.mjs: the coordinator prompt and the role (decisions 1 and 2)', () => {
  const resume =
    '/implementar-fila retomar anterior=session_01ABC painel=https://claude.ai/artifact/x paralelo=2 sem-confirmar';

  it('a prompt that opens with /implementar-fila counts, with arguments or alone, after leading blanks', () => {
    for (const text of [resume, '/implementar-fila', '  \n/implementar-fila #1856']) {
      expect(COORD_MARK.test(text.trimStart()), text).toBe(true);
      expect(roleOf([text]), text).toBe('coordenador');
    }
  });

  it('the form recorded for a typed slash command counts', () => {
    const text =
      '<command-message>implementar-fila</command-message>\n<command-name>/implementar-fila</command-name>\n<command-args>#1856</command-args>';
    expect(roleOf([text])).toBe('coordenador');
  });

  it('the negatives of decision 1 do not count', () => {
    for (const text of [
      '/implementar-filas #1',
      '/supervisionar-fila',
      '/via-rapida #1856 fila=/implementar-fila',
      'Please run /implementar-fila for me',
      '<command-name>/implementar-filas</command-name>',
      'Hi',
    ]) {
      expect(roleOf([text]), text).toBeNull();
    }
  });

  it('a phase prompt is a phase, even with a coordinator command inside it', () => {
    expect(roleOf([phasePrompt])).toBe('fase');
    expect(roleOf([queuePrompt])).toBe('fase');
    expect(
      roleOf([`${phasePrompt}\n<command-name>/implementar-fila</command-name>`]),
    ).toBe('fase');
  });

  it('the text blocks are searched too (string and block list)', () => {
    const asString = sandbox([userLine(resume), measure(100_000)]);
    silent(hook(asString));
    expect(stateOf(asString).papel).toBe('coordenador');
    const asBlocks = sandbox([
      userLine([
        { type: 'text', text: '<system-reminder>x</system-reminder>' },
        { type: 'text', text: resume },
      ]),
      measure(100_000),
    ]);
    silent(hook(asBlocks));
    expect(stateOf(asBlocks)).toMatchObject({ fase: false, papel: 'coordenador' });
  });
});

describe('GC1 — contextGuard.mjs: the phase session prompt (decision 4)', () => {
  it('the "For the phase session" message of docs/FLOW.md counts', () => {
    const box = sandbox([userLine(phasePrompt), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('the short prompt of the coordinator (`Fase <código> — … (sub-issue #n)`) counts too', () => {
    const box = sandbox([userLine(queuePrompt), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('a bare `Fase`, without the stage and the sub-issue, does not count', () => {
    const box = sandbox([
      userLine('Fase de testes do projeto: me ajude a revisar.'),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
  });

  it('the first user line as a list of blocks counts through its first text block', () => {
    const box = sandbox([
      userLine([
        { type: 'image', source: {} },
        { type: 'text', text: phasePrompt },
        { type: 'text', text: 'another block' },
      ]),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('a reminder text block before the prompt does not hide the phase session', () => {
    const box = sandbox([
      userLine([
        { type: 'text', text: '<system-reminder>CLAUDE.md …</system-reminder>' },
        { type: 'text', text: queuePrompt },
      ]),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('the first user line counts, even with other lines before it and a user line after', () => {
    const box = sandbox([
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue' }),
      JSON.stringify({ type: 'attachment', isSidechain: false }),
      userLine(phasePrompt),
      userLine('Hi'),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });
});

describe('GC1 — contextGuard.mjs: the state and the trigger (decisions 5, 6 and 8)', () => {
  it('below the trigger: no output; the state carries fase, contexto and the tool of the call', () => {
    const box = sandbox([userLine(phasePrompt), measure(120_345)]);
    silent(hook(box, { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
    expect(stateOf(box)).toMatchObject({
      fase: true,
      contexto: 120_345,
      ferramenta: 'Bash: npm test',
      ultimoAviso: null,
      saltos: [],
    });
  });

  it('270,000 does not warn; 270,001 warns, with the JSON of decision 8', () => {
    const a = sandbox([userLine(phasePrompt), measure(TRIGGER)]);
    silent(hook(a));
    expect(stateOf(a).ultimoAviso).toBeNull();

    const b = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    const out = warningOf(hook(b));
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toContain('271 thousand');
    expect(text).toContain('270 thousand');
    expect(text).toContain('hand over');
    expect(text).toContain('5 of 5');
    expect(text).toContain('Subagent: ignore this notice');
    expect(text).not.toContain('\n');
    expect(stateOf(b).ultimoAviso).toBe(TRIGGER + 1);
  });

  it('the repetition: after the warning at 270,001, 279,999 does not repeat and 280,001 does', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    warningOf(hook(box));

    appendFileSync(box.transcript, measure(279_999) + '\n');
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBe(TRIGGER + 1);

    appendFileSync(box.transcript, measure(280_001) + '\n');
    const out = warningOf(hook(box));
    expect(out.hookSpecificOutput.additionalContext).toContain('281 thousand');
    expect(stateOf(box).ultimoAviso).toBe(280_001);
  });
});

describe('CH1 — contextGuard.mjs: the trigger of the coordinator (decision 3)', () => {
  const coordinator = '/implementar-fila retomar anterior=session_01ABC painel=x';

  it('shouldWarn takes the trigger as a third parameter, defaulting to the phase one', () => {
    expect(warns(TRIGGER, null)).toBe(false);
    expect(warns(TRIGGER + 1, null)).toBe(true);
    expect(warns(COORD_TRIGGER, null, COORD_TRIGGER)).toBe(false);
    expect(warns(COORD_TRIGGER + 1, null, COORD_TRIGGER)).toBe(true);
    expect(warns(300_000, null, COORD_TRIGGER)).toBe(false);
  });

  it('a coordinator at 320,000 is silent and at 320,001 warns; a phase at 300,000 warns with the unchanged text', () => {
    const quiet = sandbox([userLine(coordinator), measure(COORD_TRIGGER)]);
    silent(hook(quiet));
    expect(stateOf(quiet).ultimoAviso).toBeNull();

    const at300 = sandbox([userLine(coordinator), measure(300_000)]);
    silent(hook(at300));

    const loud = sandbox([userLine(coordinator), measure(COORD_TRIGGER + 1)]);
    const text = warningOf(hook(loud)).hookSpecificOutput.additionalContext;
    expect(text).toContain('this coordinator session is at 321 thousand');
    expect(stateOf(loud)).toMatchObject({
      fase: false,
      papel: 'coordenador',
      ultimoAviso: COORD_TRIGGER + 1,
    });

    const phase = sandbox([userLine(phasePrompt), measure(300_000)]);
    const phaseText = warningOf(hook(phase)).hookSpecificOutput.additionalContext;
    expect(phaseText).toContain(
      'this session is at 300 thousand, above the trigger of 270 thousand',
    );
    expect(phaseText).not.toContain('coordinator');
  });

  it('repeats at +10 thousand and resets when the context returns to the coordinator trigger or below', () => {
    const box = sandbox([userLine(coordinator), measure(COORD_TRIGGER + 1)]);
    warningOf(hook(box));
    appendFileSync(box.transcript, measure(329_999) + '\n');
    silent(hook(box));
    appendFileSync(box.transcript, measure(330_001) + '\n');
    expect(warningOf(hook(box)).hookSpecificOutput.additionalContext).toContain(
      '331 thousand',
    );

    // 300,000 is below the coordinator trigger: compaction clears the last notice.
    appendFileSync(box.transcript, measure(300_000) + '\n');
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();
    appendFileSync(box.transcript, measure(325_000) + '\n');
    warningOf(hook(box));
    expect(stateOf(box).ultimoAviso).toBe(325_000);
  });
});

describe('CH1 — contextGuard.mjs: the coordinator notice (decision 5)', () => {
  const notice = (): string => {
    const box = sandbox([
      userLine('/implementar-fila retomar anterior=session_01ABC'),
      measure(100_000),
    ]);
    silent(hook(box, { tool_name: 'Read', tool_input: { file_path: 'a.md' } }));
    appendFileSync(box.transcript, measure(COORD_TRIGGER + 5000) + '\n');
    return warningOf(hook(box)).hookSpecificOutput.additionalContext;
  };

  it('is one line and states the context and the trigger', () => {
    const text = notice();
    expect(text).not.toContain('\n');
    expect(text).toContain(
      'Context hook: this coordinator session is at 325 thousand, above its trigger of 320 thousand',
    );
  });

  it('counts as "above 35%" of "Session switch": hand over now, in this turn, after the lineage check, with no SKILL.md reread', () => {
    const text = notice();
    expect(text).toContain('"above 35%"');
    expect(text).toContain('"Session switch"');
    expect(text).toContain('.claude/skills/implementar-fila/SKILL.md');
    expect(text).toContain('in this turn');
    expect(text).toContain('"Lineage limit"');
    expect(text).toContain('without rereading a changed SKILL.md');
  });

  it('covers no room in the lineage, the session that already handed over, the jumps and the subagent line', () => {
    const text = notice();
    expect(text).toContain('no room in the lineage');
    expect(text).toContain('once');
    expect(text).toContain('later notices do not repeat');
    expect(text).toContain('no longer the registered coordinator');
    expect(text).toContain('Largest jumps (approximate): Read: a.md +');
    expect(text).toContain('Subagent: ignore this notice.');
  });
});

describe('CH1 — contextGuard.mjs: the state without papel (decision 4)', () => {
  const coordinator = '/implementar-fila retomar anterior=session_01ABC';
  const seed = (box: Sandbox, state: Record<string, unknown>): void => {
    mkdirSync(join(box.tmp, 'context-guard'), { recursive: true });
    writeFileSync(box.state, JSON.stringify(state));
  };

  it('{fase: false} without papel in a coordinator session is decided again, rewritten with papel and warns', () => {
    const box = sandbox([userLine(coordinator), measure(COORD_TRIGGER + 1)]);
    seed(box, { fase: false, ultimoAviso: null, saltos: [], erro: null });
    warningOf(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: false, papel: 'coordenador' });
  });

  it('{fase: true} without papel stays a phase, with the phase trigger', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    seed(box, { fase: true, ultimoAviso: null, saltos: [], erro: null });
    const text = warningOf(hook(box)).hookSpecificOutput.additionalContext;
    expect(text).toContain('this session is at 300 thousand');
    expect(stateOf(box)).toMatchObject({ fase: true, papel: 'fase' });
  });

  it('{fase: false} without papel in a silent session becomes papel nenhum, once', () => {
    const box = sandbox([userLine('Hi'), measure(400_000)]);
    seed(box, { fase: false, ultimoAviso: null, saltos: [], erro: null });
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: false, papel: 'nenhum' });
  });

  it('a state with papel nenhum is final: no rewrite and no rereading of the transcript', () => {
    const box = sandbox([userLine('Hi'), measure(400_000)]);
    silent(hook(box));
    expect(stateOf(box).papel).toBe('nenhum');
    writeFileSync(
      box.transcript,
      [userLine(coordinator), measure(400_000)].join('\n') + '\n',
    );
    const before = readFileSync(box.state, 'utf8');
    silent(hook(box));
    expect(readFileSync(box.state, 'utf8')).toBe(before);
  });

  it('a state with papel coordenador is used as it is', () => {
    const box = sandbox([userLine('Hi'), measure(COORD_TRIGGER + 1)]);
    seed(box, { fase: false, papel: 'coordenador', ultimoAviso: null, saltos: [] });
    warningOf(hook(box));
  });
});

describe('GC1 — contextGuard.mjs: the measure drops after a compaction (review finding)', () => {
  it('the context that returns to the trigger or below resets the last warning: the next crossing warns', () => {
    const box = sandbox([userLine(phasePrompt), measure(290_000)]);
    warningOf(hook(box));
    expect(stateOf(box).ultimoAviso).toBe(290_000);

    appendFileSync(box.transcript, measure(100_000) + '\n'); // compaction
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();

    appendFileSync(box.transcript, measure(275_000) + '\n');
    const out = warningOf(hook(box));
    expect(out.hookSpecificOutput.additionalContext).toContain('275 thousand');
    expect(stateOf(box).ultimoAviso).toBe(275_000);
  });

  it('exactly at the trigger also resets the last warning', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    warningOf(hook(box));
    appendFileSync(box.transcript, measure(TRIGGER) + '\n');
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();
  });
});

describe('GC1 — contextGuard.mjs: the jumps (decision 7)', () => {
  it('the jump goes to the tool of the previous call, and the warning lists the 3 biggest', () => {
    const box = sandbox([userLine(phasePrompt), measure(100_000)]);
    const command = 'npm run lint && npm run typecheck && npm test && npm run build';
    silent(hook(box, { tool_name: 'Bash', tool_input: { command } }));

    appendFileSync(box.transcript, measure(130_500) + '\n'); // +30.5 thousand for the Bash
    silent(hook(box, { tool_name: 'Read', tool_input: { file_path: 'docs/FLOW.md' } }));

    appendFileSync(box.transcript, measure(200_000) + '\n'); // +69.5 thousand for the Read
    silent(
      hook(box, { tool_name: 'Agent', tool_input: { description: 'Write the test' } }),
    );

    appendFileSync(box.transcript, measure(290_000) + '\n'); // +90 thousand for the Agent
    const out = warningOf(hook(box, { tool_name: 'Grep', tool_input: { pattern: 'x' } }));
    const text = out.hookSpecificOutput.additionalContext;

    const bash = `Bash: ${command.slice(0, 40)}`;
    expect(bash).toBe('Bash: npm run lint && npm run typecheck && npm');
    expect(text).toContain('290 thousand');
    const agent = text.indexOf('Agent: Write the test +90 thousand');
    const read = text.indexOf('Read: docs/FLOW.md +70 thousand');
    const first = text.indexOf(`${bash} +31 thousand`);
    expect(agent).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(agent);
    expect(first).toBeGreaterThan(read);
    expect(stateOf(box)).toMatchObject({
      ferramenta: 'Grep',
      saltos: [
        { rotulo: 'Agent: Write the test', mil: 90 },
        { rotulo: 'Read: docs/FLOW.md', mil: 70 },
        { rotulo: bash, mil: 31 },
      ],
    });
  });

  it('the label of a command with line breaks becomes a single line (the warning is one line)', () => {
    const box = sandbox([userLine(phasePrompt), measure(100_000)]);
    const command = "python3 - <<'EOF'\n\timport re\n  p='x'\nEOF";
    silent(hook(box, { tool_name: 'Bash', tool_input: { command } }));
    appendFileSync(box.transcript, measure(TRIGGER + 5000) + '\n');
    const out = warningOf(
      hook(box, { tool_name: 'Read', tool_input: { file_path: 'a.md' } }),
    );
    expect(stateOf(box).saltos[0]?.rotulo).toBe(
      "Bash: python3 - <<'EOF' import re p='x' EOF",
    );
    expect(out.hookSpecificOutput.additionalContext).not.toMatch(/\s{2}|[\n\t]/);
  });

  it('only the 3 biggest stay in the state, and a measure that does not grow produces no jump', () => {
    const box = sandbox([userLine(phasePrompt), measure(10_000)]);
    const steps = [5_000, 40_000, 10_000, 70_000, 0, 20_000];
    let total = 10_000;
    silent(hook(box, { tool_name: 'T0' }));
    steps.forEach((step, i) => {
      total += step;
      appendFileSync(box.transcript, measure(total) + '\n');
      silent(hook(box, { tool_name: `T${i + 1}` }));
    });
    // Jumps: T0 +5, T1 +40, T2 +10, T3 +70, T4 +0 (same measure: nothing), T5 +20. The 3 biggest stay.
    expect(stateOf(box).saltos).toEqual([
      { rotulo: 'T3', mil: 70 },
      { rotulo: 'T1', mil: 40 },
      { rotulo: 'T5', mil: 20 },
    ]);

    // A context that drops (compaction) does not become a negative jump.
    appendFileSync(box.transcript, measure(30_000) + '\n');
    silent(hook(box, { tool_name: 'T7' }));
    expect(stateOf(box).saltos.every((s) => s.mil > 0)).toBe(true);
    expect(stateOf(box).contexto).toBe(30_000);
  });

  it('another tool uses the tool_name as the label; without the label field, too', () => {
    const box = sandbox([userLine(phasePrompt), measure(10_000)]);
    silent(hook(box, { tool_name: 'Edit', tool_input: { file_path: 'a.ts' } }));
    appendFileSync(box.transcript, measure(60_000) + '\n');
    silent(hook(box, { tool_name: 'Read', tool_input: {} }));
    appendFileSync(box.transcript, measure(70_000) + '\n');
    silent(hook(box, { tool_name: 'Bash', tool_input: { command: 'x' } }));
    expect(stateOf(box).saltos).toEqual([
      { rotulo: 'Edit', mil: 50 },
      { rotulo: 'Read', mil: 10 },
    ]);
  });
});

describe('GC1 — contextGuard.mjs: reading the transcript (decision 5)', () => {
  const filler = (bytes: number): string[] => {
    const line = userLine('x'.repeat(900));
    return Array.from({ length: Math.ceil(bytes / (line.length + 1)) }, () => line);
  };

  it('a transcript larger than 2 MiB with the last measure at the end: the end one counts, and the cut line does not break', () => {
    // The 4,000-byte line straddles the limit of the final 2 MiB: its beginning is left out.
    const straddle = measure(999_000, { pad: 'y'.repeat(4000) });
    const end = [measure(150_000)];
    const tailBytes = (lines: string[]): number =>
      lines.reduce((n, l) => n + l.length + 1, 0);
    const middle = filler(TAIL - tailBytes([straddle, ...end]) + 2000);
    const lines = [userLine(phasePrompt), straddle, ...middle, ...end];
    const box = sandbox(lines);
    const size = readFileSync(box.transcript).length;
    expect(size).toBeGreaterThan(TAIL);
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: true, contexto: 150_000 });
  });

  it('the last measure before the final 2 MiB: falls back to the full read', () => {
    const lines = [userLine(phasePrompt), measure(123_456), ...filler(TAIL + 200_000)];
    const box = sandbox(lines);
    expect(readFileSync(box.transcript).length).toBeGreaterThan(TAIL);
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: true, contexto: 123_456 });
  });

  it('no measure at all in the transcript: no output', () => {
    const box = sandbox([userLine(phasePrompt)]);
    silent(hook(box));
  });
});

describe('GC1 — contextGuard.mjs: failures never block the call (decision 6)', () => {
  it('corrupted state: code 0 and no output, and the state becomes a JSON with the error again', () => {
    const box = sandbox([userLine(phasePrompt), measure(120_000)]);
    mkdirSync(join(box.tmp, 'context-guard'), { recursive: true });
    writeFileSync(box.state, '{"fase": tr');
    silent(hook(box));
    const state = stateOf(box);
    expect(typeof state.erro?.mensagem).toBe('string');
    expect(state.erro?.em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('input that is not JSON: code 0 and no output', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, {}, { raw: 'this is not json' }));
    silent(hook(box, {}, { raw: '' }));
    silent(hook(box, {}, { raw: '[1,2]' }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('session_id that would escape the state folder: no output and nothing written outside it', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    box.sessionId = '../outside';
    silent(hook(box));
    expect(existsSync(join(box.tmp, 'outside.json'))).toBe(false);
  });
});

describe('CH1 — the "Session switch" section of the implementar-fila skill (decision 6)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const switching = section(skill, '## Session switch');
  const first = switching.split('\n\n')[1] ?? '';
  const newSkill = between(switching, '**New skill on `main`.**', '**Lineage limit.**');

  it('the first paragraph cites the hook, the 320 thousand and the same-turn switch', () => {
    expect(first).toContain('scripts/ci/contextGuard.mjs');
    expect(first).toContain(`${COORD_TRIGGER / 1000} thousand`);
    expect(first).toContain('counts as "above 35%"');
    expect(first).toContain('same turn');
    expect(first).toContain('after the lineage check');
    expect(first).toContain('painel.py context <folder> --medir --max <max_tokens>');
  });

  it('"New skill on main" skips the check with the context above 35% or the hook notice', () => {
    expect(newSkill).toContain('above 35%');
    expect(newSkill).toContain("hook's notice");
    expect(newSkill).toContain('skip this check entirely');
    expect(newSkill).toContain('the successor reads the new skill');
    // With no room in the lineage there is no successor to read it: the check stays.
    expect(newSkill).toContain('with room in the lineage');
  });
});

describe('GC1 — .claude/settings.json (decision 10)', () => {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
    permissions: { allow: string[]; deny: string[] };
    hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>;
  };

  it('PostToolUse has one entry with matcher * and the command of the hook, with timeout 10', () => {
    expect(settings.hooks.PostToolUse).toEqual([
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR/scripts/ci/contextGuard.mjs"',
            timeout: 10,
          },
        ],
      },
    ]);
  });

  it('CG1 — PreToolUse has one entry: matcher Bash|mcp__github__create_pull_request, the same command, timeout 10', () => {
    expect(settings.hooks.PreToolUse).toEqual([
      {
        matcher: 'Bash|mcp__github__create_pull_request',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR/scripts/ci/contextGuard.mjs"',
            timeout: 10,
          },
        ],
      },
    ]);
  });

  it('SessionStart stays the same and the permissions do not change', () => {
    expect(settings.hooks.SessionStart).toEqual([
      {
        hooks: [
          {
            type: 'command',
            command: '$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh',
          },
        ],
      },
    ]);
    expect(settings.permissions.deny).toEqual([
      'Bash(git push --force:*)',
      'Bash(git push -f:*)',
      'Bash(git push --force-with-lease:*)',
    ]);
    expect(settings.permissions.allow).toContain('Bash(npm run lint)');
    expect(settings.permissions.allow).toContain(
      'mcp__claude-code-remote__archive_session',
    );
    expect(Object.keys(settings.hooks).sort()).toEqual([
      'PostToolUse',
      'PreToolUse',
      'SessionStart',
    ]);
  });
});

describe('GC2 — docs/FLOW.md: the hook rule in the phase session (decisions 9 and 10)', () => {
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const phase = section(flow, '## For the phase session');
  const ceiling = between(
    phase,
    '   - **Phase context ceiling:**',
    '4. Every briefing for a behavior change',
  );
  const thousand = `${TRIGGER / 1000} thousand`;

  it('the sub-item "Phase context ceiling" cites the hook, the PostToolUse and the trigger of the script', () => {
    expect(ceiling).toContain('**Hook:**');
    expect(ceiling).toContain('scripts/ci/contextGuard.mjs');
    expect(ceiling).toContain('PostToolUse');
    expect(ceiling).toContain(`trigger of ${thousand}`);
  });

  it('checks (a) and (b) run the script with --teto equal to the trigger', () => {
    expect(ceiling).toContain(`node scripts/ci/contextUsage.mjs --teto ${TRIGGER}`);
    const checks = between(ceiling, 'Check at two points', 'Once the phase PR');
    expect(checks).toContain(`--teto ${TRIGGER}`);
    expect(checks.indexOf('(a)')).toBeGreaterThan(checks.indexOf('--teto'));
    expect(checks.indexOf('(b)')).toBeGreaterThan(checks.indexOf('(a)'));
    // Without `--teto`, `acima=true` holds only for the 300 thousand: the text says so, and the stage is cited by number.
    expect(ceiling).toContain('Without `--teto`');
    expect(ceiling).toContain('#1856');
    expect(ceiling).not.toContain('of this stage');
  });

  it('hands over above the trigger, and the 300 thousand ceiling remains', () => {
    expect(ceiling).toContain(`Above the trigger of ${thousand}`);
    expect(ceiling).not.toContain('With more than 300 thousand, the phase hands over:');
    expect(ceiling).toContain('300 thousand');
    expect(ceiling).toContain('300,000');
  });

  it('step 3 of the handoff cites the biggest jumps of the last notice of the hook', () => {
    const step3 = between(
      ceiling,
      '     3. comments on the phase sub-issue',
      '     4. sends the coordinator',
    );
    expect(step3).toContain("the biggest jumps of the hook's last notice");
    expect(step3).toContain('no hook notice');
  });

  it('the phase message (the first text block) starts with the MARKER', () => {
    const block = between(phase, '```text\n', '\n```').slice('```text\n'.length);
    expect(block.startsWith(MARK)).toBe(true);
  });
});

describe("CC1 — the notice exempts only the phase's last PR (#1949)", () => {
  /** The notice the hook writes at `TRIGGER + 1`. */
  const notice = (): string => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    return warningOf(hook(box)).hookSpecificOutput.additionalContext;
  };

  it('says that the exemption holds only with the last PR open or in session 5 of 5', () => {
    const text = notice();
    expect(text).toContain("the phase's last PR is not open");
    expect(text).toContain(
      'a phase that opens several PRs hands over between a merged PR and the next one',
    );
    expect(text).toContain(
      "With the phase's last PR open, or in session 5 of 5, carry on.",
    );
  });

  it('no longer exempts any open PR', () => {
    const text = notice();
    expect(text).not.toContain('If the phase PR is not open yet');
    expect(text).not.toContain('With the PR open,');
  });

  it('is still a single line with the handover, the 5 of 5 session and the subagent line', () => {
    const text = notice();
    expect(text).not.toContain('\n');
    expect(text).toContain('hand over');
    expect(text).toContain('5 of 5');
    expect(text).toContain('Subagent: ignore this notice');
  });

  it('follows the rule of the "Phase context ceiling" sub-item of docs/FLOW.md', () => {
    const flow = readFileSync('docs/FLOW.md', 'utf8');
    const phase = section(flow, '## For the phase session');
    const ceiling = between(
      phase,
      '   - **Phase context ceiling:**',
      '4. Every briefing for a behavior change',
    );
    expect(ceiling).toContain("the phase's **last** PR");
    expect(ceiling).toContain('between a merged PR and the next one');
  });
});

// Stage #2474, phase CG1 (decisions 1 to 7 and 11): the `PreToolUse` gate on opening a PR, and the tester role.
const PR_TOOL = 'mcp__github__create_pull_request';
const CREATE_PR: Call = {
  hook_event_name: 'PreToolUse',
  tool_name: PR_TOOL,
  tool_input: { owner: 'o', repo: 'r', title: 't', head: 'h', base: 'b' },
};
const preCall = (command: string): Call => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
});
const resumeLine = (k: number, n: number): string =>
  `\n\nRetomada por contexto (${k} de ${n}): a sessão anterior (session_01X) passou a vez com 271 mil.`;

interface Denial {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
}
const denialOf = (r: Result): Denial => {
  expect(r.status).toBe(0);
  expect(r.stdout.trimEnd().split('\n')).toHaveLength(1);
  return JSON.parse(r.stdout) as Denial;
};

describe('CG1 — opensPullRequest (decision 2)', () => {
  it('the create_pull_request tool opens a PR', () => {
    expect(opensPr(PR_TOOL, {})).toBe(true);
  });

  it.each([
    'gh pr create --base epic/x --title t',
    'cd /x && gh pr create',
    'gh api repos/o/r/pulls -f title=t -f head=h -f base=b',
    'gh api repos/o/r/pulls --field title=t',
    'gh api repos/o/r/pulls --raw-field title=t',
    'gh api repos/o/r/pulls -F title=t',
    'gh api repos/o/r/pulls --input body.json',
    'gh api repos/o/r/pulls -X POST',
    'gh api --method POST repos/o/r/pulls',
    'gh api "repos/o/r/pulls" -f title=t',
    "gh api 'repos/o/r/pulls?x=1' -f title=t",
  ])('Bash that opens a PR: %s', (command) => {
    expect(opensPr('Bash', { command })).toBe(true);
  });

  it.each([
    'gh api repos/o/r/pulls',
    'gh api repos/o/r/pulls/12',
    'gh api repos/o/r/pulls/12/merge -X PUT',
    'gh api repos/o/r/pulls/12 -f state=closed',
    'gh api -X GET repos/o/r/pulls',
    'gh pr view 12',
    'gh pr merge 12',
    'git status',
  ])('Bash that does not open a PR: %s', (command) => {
    expect(opensPr('Bash', { command })).toBe(false);
  });

  it.each([
    'git commit -m "gate refuses gh pr create above the trigger"',
    "echo 'gh pr create'",
    'grep -n "gh pr create" docs/FLOW.md',
    'echo gh api repos/o/r/pulls -f title=t',
    'gh api repos/o/r/pulls -X GET -f head=o:b -f state=open',
    'gh api --method GET repos/o/r/pulls -f state=open',
  ])(
    'review: Bash that only mentions a PR open, or lists with GET, does not open one: %s',
    (command) => {
      expect(opensPr('Bash', { command })).toBe(false);
    },
  );

  it.each([
    'cd /x && gh pr create --base b',
    'git push -u origin b; gh pr create',
    'git push || gh pr create',
    'echo done | gh pr create --body-file -',
    'GH_TOKEN=x gh pr create',
    '(gh pr create)',
    'git status\ngh pr create',
    'cd /x && gh api repos/o/r/pulls -f title=t',
  ])('review: Bash with gh in command position still opens a PR: %s', (command) => {
    expect(opensPr('Bash', { command })).toBe(true);
  });

  it('every other tool passes, and malformed input is not a PR', () => {
    for (const name of [
      'mcp__github__merge_pull_request',
      'mcp__github__update_pull_request',
      'mcp__github__pull_request_read',
      'Read',
    ])
      expect(opensPr(name, { command: 'gh pr create' }), name).toBe(false);
    expect(opensPr('Bash', null)).toBe(false);
    expect(opensPr('Bash', { command: 42 })).toBe(false);
    expect(opensPr(undefined, undefined)).toBe(false);
  });
});

describe('CG1 — the PR gate (decisions 1, 3, 4 and 5)', () => {
  it('create_pull_request above 270,000 in a phase is refused, with the JSON and the text of decision 4', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    const out = denialOf(hook(box, CREATE_PR));
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    const text = out.hookSpecificOutput.permissionDecisionReason;
    expect(text).toContain(
      'Context gate: this phase session is at 271 thousand, above the trigger of 270 thousand',
    );
    expect(text).toContain('Phase context ceiling');
    expect(text).toContain('docs/FLOW.md');
    expect(text).toContain('steps 1 to 5 of the handover');
    expect(text).toContain('<n> = 271');
    expect(text).toContain('the successor opens the PR');
    expect(text).toContain('/code-review');
    expect(text).toContain('not "the PR open"');
    expect(text).toContain(
      'Subagent: return to the phase session without opening the PR.',
    );
    expect(text).not.toContain('\n');
  });

  it('at 270,000 exactly it passes', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER)]);
    silent(hook(box, CREATE_PR));
  });

  it('every refused form of decision 2 is denied above the trigger, with no PASSO: each attempt is refused', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    for (const command of [
      'gh pr create --base epic/x',
      'gh api repos/o/r/pulls -f title=t',
      'gh api repos/o/r/pulls -X POST',
    ])
      expect(
        denialOf(hook(box, preCall(command))).hookSpecificOutput.permissionDecision,
      ).toBe('deny');
    denialOf(hook(box, CREATE_PR));
    denialOf(hook(box, CREATE_PR));
  });

  it('the listing, the merge and the other tools pass above the trigger', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 50_000)]);
    silent(hook(box, preCall('gh api repos/o/r/pulls')));
    silent(hook(box, preCall('gh api repos/o/r/pulls/12')));
    silent(hook(box, preCall('git status')));
    silent(
      hook(box, {
        hook_event_name: 'PreToolUse',
        tool_name: 'mcp__github__merge_pull_request',
      }),
    );
  });

  it('the short prompt of the coordinator is a phase too', () => {
    const box = sandbox([userLine(queuePrompt), measure(TRIGGER + 1)]);
    denialOf(hook(box, CREATE_PR));
  });

  it('a call with agent_id is refused the same way', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    denialOf(hook(box, { ...CREATE_PR, agent_id: 'agent-1' }));
  });

  it('session 5 of 5 goes to the end; 4 of 5 is refused; a prompt without the line is session 1 and is refused', () => {
    const last = sandbox([userLine(phasePrompt + resumeLine(5, 5)), measure(300_000)]);
    silent(hook(last, CREATE_PR));
    const fourth = sandbox([userLine(phasePrompt + resumeLine(4, 5)), measure(300_000)]);
    denialOf(hook(fourth, CREATE_PR));
    const first = sandbox([userLine(phasePrompt), measure(300_000)]);
    denialOf(hook(first, CREATE_PR));
  });

  it('MARCADOR_RETOMADA captures k and N from the resume line of docs/FLOW.md', () => {
    const m = (MARCADOR_RETOMADA as RegExp).exec('Retomada por contexto (3 de 5): x');
    expect(m?.slice(1, 3)).toEqual(['3', '5']);
    expect((MARCADOR_RETOMADA as RegExp).test('Retomada por contexto (x de 5)')).toBe(
      false,
    );
  });

  it('the resume line in a text block after the first one counts', () => {
    const box = sandbox([
      userLine([
        { type: 'text', text: phasePrompt },
        { type: 'text', text: resumeLine(5, 5).trim() },
      ]),
      measure(300_000),
    ]);
    silent(hook(box, CREATE_PR));
  });

  it('the coordinator and the tester are never refused', () => {
    const coordinator = sandbox([userLine('/implementar-fila #1856'), measure(400_000)]);
    silent(hook(coordinator, CREATE_PR));
    const tester = sandbox([
      userLine('Read `docs/TESTING-NUVEM.md` and run in modo dirigido: R0.'),
      measure(400_000),
    ]);
    silent(hook(tester, CREATE_PR));
    const other = sandbox([userLine('Hi'), measure(400_000)]);
    silent(hook(other, CREATE_PR));
  });

  it('fails open: unset CLAUDE_CODE_REMOTE, no measure, undecided role, bad input and a missing transcript give no output', () => {
    const phase = [userLine(phasePrompt), measure(TRIGGER + 1)];
    silent(hook(sandbox(phase), CREATE_PR, { remote: false }));
    silent(hook(sandbox([userLine(phasePrompt)]), CREATE_PR));
    silent(hook(sandbox([measure(TRIGGER + 1)]), CREATE_PR)); // no initial prompt yet: undecided
    silent(hook(sandbox(phase), CREATE_PR, { raw: 'not json' }));
    const box = sandbox(phase);
    silent(hook(box, { ...CREATE_PR, transcript_path: join(box.tmp, 'missing.jsonl') }));
    silent(hook(box, { ...CREATE_PR, transcript_path: '' }));
    silent(hook(box, { ...CREATE_PR, tool_input: undefined, tool_name: 'Bash' }));
  });

  it('review: a subagent call (agent_id) never writes the role to the state', () => {
    const box = sandbox([userLine('You are a subagent.'), measure(TRIGGER + 1)]);
    silent(hook(box, { ...CREATE_PR, agent_id: 'agent-1' }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('a corrupted state does not break the gate: it fails open', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    mkdirSync(join(box.tmp, 'context-guard'), { recursive: true });
    writeFileSync(box.state, '{ not json');
    silent(hook(box, CREATE_PR));
  });

  it('the gate does not change contexto, ferramenta, ultimoAviso or saltos in the state', () => {
    const box = sandbox([userLine(phasePrompt), measure(260_000)]);
    silent(hook(box, { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }));
    appendFileSync(box.transcript, measure(TRIGGER + 5_000) + '\n');
    warningOf(hook(box, { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
    const before = stateOf(box);
    denialOf(hook(box, CREATE_PR));
    appendFileSync(box.transcript, measure(TRIGGER + 9_000) + '\n');
    denialOf(hook(box, CREATE_PR));
    expect(stateOf(box)).toEqual(before);
  });

  it('the gate records the role it had to decide, and never contexto', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    denialOf(hook(box, CREATE_PR));
    const state = stateOf(box);
    expect(state).toMatchObject({ fase: true, papel: 'fase' });
    expect(state.contexto).toBeUndefined();
    expect(state.ultimoAviso).toBeNull();
    // The PostToolUse path that follows still works from that state.
    const out = warningOf(hook(box, { hook_event_name: 'PostToolUse' }));
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  });

  it('PostToolUse, or no hook_event_name, runs today path; a PostToolUse of create_pull_request is not gated', () => {
    const a = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    expect(
      warningOf(hook(a, { ...CREATE_PR, hook_event_name: 'PostToolUse' }))
        .hookSpecificOutput.hookEventName,
    ).toBe('PostToolUse');
    const b = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    expect(
      warningOf(hook(b, { tool_name: PR_TOOL })).hookSpecificOutput.hookEventName,
    ).toBe('PostToolUse');
  });

  it('a PreToolUse that is not a PR open is silent, with no notice and no state change in a phase', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    silent(hook(box, preCall('git status')));
  });
});

describe('CG1 — the phase notice (decision 6)', () => {
  const notice = (): string =>
    warningOf(hook(sandbox([userLine(phasePrompt), measure(TRIGGER + 1)])))
      .hookSpecificOutput.additionalContext;

  it('carries the new sentence before "Largest jumps"', () => {
    const text = notice();
    const sentence =
      'The `/code-review` of item 10 and the fixes of its findings come before the PR and are not the PR open; above the trigger the hook refuses to open the PR. ';
    expect(text).toContain(sentence + 'Largest jumps');
    expect(text).not.toContain('\n');
  });

  it('the coordinator notice is unchanged', () => {
    const box = sandbox([
      userLine('/implementar-fila #1856'),
      measure(COORD_TRIGGER + 1),
    ]);
    const text = warningOf(hook(box)).hookSpecificOutput.additionalContext;
    expect(text).not.toContain('refuses to open the PR');
    expect(text).toBe(
      `Context hook: this coordinator session is at 321 thousand, above its trigger of 320 thousand. ` +
        `This counts as "above 35%" of "Session switch" in .claude/skills/implementar-fila/SKILL.md: ` +
        `hand the coordination over now, in this turn, after the lineage check ("Lineage limit"), ` +
        `without rereading a changed SKILL.md. ` +
        `With no room in the lineage, the owner's path of "Lineage limit" applies once, and the later notices do not repeat it. ` +
        `A session that already handed over (no longer the registered coordinator) ignores this notice. ` +
        `Largest jumps (approximate): none recorded. Subagent: ignore this notice.`,
    );
  });
});

describe('CG1 — the tester role (decision 7)', () => {
  const testerPrompts = [
    'Read `docs/TESTING-NUVEM.md` and run in modo dirigido: R0. Passada visual: nenhuma. Branch `epic/x`.',
    'Read `docs/TESTING-NUVEM.md` and run in modo dirigido: findings 1.2 of the report. Branch `epic/x`.',
    'Read `docs/TESTING-NUVEM.md` and run in modo dirigido, grupo 2 de 3: R1, R2.',
    'Read `docs/TESTING-NUVEM.md` and run the modo completo, bloco 4 de 6. Passada visual: R5.',
    'Read `docs/TESTING-NUVEM.md` and run in `modo dirigido`: R0 and R2.',
    'Read `docs/TESTING-NUVEM.md` and run the `modo completo, bloco 1 de 6`. Tail.',
    '  Read `docs/TESTING-NUVEM.md` and run the `modo completo`. Branch `epic/x`.',
  ];

  it('the constants: the trigger is 250,000 and the prompt marker is a regex', () => {
    expect(TESTER_TRIGGER).toBe(250_000);
    expect(MARCADOR_TESTADOR).toBeInstanceOf(RegExp);
  });

  it.each(testerPrompts)('the prompt form is a tester: %s', (prompt) => {
    expect(roleOf([prompt])).toBe('testador');
    const box = sandbox([userLine(prompt), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: false, papel: 'testador' });
  });

  it('prose about a tester, a different doc and a mid-text mention stay silent', () => {
    for (const prompt of [
      'You are the tester of stage #1856.',
      'Read `docs/TESTING.md` and run in modo dirigido: R0.',
      'Please Read `docs/TESTING-NUVEM.md` and run in modo dirigido: R0.',
      'Read `docs/TESTING-NUVEM.md` and run the tests.',
    ])
      expect(roleOf([prompt]), prompt).toBeNull();
  });

  it('a phase prompt and the coordinator win over the tester mention', () => {
    expect(
      roleOf([phasePrompt + ' Read `docs/TESTING-NUVEM.md` and run in modo dirigido']),
    ).toBe('fase');
    expect(roleOf(['/implementar-fila x', testerPrompts[0] ?? ''])).toBe('coordenador');
  });

  const tester = testerPrompts[0];

  it('silent at 250,000 and a one-line notice at 250,001', () => {
    const a = sandbox([userLine(tester), measure(TESTER_TRIGGER)]);
    silent(hook(a));
    expect(stateOf(a).ultimoAviso).toBeNull();

    const b = sandbox([userLine(tester), measure(TESTER_TRIGGER + 1)]);
    const out = warningOf(hook(b));
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(stateOf(b)).toMatchObject({
      fase: false,
      papel: 'testador',
      ultimoAviso: TESTER_TRIGGER + 1,
    });
  });

  it('the notice has the items of decision 7 and a single line', () => {
    const box = sandbox([userLine(tester), measure(TESTER_TRIGGER + 1)]);
    const text = warningOf(hook(box)).hookSpecificOutput.additionalContext;
    expect(text).toContain(
      'Context hook: this tester session is at 251 thousand, above its trigger of 250 thousand',
    );
    expect(text).toContain('ceiling 300 thousand');
    expect(text).toContain('"Context up to 300 thousand" of docs/TESTING-NUVEM.md');
    expect(text).toContain('every remaining batch runs in a subagent');
    expect(text).toContain('reads only its summary line');
    expect(text).toContain('the guide, the captures, the `runs` or the reports');
    expect(text).toContain('assembles the report from the files of `apoio/`');
    expect(text).toContain('no step marked "not executed" for context');
    expect(text).toContain('Largest jumps (approximate): none recorded');
    expect(text).toContain('Subagent: ignore this notice.');
    expect(text).not.toContain('hand over');
    expect(text).not.toContain('\n');
  });

  it('repeats at +10 thousand, and a compaction resets it with its own trigger', () => {
    const box = sandbox([userLine(tester), measure(TESTER_TRIGGER + 1)]);
    warningOf(hook(box));
    appendFileSync(box.transcript, measure(259_999) + '\n');
    silent(hook(box));
    appendFileSync(box.transcript, measure(260_001) + '\n');
    expect(warningOf(hook(box)).hookSpecificOutput.additionalContext).toContain(
      '261 thousand',
    );
    appendFileSync(box.transcript, measure(TESTER_TRIGGER) + '\n'); // compaction
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();
    appendFileSync(box.transcript, measure(255_000) + '\n');
    expect(warningOf(hook(box)).hookSpecificOutput.additionalContext).toContain(
      '255 thousand',
    );
  });

  it('the phase trigger does not apply to the tester, and the tester trigger does not apply to a phase', () => {
    const t = sandbox([userLine(tester), measure(260_000)]);
    warningOf(hook(t));
    const f = sandbox([userLine(phasePrompt), measure(260_000)]);
    silent(hook(f));
  });
});

// Stage #2474, phase CG2 (decision 8 and the CG2 part of 11): the FLOW sub-item says what the hook and the gate do.
describe('CG2 — docs/FLOW.md: the PR gate in the phase session (decision 8)', () => {
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const phase = section(flow, '## For the phase session');
  const ceiling = between(
    phase,
    '   - **Phase context ceiling:**',
    '4. Every briefing for a behavior change',
  );
  const hook = between(ceiling, '**Hook:**', '**Transition:**');
  const checks = between(ceiling, 'Check at two points', 'Once the phase PR');

  it('the Hook sentence describes the PreToolUse gate and its exemption', () => {
    expect(hook).toContain('`PreToolUse`');
    expect(hook).toContain('refuses to open the PR');
    expect(hook).toContain(`above the trigger of ${TRIGGER / 1000} thousand`);
    expect(hook).toContain('except in the `5 de 5` session');
    expect(hook).toContain('the successor opens the PR');
    expect(hook).not.toContain('it does not block');
  });

  it('the Hook sentence says the tester gets its own notice from 250 thousand, and the supervision and the fast track get none', () => {
    expect(hook).toContain(`its own notice from ${TESTER_TRIGGER / 1000} thousand`);
    expect(hook).toContain('docs/TESTING-NUVEM.md');
    expect(hook).toContain('`/supervisionar-fila` and `/via-rapida` get none');
    expect(hook).not.toContain('the tester, `/supervisionar-fila`');
  });

  it('check (c) comes before the /code-review of item 10, with --teto equal to the trigger', () => {
    expect(checks).toContain('(c) before the `/code-review` of item 10');
    expect(checks.indexOf('(c)')).toBeGreaterThan(checks.indexOf('(b)'));
    expect(checks).toContain('only in a phase that has item 10');
    expect(checks).toContain(`--teto ${TRIGGER}`);
    expect(checks).toContain('hands over before the review');
    expect(checks).toContain('the successor runs the review and opens the PR');
  });

  it('the /code-review and the fixes of its findings never count as the PR open', () => {
    expect(ceiling).toMatch(
      /Once the phase PR is open[^.]*there is no switch[^.]*\.[^.]*the `\/code-review` and the fixes of its findings come before the PR and never count as the PR open/,
    );
  });

  it('the 300 thousand ceiling, the 4 switches, the resume line and checks (a) and (b) stay', () => {
    expect(ceiling).toContain('300,000');
    expect(ceiling).toContain('At most 4 switches per phase (5 sessions)');
    expect(ceiling).toContain('Retomada por contexto (<k> de 5)');
    expect(checks).toContain('(a) before sending a new task to a subagent');
    expect(checks).toContain('(b) before running the gates of item 5');
  });
});
