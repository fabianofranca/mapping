// @vitest-environment node
// Etapa #1856, fase GC1 (decisões 1 a 8, 10 e 12a): o gancho `PostToolUse` que mede o contexto da
// sessão de fase depois de cada chamada de ferramenta e avisa a troca acima do gatilho
// (`scripts/ci/contextGuard.mjs`), e a entrada dele no `.claude/settings.json`. O gancho roda como
// processo (`spawnSync`), com a entrada no stdin e `CLAUDE_CODE_REMOTE` e `TMPDIR` no `env`; o
// transcript é uma fixture `.jsonl` no formato do `contextUsage.test.ts`.
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
// @ts-expect-error módulo .mjs sem declaração de tipos
import { GATILHO, MARCADOR } from '../../scripts/ci/contextGuard.mjs';

const TRIGGER = GATILHO as number;
const MARK = MARCADOR as string;
const TAIL = 2 * 1024 * 1024;

const phasePrompt = `${MARK}GC1 — o gancho da etapa #1856 do repositório \`fabianofranca/mapping\`.`;
// O que o coordenador manda de fato (skill `implementar-fila`, "Por etapa"): abre por `Fase <código> —`.
const queuePrompt =
  'Fase GC1 — Gancho de contexto da fase da etapa #1856 (sub-issue #1882), do repositório `fabianofranca/mapping`, no fluxo automatizado.';

/** Linha `user` com o prompt em string. */
const userLine = (content: unknown): string =>
  JSON.stringify({
    type: 'user',
    isSidechain: false,
    message: { role: 'user', content },
  });

/** Linha do assistente com a soma `n` de contexto, no formato real do transcript. */
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
  /** `TMPDIR` do gancho. */
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

describe('GC1 — contextGuard.mjs: as constantes (decisões 1 e 4)', () => {
  it('o gatilho é 270.000 e o marcador é a primeira frase da mensagem da fase', () => {
    expect(TRIGGER).toBe(270_000);
    expect(MARK).toBe('Você é o agente da fase ');
  });
});

describe('GC1 — contextGuard.mjs: as saídas em silêncio (decisão 4)', () => {
  it('sem CLAUDE_CODE_REMOTE: código 0, sem saída, sem estado', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, {}, { remote: false }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('com agent_id (chamada de subagente): sem saída e nem o estado é gravado', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, { agent_id: 'agent-1' }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('transcript_path vazio ou inexistente: sem saída', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, { transcript_path: '' }));
    silent(hook(box, { transcript_path: join(box.tmp, 'nao-existe.jsonl') }));
  });

  it('sessão que não é de fase: sem saída, fase=false no estado e sem reler o prompt', () => {
    const box = sandbox([
      userLine('Oi, pode me ajudar com o projeto?'),
      measure(300_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
    // A segunda chamada reaproveita o estado: trocar o prompt por um de fase não muda a decisão.
    writeFileSync(
      box.transcript,
      [userLine(phasePrompt), measure(300_000)].join('\n') + '\n',
    );
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
  });

  it('o coordenador, o testador e a supervisão ficam de fora', () => {
    for (const prompt of [
      '/implementar-fila #1856',
      'Você é o testador da etapa #1856.',
      '/supervisionar-fila',
    ]) {
      const box = sandbox([userLine(prompt), measure(300_000)]);
      silent(hook(box));
      expect(stateOf(box).fase, prompt).toBe(false);
    }
  });
});

describe('GC1 — contextGuard.mjs: o prompt da sessão de fase (decisão 4)', () => {
  it('a mensagem de "Para a sessão da fase" do docs/FLOW.md vale', () => {
    const box = sandbox([userLine(phasePrompt), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('o prompt curto do coordenador (`Fase <código> — … (sub-issue #n)`) também vale', () => {
    const box = sandbox([userLine(queuePrompt), measure(100_000)]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('`Fase` solta, sem a etapa e a sub-issue, não vale', () => {
    const box = sandbox([
      userLine('Fase de testes do projeto: me ajude a revisar.'),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(false);
  });

  it('a primeira linha user em lista de blocos vale pelo primeiro bloco text', () => {
    const box = sandbox([
      userLine([
        { type: 'image', source: {} },
        { type: 'text', text: phasePrompt },
        { type: 'text', text: 'outro bloco' },
      ]),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });

  it('um bloco text de lembrete antes do prompt não esconde a sessão de fase', () => {
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

  it('a primeira linha user vale, mesmo com outras linhas antes dela e uma user depois', () => {
    const box = sandbox([
      JSON.stringify({ type: 'queue-operation', operation: 'enqueue' }),
      JSON.stringify({ type: 'attachment', isSidechain: false }),
      userLine(phasePrompt),
      userLine('Oi'),
      measure(100_000),
    ]);
    silent(hook(box));
    expect(stateOf(box).fase).toBe(true);
  });
});

describe('GC1 — contextGuard.mjs: o estado e o gatilho (decisões 5, 6 e 8)', () => {
  it('abaixo do gatilho: sem saída; o estado traz fase, contexto e a ferramenta da chamada', () => {
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

  it('270.000 não avisa; 270.001 avisa, com o JSON da decisão 8', () => {
    const a = sandbox([userLine(phasePrompt), measure(TRIGGER)]);
    silent(hook(a));
    expect(stateOf(a).ultimoAviso).toBeNull();

    const b = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    const out = warningOf(hook(b));
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    const text = out.hookSpecificOutput.additionalContext;
    expect(text).toContain('271 mil');
    expect(text).toContain('270 mil');
    expect(text).toContain('passe a vez');
    expect(text).toContain('5 de 5');
    expect(text).toContain('Subagente: ignore este aviso');
    expect(text).not.toContain('\n');
    expect(stateOf(b).ultimoAviso).toBe(TRIGGER + 1);
  });

  it('a repetição: depois do aviso em 270.001, 279.999 não repete e 280.001 repete', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    warningOf(hook(box));

    appendFileSync(box.transcript, measure(279_999) + '\n');
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBe(TRIGGER + 1);

    appendFileSync(box.transcript, measure(280_001) + '\n');
    const out = warningOf(hook(box));
    expect(out.hookSpecificOutput.additionalContext).toContain('281 mil');
    expect(stateOf(box).ultimoAviso).toBe(280_001);
  });
});

describe('GC1 — contextGuard.mjs: a medida cai depois de uma compactação (achado da revisão)', () => {
  it('o contexto que volta ao gatilho ou abaixo zera o último aviso: o próximo cruzamento avisa', () => {
    const box = sandbox([userLine(phasePrompt), measure(290_000)]);
    warningOf(hook(box));
    expect(stateOf(box).ultimoAviso).toBe(290_000);

    appendFileSync(box.transcript, measure(100_000) + '\n'); // compactação
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();

    appendFileSync(box.transcript, measure(275_000) + '\n');
    const out = warningOf(hook(box));
    expect(out.hookSpecificOutput.additionalContext).toContain('275 mil');
    expect(stateOf(box).ultimoAviso).toBe(275_000);
  });

  it('exatamente no gatilho também zera o último aviso', () => {
    const box = sandbox([userLine(phasePrompt), measure(TRIGGER + 1)]);
    warningOf(hook(box));
    appendFileSync(box.transcript, measure(TRIGGER) + '\n');
    silent(hook(box));
    expect(stateOf(box).ultimoAviso).toBeNull();
  });
});

describe('GC1 — contextGuard.mjs: os saltos (decisão 7)', () => {
  it('o salto vai para a ferramenta da chamada anterior, e o aviso lista os 3 maiores', () => {
    const box = sandbox([userLine(phasePrompt), measure(100_000)]);
    const command = 'npm run lint && npm run typecheck && npm test && npm run build';
    silent(hook(box, { tool_name: 'Bash', tool_input: { command } }));

    appendFileSync(box.transcript, measure(130_500) + '\n'); // +30,5 mil para o Bash
    silent(hook(box, { tool_name: 'Read', tool_input: { file_path: 'docs/FLOW.md' } }));

    appendFileSync(box.transcript, measure(200_000) + '\n'); // +69,5 mil para o Read
    silent(
      hook(box, { tool_name: 'Agent', tool_input: { description: 'Escrever o teste' } }),
    );

    appendFileSync(box.transcript, measure(290_000) + '\n'); // +90 mil para o Agent
    const out = warningOf(hook(box, { tool_name: 'Grep', tool_input: { pattern: 'x' } }));
    const text = out.hookSpecificOutput.additionalContext;

    const bash = `Bash: ${command.slice(0, 40)}`;
    expect(bash).toBe('Bash: npm run lint && npm run typecheck && npm');
    expect(text).toContain('290 mil');
    const agent = text.indexOf('Agent: Escrever o teste +90 mil');
    const read = text.indexOf('Read: docs/FLOW.md +70 mil');
    const first = text.indexOf(`${bash} +31 mil`);
    expect(agent).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(agent);
    expect(first).toBeGreaterThan(read);
    expect(stateOf(box)).toMatchObject({
      ferramenta: 'Grep',
      saltos: [
        { rotulo: 'Agent: Escrever o teste', mil: 90 },
        { rotulo: 'Read: docs/FLOW.md', mil: 70 },
        { rotulo: bash, mil: 31 },
      ],
    });
  });

  it('o rótulo de um comando com quebras de linha vira uma linha só (o aviso é uma linha)', () => {
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

  it('só os 3 maiores ficam no estado, e uma medida que não cresce não gera salto', () => {
    const box = sandbox([userLine(phasePrompt), measure(10_000)]);
    const steps = [5_000, 40_000, 10_000, 70_000, 0, 20_000];
    let total = 10_000;
    silent(hook(box, { tool_name: 'T0' }));
    steps.forEach((step, i) => {
      total += step;
      appendFileSync(box.transcript, measure(total) + '\n');
      silent(hook(box, { tool_name: `T${i + 1}` }));
    });
    // Saltos: T0 +5, T1 +40, T2 +10, T3 +70, T4 +0 (medida igual: nada), T5 +20. Ficam os 3 maiores.
    expect(stateOf(box).saltos).toEqual([
      { rotulo: 'T3', mil: 70 },
      { rotulo: 'T1', mil: 40 },
      { rotulo: 'T5', mil: 20 },
    ]);

    // Contexto que cai (compactação) não vira salto negativo.
    appendFileSync(box.transcript, measure(30_000) + '\n');
    silent(hook(box, { tool_name: 'T7' }));
    expect(stateOf(box).saltos.every((s) => s.mil > 0)).toBe(true);
    expect(stateOf(box).contexto).toBe(30_000);
  });

  it('outra ferramenta usa o tool_name como rótulo; sem o campo do rótulo, também', () => {
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

describe('GC1 — contextGuard.mjs: a leitura do transcript (decisão 5)', () => {
  const filler = (bytes: number): string[] => {
    const line = userLine('x'.repeat(900));
    return Array.from({ length: Math.ceil(bytes / (line.length + 1)) }, () => line);
  };

  it('transcript maior que 2 MiB com a última medida no fim: vale a do fim, e a linha cortada não quebra', () => {
    // A linha de 4.000 bytes atravessa o limite dos 2 MiB finais: o começo dela fica de fora.
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

  it('a última medida antes dos 2 MiB finais: cai na leitura inteira', () => {
    const lines = [userLine(phasePrompt), measure(123_456), ...filler(TAIL + 200_000)];
    const box = sandbox(lines);
    expect(readFileSync(box.transcript).length).toBeGreaterThan(TAIL);
    silent(hook(box));
    expect(stateOf(box)).toMatchObject({ fase: true, contexto: 123_456 });
  });

  it('sem nenhuma medida no transcript: sem saída', () => {
    const box = sandbox([userLine(phasePrompt)]);
    silent(hook(box));
  });
});

describe('GC1 — contextGuard.mjs: as falhas nunca travam a chamada (decisão 6)', () => {
  it('estado corrompido: código 0 e sem saída, e o estado volta a ser um JSON com o erro', () => {
    const box = sandbox([userLine(phasePrompt), measure(120_000)]);
    mkdirSync(join(box.tmp, 'context-guard'), { recursive: true });
    writeFileSync(box.state, '{"fase": tr');
    silent(hook(box));
    const state = stateOf(box);
    expect(typeof state.erro?.mensagem).toBe('string');
    expect(state.erro?.em).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('entrada que não é JSON: código 0 e sem saída', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    silent(hook(box, {}, { raw: 'isto não é json' }));
    silent(hook(box, {}, { raw: '' }));
    silent(hook(box, {}, { raw: '[1,2]' }));
    expect(existsSync(box.state)).toBe(false);
  });

  it('session_id que escaparia da pasta do estado: sem saída e sem gravar fora dela', () => {
    const box = sandbox([userLine(phasePrompt), measure(300_000)]);
    box.sessionId = '../fora';
    silent(hook(box));
    expect(existsSync(join(box.tmp, 'fora.json'))).toBe(false);
  });
});

describe('GC1 — .claude/settings.json (decisão 10)', () => {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
    permissions: { allow: string[]; deny: string[] };
    hooks: Record<string, { matcher?: string; hooks: Record<string, unknown>[] }[]>;
  };

  it('PostToolUse tem uma entrada com matcher * e o comando do gancho, com timeout 10', () => {
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

  it('o SessionStart continua igual e as permissões não mudam', () => {
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
