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
// @ts-expect-error .mjs module without type declarations
import { GATILHO, MARCADOR } from '../../scripts/ci/contextGuard.mjs';

const TRIGGER = GATILHO as number;
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

  it('the coordinator, the tester and the supervision stay out', () => {
    for (const prompt of [
      '/implementar-fila #1856',
      'You are the tester of stage #1856.',
      '/supervisionar-fila',
    ]) {
      const box = sandbox([userLine(prompt), measure(300_000)]);
      silent(hook(box));
      expect(stateOf(box).fase, prompt).toBe(false);
    }
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
    expect(Object.keys(settings.hooks).sort()).toEqual(['PostToolUse', 'SessionStart']);
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
