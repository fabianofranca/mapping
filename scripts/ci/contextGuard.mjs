// Claude Code `PostToolUse` hook (stage #1856, phase GC1; coordinator role: stage #2228, phase CH1):
// measures the main thread's context after every tool call and, above the role's trigger, injects
// the session-switch notice. Node only, no dependencies; the measure is that of `contextUsage.mjs`
// (`lastContext`).
//   Wired in `.claude/settings.json`: node "$CLAUDE_PROJECT_DIR/scripts/ci/contextGuard.mjs"
//     Reads the hook input (JSON) from stdin. Only acts in the cloud (`CLAUDE_CODE_REMOTE=true`) and on
//     the main thread (no `agent_id`), in one of two roles decided once from the transcript's initial
//     prompt (`sessionRole`; a phase prompt is checked first):
//       - `fase`: a phase or fix session (the prompt opens with `MARCADOR` or with the coordinator's
//         short prompt), trigger `GATILHO` (270 thousand);
//       - `coordenador`: the queue coordinator (the prompt is the `/implementar-fila` command,
//         `MARCADOR_COORDENADOR`), trigger `GATILHO_COORDENADOR` (320 thousand).
//     Any other session (tester, supervisor, fast track, owner's chat) is silent (`nenhum`).
//     With the context above the role's trigger, and at every +`PASSO` after the last notice, it
//     writes to stdout
//     `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<notice>"}}`.
//     The state lives in `<os.tmpdir()>/context-guard/<session_id>.json`: `papel` (`fase`,
//     `coordenador` or `nenhum`), `fase` (true only for a phase), `contexto`, `ferramenta`,
//     `ultimoAviso`, `saltos` (the 3 largest) and `erro`. An old state without `papel` is a phase when
//     `fase` is true, and otherwise decided again once.
//     Always exit code 0: the hook never blocks or delays a call, and any failure only silences it.
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

/** The role of the session by the initial prompt's texts: `fase`, `coordenador` or `null` (silent). */
export function sessionRole(texts) {
  if (isPhasePrompt(texts)) return 'fase';
  return texts.some((raw) => MARCADOR_COORDENADOR.test(raw.trimStart()))
    ? 'coordenador'
    : null;
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

/** The JSON that Claude Code reads from the hook's stdout. */
export function warningOutput(contexto, jumps, papel = 'fase') {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        papel === 'coordenador'
          ? coordinatorWarningText(contexto, jumps)
          : warningText(contexto, jumps),
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

/** Decides the session's role by the initial prompt (`nenhum` when silent); `null` while the transcript does not have it yet. */
function decideRole(transcript) {
  const size = statSync(transcript).size;
  const texts = firstPrompt(
    readRange(transcript, 0, Math.min(size, HEAD_BYTES)),
    size > HEAD_BYTES,
  );
  return texts === null ? null : (sessionRole(texts) ?? 'nenhum');
}

const PAPEIS = ['fase', 'coordenador', 'nenhum'];

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
  const gatilho = papel === 'coordenador' ? GATILHO_COORDENADOR : GATILHO;
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
    const out = handle(readInput(raw));
    if (out !== null) process.stdout.write(`${out}\n`);
  } catch (error) {
    recordError(raw, error);
  }
  process.exitCode = 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
