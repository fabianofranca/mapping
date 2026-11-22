// Claude Code context hook (stage #1856, phase GC1; coordinator role: stage #2228, phase CH1; PR gate and
// tester role: stage #2474, phase CG1). Node only, no dependencies; the measure is that of
// `contextUsage.mjs` (`lastContext`).
//   Wired in `.claude/settings.json`, the same command in two events:
//     node "$CLAUDE_PROJECT_DIR/scripts/ci/contextGuard.mjs"
//   Reads the hook input (JSON) from stdin and branches on `hook_event_name`: `PreToolUse` runs the PR
//   gate; `PostToolUse`, or no field, runs the notice. Only acts in the cloud (`CLAUDE_CODE_REMOTE=true`).
//   Three roles, decided once from the transcript's initial prompt (`sessionRole`; checked in this order):
//     - `fase`: a phase or fix session (the prompt opens with `MARCADOR` or with the coordinator's short
//       prompt), trigger `GATILHO` (270 thousand);
//     - `coordenador`: the queue coordinator (the prompt is the `/implementar-fila` command,
//       `MARCADOR_COORDENADOR`), trigger `GATILHO_COORDENADOR` (320 thousand);
//     - `testador`: the cloud tester (the prompt opens with `Read `docs/TESTING-NUVEM.md` and run` in
//       one of the `modo` forms, `MARCADOR_TESTADOR`), trigger `GATILHO_TESTADOR` (250 thousand).
//     Any other session (supervisor, fast track, owner's chat) is silent (`nenhum`).
//   Notice (`PostToolUse`, main thread only, no `agent_id`): with the context above the role's trigger,
//     and at every +`PASSO` after the last notice, it writes to stdout
//     `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<notice>"}}`; a compaction
//     (context back at the trigger or below) resets it. The state lives in
//     `<os.tmpdir()>/context-guard/<session_id>.json`: `papel` (`fase`, `coordenador`, `testador` or
//     `nenhum`), `fase` (true only for a phase), `contexto`, `ferramenta`, `ultimoAviso`, `saltos` (the
//     3 largest) and `erro`. An old state without `papel` is a phase when `fase` is true, and otherwise
//     decided again once.
//   PR gate (`PreToolUse`, with or without `agent_id`): a `fase` session above `GATILHO` (strictly more)
//     that opens a PR (`opensPullRequest`: `create_pull_request`, `gh pr create` or a POST `gh api
//     …/pulls`) gets `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
//     "permissionDecisionReason":"<text>"}}`, on every attempt. Exempt: the last session of its phase
//     (`Retomada por contexto (<k> de <N>)` with k equal to N, `MARCADOR_RETOMADA`), the coordinator, the
//     tester and any other session. The gate reads the state for the role and writes it only to record a
//     role it had to decide, or the `erro`: it never touches `contexto`, `ferramenta`, `ultimoAviso` or
//     `saltos`, so the jumps of the notice stay right.
//   Known limit: the gate measures the `transcript_path` it receives; if that is a subagent's own
//     transcript the measure is lower and the call goes through.
//   Always exit code 0: the hook never blocks or delays a call except by the gate's deny, and any failure
//   (an error, an undecided role, no measure, outside the cloud) only silences it.
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { lastContext } from './contextUsage.mjs';

/** Context, in tokens, above which the hook warns a phase (single source; the phase ceiling is 300,000). */
export const GATILHO = 270000;
/**
 * Context above which the hook warns the queue coordinator (single source): 35% of a 1M window is
 * 350 thousand and the switch itself adds about 10 thousand.
 */
export const GATILHO_COORDENADOR = 320000;
/** Context above which the hook warns the cloud tester (single source; its ceiling is 300,000). */
export const GATILHO_TESTADOR = 250000;
/** The notice repeats at every rise of this much context since the last one. */
export const PASSO = 10000;
/** First sentence of the "For the phase session" message of `docs/FLOW.md`. */
export const MARCADOR = 'Você é o agente da fase ';
/**
 * Opening of the short prompt the coordinator actually sends (skill `implementar-fila`, "Per stage"):
 * `Fase <código> — <título> da etapa #<n> (sub-issue #<n>), …`.
 */
export const MARCADOR_FILA = /^Fase \S+ — .* da etapa #\d+ \(sub-issue #\d+\)/;
/**
 * The coordinator's initial prompt: the text, after `trimStart`, starts with `/implementar-fila`
 * followed by whitespace or the end (what `create_session` sends to the successor), or it contains
 * the form Claude Code records for a typed slash command.
 */
export const MARCADOR_COORDENADOR =
  /^\/implementar-fila(?:\s|$)|<command-name>\/implementar-fila<\/command-name>/;
/**
 * The resume line the coordinator adds to a successor phase (`docs/FLOW.md`, item 3 of "For the phase
 * session"): `Retomada por contexto (<k> de <N>)`.
 */
export const MARCADOR_RETOMADA = /Retomada por contexto \((\d+) de (\d+)\)/;
/**
 * The tester's initial prompt (`docs/FLOW.md`, "For the tester"; `docs/TESTING-NUVEM.md#inicio`): the text,
 * after `trimStart`, starts with ``Read `docs/TESTING-NUVEM.md` and run `` followed by `in modo` or
 * `the modo`, with or without a backtick before `modo`.
 */
export const MARCADOR_TESTADOR =
  /^Read `docs\/TESTING-NUVEM\.md` and run (?:in|the) `?modo/;
/** The hook reads only the end of the transcript, up to this many bytes. */
export const TAIL_BYTES = 2 * 1024 * 1024;
/** The initial prompt is searched for at the start of the transcript, up to this many bytes. */
export const HEAD_BYTES = 1024 * 1024;

const TETO_MIL = 300;
const ROTULO_BASH = 40;
const SALTOS_GUARDADOS = 3;
const SESSION_ID = /^[A-Za-z0-9_-]+$/;

/** Prompt texts of a `user` transcript line (the string, or the `text` blocks). */
export function promptTexts(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text);
}

/**
 * Texts of the first `type: "user"` line (the one that is not meta) at the start of the transcript, or
 * `null` when there is not yet a complete such line. A reminder block before the prompt does not hide
 * it. With `partial`, the text is a piece of the file and the last line, which may be cut off, is left out.
 */
export function firstPrompt(head, partial = false) {
  const lines = head.split('\n');
  if (partial) lines.pop();
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type === 'user' && entry.isMeta !== true) return promptTexts(entry);
  }
  return null;
}

/** Whether any of the initial prompt's texts opens a phase or fix session. */
export function isPhasePrompt(texts) {
  return texts.some((raw) => {
    const text = raw.trimStart();
    return text.startsWith(MARCADOR) || MARCADOR_FILA.test(text);
  });
}

/** The role of the session by the initial prompt's texts: `fase`, `coordenador`, `testador` or `null` (silent). */
export function sessionRole(texts) {
  if (isPhasePrompt(texts)) return 'fase';
  if (texts.some((raw) => MARCADOR_COORDENADOR.test(raw.trimStart())))
    return 'coordenador';
  return texts.some((raw) => MARCADOR_TESTADOR.test(raw.trimStart())) ? 'testador' : null;
}

const GH_API = /(?:^|[\s;&|(])gh\s+api\b/;
const PULLS_PATH = /repos\/[^\s/'"]+\/[^\s/'"]+\/pulls(?=[\s'"?]|$)/;
const BODY_FLAG = /(?:^|\s)(?:-[fF]|--field|--raw-field|--input)(?=[\s=]|$)/;
const POST_FLAG = /(?:^|\s)(?:-X\s*|--method[\s=]+)POST\b/i;
const PR_CREATE = /(?:^|[\s;&|(])gh\s+pr\s+create\b/;

/** Whether a tool call opens a pull request: the create tool, `gh pr create` or a POST `gh api …/pulls`. */
export function opensPullRequest(toolName, toolInput) {
  if (toolName === 'mcp__github__create_pull_request') return true;
  if (toolName !== 'Bash') return false;
  const command = toolInput?.command;
  if (typeof command !== 'string') return false;
  if (PR_CREATE.test(command)) return true;
  return (
    GH_API.test(command) &&
    PULLS_PATH.test(command) &&
    (BODY_FLAG.test(command) || POST_FLAG.test(command))
  );
}

/** Call label to attribute the jumps: `Bash: <40 characters>`, `Read: <file>`, … */
export function toolLabel(toolName, toolInput) {
  const name = typeof toolName === 'string' && toolName ? toolName : 'ferramenta';
  const input = toolInput !== null && typeof toolInput === 'object' ? toolInput : {};
  const field = { Bash: input.command, Read: input.file_path, Agent: input.description }[
    name
  ];
  // One line only: the whole notice goes on one line, and a command may have line breaks (heredoc).
  const text = typeof field === 'string' ? field.replace(/\s+/g, ' ').trim() : '';
  const shown = name === 'Bash' ? text.slice(0, ROTULO_BASH).trimEnd() : text;
  return shown ? `${name}: ${shown}` : name;
}

/** The largest jumps (`{ rotulo, mil }`), largest first, with the new one if it makes it in. */
export function addJump(jumps, rotulo, delta) {
  if (delta <= 0) return jumps;
  const all = [...jumps, { rotulo, mil: Math.ceil(delta / 1000) }];
  // `sort` is stable: on an equal jump, the one that came first stays.
  all.sort((a, b) => b.mil - a.mil);
  return all.slice(0, SALTOS_GUARDADOS);
}

/** Whether the context calls for a notice: above the trigger and, after a notice, at every +`PASSO`. */
export function shouldWarn(contexto, ultimoAviso, gatilho = GATILHO) {
  if (contexto <= gatilho) return false;
  return (
    ultimoAviso === null || ultimoAviso === undefined || contexto >= ultimoAviso + PASSO
  );
}

/** The notice text (one line), with the context and the session's largest jumps. */
export function warningText(contexto, jumps) {
  const mil = Math.ceil(contexto / 1000);
  const saltos =
    jumps.length > 0
      ? jumps.map((j) => `${j.rotulo} +${j.mil} thousand`).join('; ')
      : 'none recorded';
  return (
    `Context hook: this session is at ${mil} thousand, above the trigger of ${GATILHO / 1000} thousand ` +
    `(ceiling ${TETO_MIL} thousand; sub-item "Phase context ceiling" of item 3 of "For the phase session", ` +
    `docs/FLOW.md). If this is not session 5 of 5 and the phase's last PR is not open, ` +
    `hand over now (steps 1 to 5 of the handover), with <n> = ${mil}; ` +
    `a phase that opens several PRs hands over between a merged PR and the next one. ` +
    `With the phase's last PR open, or in session 5 of 5, carry on. ` +
    `The \`/code-review\` of item 10 and the fixes of its findings come before the PR and are not the PR open; above the trigger the hook refuses to open the PR. ` +
    `Largest jumps (approximate): ${saltos}. Subagent: ignore this notice.`
  );
}

/** The coordinator's notice text (one line), with the context and the session's largest jumps. */
export function coordinatorWarningText(contexto, jumps) {
  const mil = Math.ceil(contexto / 1000);
  const saltos =
    jumps.length > 0
      ? jumps.map((j) => `${j.rotulo} +${j.mil} thousand`).join('; ')
      : 'none recorded';
  return (
    `Context hook: this coordinator session is at ${mil} thousand, above its trigger of ${GATILHO_COORDENADOR / 1000} thousand. ` +
    `This counts as "above 35%" of "Session switch" in .claude/skills/implementar-fila/SKILL.md: ` +
    `hand the coordination over now, in this turn, after the lineage check ("Lineage limit"), ` +
    `without rereading a changed SKILL.md. ` +
    `With no room in the lineage, the owner's path of "Lineage limit" applies once, and the later notices do not repeat it. ` +
    `A session that already handed over (no longer the registered coordinator) ignores this notice. ` +
    `Largest jumps (approximate): ${saltos}. Subagent: ignore this notice.`
  );
}

/** The tester's notice text (one line), with the context and the session's largest jumps. */
export function testerWarningText(contexto, jumps) {
  const mil = Math.ceil(contexto / 1000);
  const saltos =
    jumps.length > 0
      ? jumps.map((j) => `${j.rotulo} +${j.mil} thousand`).join('; ')
      : 'none recorded';
  return (
    `Context hook: this tester session is at ${mil} thousand, above its trigger of ${GATILHO_TESTADOR / 1000} thousand ` +
    `(ceiling ${TETO_MIL} thousand; "Context up to 300 thousand" of docs/TESTING-NUVEM.md). ` +
    `From now on every remaining batch runs in a subagent, and the main thread reads only its summary line, ` +
    `not the guide, the captures, the \`runs\` or the reports. ` +
    `A subagent assembles the report from the files of \`apoio/\`. ` +
    `The round goes on, with no step marked "not executed" for context. ` +
    `Largest jumps (approximate): ${saltos}. Subagent: ignore this notice.`
  );
}

const WARNING_TEXTS = {
  fase: warningText,
  coordenador: coordinatorWarningText,
  testador: testerWarningText,
};
const TRIGGERS = {
  fase: GATILHO,
  coordenador: GATILHO_COORDENADOR,
  testador: GATILHO_TESTADOR,
};

/** The JSON that Claude Code reads from the hook's stdout. */
export function warningOutput(contexto, jumps, papel = 'fase') {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: (WARNING_TEXTS[papel] ?? warningText)(contexto, jumps),
    },
  });
}

/** The PR gate's refusal text (one line). */
export function gateText(contexto) {
  const mil = Math.ceil(contexto / 1000);
  return (
    `Context gate: this phase session is at ${mil} thousand, above the trigger of ${GATILHO / 1000} thousand. ` +
    `The PR is not opened above the trigger (sub-item "Phase context ceiling" of item 3 of "For the phase session", docs/FLOW.md). ` +
    `Hand over now (steps 1 to 5 of the handover), with <n> = ${mil}; the successor opens the PR. ` +
    `The /code-review of item 10 and the fixes of its findings are not "the PR open". ` +
    `Subagent: return to the phase session without opening the PR.`
  );
}

/** The JSON that refuses a `PreToolUse` call. */
export function gateOutput(contexto) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: gateText(contexto),
    },
  });
}

function readRange(path, start, length) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = readSync(fd, buffer, 0, length, start);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Context of the last model call: reads the end of the transcript and, with no measure there, the whole file. */
export function measureTranscript(path) {
  const size = statSync(path).size;
  if (size <= TAIL_BYTES) return lastContext(readFileSync(path, 'utf8'));
  // The line cut off at the start of the piece does not count: its `JSON.parse` fails and it is skipped.
  const tail = lastContext(readRange(path, size - TAIL_BYTES, TAIL_BYTES));
  return tail !== null ? tail : lastContext(readFileSync(path, 'utf8'));
}

function statePath(sessionId) {
  return join(tmpdir(), 'context-guard', `${sessionId}.json`);
}

/** The session state, or `null` with no file; an unreadable state throws. */
function loadState(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const state = JSON.parse(text);
  if (state === null || typeof state !== 'object' || Array.isArray(state))
    throw new Error('estado fora do formato');
  return state;
}

/** Writes through a temporary file and `rename`: parallel calls do not corrupt the state. */
function saveState(file, state) {
  mkdirSync(join(file, '..'), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state));
  renameSync(temp, file);
}

function readInput(raw) {
  const input = JSON.parse(raw);
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error('entrada fora do formato');
  return input;
}

/** The texts of the transcript's initial prompt, or `null` while it does not have one yet. */
function readFirstPrompt(transcript) {
  const size = statSync(transcript).size;
  return firstPrompt(
    readRange(transcript, 0, Math.min(size, HEAD_BYTES)),
    size > HEAD_BYTES,
  );
}

/** Decides the session's role by the initial prompt (`nenhum` when silent); `null` while the transcript does not have it yet. */
function decideRole(transcript) {
  const texts = readFirstPrompt(transcript);
  return texts === null ? null : (sessionRole(texts) ?? 'nenhum');
}

const PAPEIS = ['fase', 'coordenador', 'testador', 'nenhum'];

/** The role kept in the state, or decided from the transcript (`null`: not decidable yet). */
function resolveRole(state, transcript) {
  if (PAPEIS.includes(state?.papel)) return state.papel;
  if (state?.fase === true) return 'fase'; // old state, from before the `papel` field
  return decideRole(transcript);
}

/**
 * Handles one hook call: returns the notice JSON, or `null` for silence. Writes the
 * state; throws on any failure (the caller turns it into silence).
 */
export function handle(input, env = process.env) {
  if (env.CLAUDE_CODE_REMOTE !== 'true') return null;
  if (typeof input.agent_id === 'string' && input.agent_id !== '') return null;
  const sessionId = input.session_id;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  const transcript = input.transcript_path;
  if (typeof transcript !== 'string' || transcript === '') return null;

  const file = statePath(sessionId);
  let state = null;
  let erro = null;
  try {
    state = loadState(file);
  } catch (error) {
    // Corrupted state: start over and keep the error, instead of silencing the session forever.
    erro = error instanceof Error ? error.message : String(error);
  }
  const papel = resolveRole(state, transcript);
  if (papel === null) return null;
  if (papel === 'nenhum') {
    // Decided once: a silent session neither writes again nor rereads the transcript.
    if (state?.papel !== 'nenhum' || erro !== null)
      saveState(file, {
        fase: false,
        papel,
        ultimoAviso: null,
        saltos: [],
        erro: erroEstado(erro),
      });
    return null;
  }

  const contexto = measureTranscript(transcript);
  if (contexto === null) return null;
  const previous = Number.isFinite(state?.contexto) ? state.contexto : null;
  const jumps =
    previous !== null && typeof state.ferramenta === 'string'
      ? addJump(
          Array.isArray(state.saltos) ? state.saltos : [],
          state.ferramenta,
          contexto - previous,
        )
      : Array.isArray(state?.saltos)
        ? state.saltos
        : [];
  // Context that returns to the role's trigger or below (compaction) resets the notice: the next crossing warns.
  const gatilho = TRIGGERS[papel];
  const lastWarning =
    contexto > gatilho && Number.isFinite(state?.ultimoAviso) ? state.ultimoAviso : null;
  const warn = shouldWarn(contexto, lastWarning, gatilho);
  saveState(file, {
    fase: papel === 'fase',
    papel,
    contexto,
    ferramenta: toolLabel(input.tool_name, input.tool_input),
    ultimoAviso: warn ? contexto : lastWarning,
    saltos: jumps,
    erro: erroEstado(erro) ?? state?.erro ?? null,
  });
  return warn ? warningOutput(contexto, jumps, papel) : null;
}

/** Whether the initial prompt carries the resume line of the phase's last session (`k` equal to `N`). */
function isLastSession(transcript) {
  const texts = readFirstPrompt(transcript) ?? [];
  for (const text of texts) {
    const found = MARCADOR_RETOMADA.exec(text);
    if (found && found[1] === found[2]) return true;
  }
  return false;
}

/**
 * Handles one `PreToolUse` call: returns the refusal JSON, or `null` to let the call through. Writes the
 * state only to record the role it had to decide; throws on any failure (the caller turns it into silence).
 */
export function handleGate(input, env = process.env) {
  if (env.CLAUDE_CODE_REMOTE !== 'true') return null;
  if (!opensPullRequest(input.tool_name, input.tool_input)) return null;
  const sessionId = input.session_id;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  const transcript = input.transcript_path;
  if (typeof transcript !== 'string' || transcript === '') return null;

  const file = statePath(sessionId);
  const state = loadState(file); // a corrupted state throws: the gate fails open
  const papel = resolveRole(state, transcript);
  if (papel === null) return null;
  if (state?.papel !== papel)
    saveState(file, {
      ...state,
      fase: papel === 'fase',
      papel,
      ultimoAviso: state?.ultimoAviso ?? null,
      saltos: Array.isArray(state?.saltos) ? state.saltos : [],
      erro: state?.erro ?? null,
    });
  if (papel !== 'fase') return null;

  const contexto = measureTranscript(transcript);
  if (contexto === null || contexto <= GATILHO) return null;
  if (isLastSession(transcript)) return null;
  return gateOutput(contexto);
}

function erroEstado(mensagem) {
  return mensagem === null ? null : { mensagem, em: new Date().toISOString() };
}

/** Writes the last error to the state, when possible; never throws. */
function recordError(raw, error) {
  try {
    const input = readInput(raw);
    if (typeof input.session_id !== 'string' || !SESSION_ID.test(input.session_id))
      return;
    if (typeof input.agent_id === 'string' && input.agent_id !== '') return;
    const file = statePath(input.session_id);
    let state;
    try {
      state = loadState(file);
    } catch {
      state = null;
    }
    if (state === null) return; // a session the hook never got to decide on: nothing to record
    const mensagem = error instanceof Error ? error.message : String(error);
    saveState(file, { ...state, erro: erroEstado(mensagem) });
  } catch {
    // No way to record: the hook stays silent.
  }
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
    const input = readInput(raw);
    const out =
      input.hook_event_name === 'PreToolUse' ? handleGate(input) : handle(input);
    if (out !== null) process.stdout.write(`${out}\n`);
  } catch (error) {
    recordError(raw, error);
  }
  process.exitCode = 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
