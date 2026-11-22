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
//     that opens a PR (`opensPullRequest`) gets `{"hookSpecificOutput":{"hookEventName":"PreToolUse",
//     "permissionDecision":"deny","permissionDecisionReason":"<text>"}}`, on every attempt. Exempt: the last
//     session of its phase (`Retomada por contexto (<k> de <N>)` with k equal to N, `MARCADOR_RETOMADA`), the
//     coordinator, the tester and any other session. The gate reads the state for the role and writes it only
//     to record a role it had to decide, or the `erro`: it never touches `contexto`, `ferramenta`,
//     `ultimoAviso` or `saltos`, so the jumps of the notice stay right.
//   The forms the gate recognizes (stage #2635, phase CT1; decisions 6 to 10), each with the tool or command in
//     command position (`gh`, `curl`, `bash`, ... after the usual wrappers and `NAME=value` prefixes):
//     - the `create_pull_request` tool, `gh pr create` and a POST `gh api …/pulls` (an explicit method decides
//       over a body flag);
//     - `curl` to `…/repos/<owner>/<repo>/pulls` with an explicit POST or, with no method, a data flag (`-d`,
//       `--data*`, `--json`, `-F`, `--form`; `-G` makes it a GET);
//     - the GraphQL `createPullRequest` mutation in `gh api graphql` or in a `curl` to `…/graphql`;
//     - any of them inside `bash`/`sh`/`zsh`/`dash` (by name or path; options, `-o <name>` and a `--` allowed)
//       with an option group ending in `c` (`-c`, `-lc`) or `eval`, unquoted one level (`'…'`, `"…"`, `$'…'`)
//       and checked again, up to depth 3; `sudo`, `env` (with their options), `xargs` and `find -exec` count as
//       wrappers before the command word;
//     - the method and data flags are read from the masked segment (a quoted body that mentions `-G` or
//       `-X GET` changes nothing), case-sensitive (`-x` is curl's proxy), and curl's grouped short options
//       (`-sd`, `-sSX POST`) count; a backslash line continuation does not end the command.
//     Inert text is not a command position: the position is looked for on a masked copy of the command, of the
//     same length (`maskInert`), where heredoc bodies and the content of `'…'`, `$'…'` and `"…"` are blank
//     (the code of `$( … )` and of backticks inside `"…"` stays), and comments. A heredoc fed to a shell
//     (`bash <<EOF`, `cat <<EOF | sh`) is a script and stays code; a heredoc that is never closed is not
//     blanked. The segment checks read the original text.
//   Best effort that stays (the gate fails open on these): a script file or interpreter (`python x.py`,
//     `node -e`); a command built in a variable; another HTTP client (`wget`,
//     `httpie`); a GraphQL query read from a file or from stdin (`-f query=@file`, `-F query=@-`); and the gate measures the
//     `transcript_path` it receives, so if that is a subagent's own transcript the measure is lower and the
//     call goes through.
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
 * followed by whitespace or the end (what `create_session` sends to the successor), or it starts with
 * the form Claude Code records for a typed slash command (an optional `<command-message>` first). Both
 * are anchored to the start of the block: a prompt that only quotes the tag is not a coordinator.
 */
export const MARCADOR_COORDENADOR =
  /^(?:\/implementar-fila(?:\s|$)|(?:<command-message>[^<]*<\/command-message>\s*)?<command-name>\/implementar-fila<\/command-name>)/;
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

// A command word (`gh`, `curl`, ...) must be in command position (start, or after `;`, `&`, `|`, `(`, a
// backtick or a line break, with optional shell keywords (`then`, `do`, `else`, `{`, ...), wrappers (`env`,
// `sudo`, `timeout <n>`, ...) and `NAME=value` prefixes): a commit message, an `echo` or a `grep` that only
// mentions it is not a call. The position is looked for on a masked copy of the command (`maskInert`), where
// the inert text is blank; the segment checks (path, flags, mutation name) read the original text.
// `sudo`, `env` and `xargs` take options (a lone `-x` or `-u bot`, one word of argument without `=`, so a
// `NAME=value` stays a prefix) and `find` hands the command to `-exec`.
const WRAPPER_OPTIONS = '(?:-\\S+(?:\\s+[^-\\s;&|][^\\s=]*)?\\s+)*';
const WRAPPERS =
  `(?:(?:then|do|else|elif|time|command|exec|nohup|!|\\{)\\s+|timeout\\s+\\S+\\s+|` +
  `(?:[\\w.+~-]*/)*(?:sudo|env|xargs)\\s+${WRAPPER_OPTIONS}(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*|` +
  `find\\s+[^;&|()\\n]*?-exec(?:dir)?\\s+)*`;
const commandStart = (word, flags = '') =>
  new RegExp(
    `(?:^|[;&|(\`\\n])\\s*${WRAPPERS}(?:[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*${word}`,
    flags,
  );
const GH_API = commandStart('gh\\s+api\\b', 'g');
const PR_CREATE = commandStart('gh\\s+pr\\s+create(?![\\w-])');
const CURL = commandStart('curl\\s+', 'g');
// A shell by name or by path, options (`-o <name>` too) up to the `-c` group, and an optional `--` after it.
const SHELL_C = commandStart(
  '(?:[\\w.+~-]*/)*(?:bash|sh|zsh|dash)\\s+(?:(?:-[oO]\\s+\\w+|-[A-Za-z-]+)\\s+)*-[A-Za-z]*c\\s+(?:--\\s+)?',
  'g',
);
const EVAL = commandStart('eval\\s+', 'g');
const PULLS_PATH = /repos\/[^\s/'"]+\/[^\s/'"]+\/pulls(?=[\s'"?]|$)/;
const CURL_PULLS =
  /(?:https?:\/\/)?api\.github\.com\/repos\/[^\s/'"]+\/[^\s/'"]+\/pulls(?=[\s'"?]|$)/;
const CURL_GRAPHQL = /(?:https?:\/\/)?api\.github\.com\/graphql(?=[\s'"?]|$)/;
const GH_GRAPHQL = /(?:^|\s)graphql(?=[\s'"]|$)/;
const PR_MUTATION = /\bcreatePullRequest\b/;
const BODY_FLAG = /(?:^|\s)(?:-[fF]|--field|--raw-field|--input)(?=[\s=]|$)/;
// Flags are case-sensitive (curl's `-x` is the proxy) and read from the masked segment; a short option may be
// grouped in curl (`-sd`, `-sSX POST`, `-sG`).
const METHOD_FLAG = /(?:^|\s)(?:-X\s*|--method[\s=]+)([A-Za-z]+)/;
const CURL_METHOD_FLAG = /(?:^|\s)(?:-[A-Za-z]*X\s*|--request[\s=]+)([A-Za-z]+)/;
const CURL_DATA_FLAG =
  /(?:^|\s)(?:-[A-Za-z]*[dF]|--data(?:-raw|-binary|-urlencode|-ascii)?|--json|--form(?:-string)?)(?=[\s='"@{[]|$)/;
const CURL_GET_FLAG = /(?:^|\s)(?:-[A-Za-z]*G|--get)(?=\s|$)/;
/** A line that feeds a heredoc to a shell (`bash <<EOF`, `cat <<EOF | sh`): its body is a script, so it is code. */
const SHELL_LINE =
  /(?:^|[;&|(]|\b(?:sudo|env|xargs|exec|command|nohup|time)\s)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:bash|sh|zsh|dash)(?=\s|$)/;
const HEREDOC_OPEN = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_]+))/;
/** Shell wrappers (`bash -c`, `eval`) are unquoted and checked again up to this depth. */
const MAX_WRAPPER_DEPTH = 3;

/** On the masked segment: an explicit method decides; with none, a body flag makes `gh api` a POST. */
function postsBody(masked) {
  const method = METHOD_FLAG.exec(masked);
  return method ? method[1].toUpperCase() === 'POST' : BODY_FLAG.test(masked);
}

/** On the masked segment: an explicit method decides; with none, `-G` makes it a GET and a data flag a POST. */
function curlPosts(masked) {
  const method = CURL_METHOD_FLAG.exec(masked);
  if (method) return method[1].toUpperCase() === 'POST';
  return !CURL_GET_FLAG.test(masked) && CURL_DATA_FLAG.test(masked);
}

function blank(ctx, from, to) {
  for (let k = from; k < Math.min(to, ctx.out.length); k += 1) ctx.out[k] = ' ';
}

/** After the opening `'` at `open`: blanks the content and returns the index after the closing quote. */
function skipSingle(ctx, open) {
  const close = ctx.text.indexOf("'", open + 1);
  const end = close < 0 ? ctx.text.length : close;
  blank(ctx, open + 1, end);
  return close < 0 ? end : end + 1;
}

/** `$'…'` (backslash escapes the next character): the same, for the quote at `open`. */
function skipAnsiC(ctx, open) {
  let i = open + 1;
  while (i < ctx.text.length && ctx.text[i] !== "'") i += ctx.text[i] === '\\' ? 2 : 1;
  const end = Math.min(i, ctx.text.length);
  blank(ctx, open + 1, end);
  return end + 1;
}

/** `"…"` at `open`: blanks the content, but keeps the code of `$( … )` and of backticks. */
function skipDouble(ctx, open) {
  const { text } = ctx;
  let i = open + 1;
  let run = i;
  while (i < text.length && text[i] !== '"') {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '$' && text[i + 1] === '(') {
      blank(ctx, run, i + 1);
      i = scanCode(ctx, i + 2, ')');
      run = i;
      i += 1;
    } else if (text[i] === '`') {
      blank(ctx, run, i);
      i = scanCode(ctx, i + 1, '`');
      run = i;
      i += 1;
    } else i += 1;
  }
  blank(ctx, run, Math.min(i, text.length));
  return i + 1;
}

/**
 * Blanks the body of the oldest pending heredoc, which starts after the line break at `nl`, and returns where
 * it ends. A body that feeds a shell is kept (code), and one that is never closed is not blanked: the mask
 * only hides text it is sure about.
 */
function consumeHeredoc(ctx, nl) {
  const { word, strip, shell } = ctx.pending.shift();
  const { text } = ctx;
  let lineStart = nl + 1;
  while (lineStart <= text.length) {
    const found = text.indexOf('\n', lineStart);
    const lineEnd = found < 0 ? text.length : found;
    const line = text.slice(lineStart, lineEnd);
    if ((strip ? line.replace(/^\t+/, '') : line) === word) {
      if (!shell) blank(ctx, nl + 1, lineEnd);
      return lineEnd;
    }
    if (found < 0) break;
    lineStart = found + 1;
  }
  return nl;
}

/** The heredoc opened at `i` (`<<`, `<<-`, not `<<<`): queues it and returns the index after its word. */
function openHeredoc(ctx, i) {
  if (ctx.text[i + 2] === '<') return i + 3;
  const found = HEREDOC_OPEN.exec(ctx.text.slice(i, i + 200));
  if (found === null) return i + 2;
  const lineStart = ctx.text.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = ctx.text.indexOf('\n', i);
  const line = ctx.text.slice(lineStart, lineEnd < 0 ? ctx.text.length : lineEnd);
  ctx.pending.push({
    word: found[2] ?? found[3] ?? found[4],
    strip: found[1] === '-',
    shell: SHELL_LINE.test(line),
  });
  return i + found[0].length;
}

/** `$(( … ))` at `i` (a shift such as `1<<3` is not a heredoc): returns the index after the closing `))`. */
function skipArithmetic(ctx, i) {
  let depth = 2;
  let j = i + 3;
  while (j < ctx.text.length && depth > 0) {
    if (ctx.text[j] === '(') depth += 1;
    else if (ctx.text[j] === ')') depth -= 1;
    j += 1;
  }
  return j;
}

/** A `#` that starts a word is a comment to the end of the line (its quotes do not open a string). */
function isComment(text, i) {
  return text[i] === '#' && (i === 0 || /[\s;&|(]/.test(text[i - 1]));
}

/** Blanks the comment at `i` and returns the index of its line break. */
function skipComment(ctx, i) {
  const found = ctx.text.indexOf('\n', i);
  const end = found < 0 ? ctx.text.length : found;
  blank(ctx, i, end);
  return end;
}

/** Code starting at `i` up to `end` (not nested in parentheses) or the end of the text; returns the index of `end`. */
function scanCode(ctx, i, end) {
  const { text } = ctx;
  let depth = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === end && depth === 0) return i;
    if (char === '\\') i += 2;
    else if (char === "'") i = skipSingle(ctx, i);
    else if (char === '"') i = skipDouble(ctx, i);
    else if (char === '$' && text[i + 1] === "'") i = skipAnsiC(ctx, i + 1);
    else if (isComment(text, i)) i = skipComment(ctx, i);
    else if (char === '$' && text.startsWith('((', i + 1)) i = skipArithmetic(ctx, i);
    else if (char === '<' && text[i + 1] === '<') i = openHeredoc(ctx, i);
    else if (char === '\n' && ctx.pending.length > 0) i = consumeHeredoc(ctx, i);
    else {
      if (char === '(') depth += 1;
      else if (char === ')') depth = Math.max(0, depth - 1);
      i += 1;
    }
  }
  return text.length;
}

/**
 * A copy of the command, of the same length, where the inert text is blank: heredoc bodies and the content
 * of `'…'`, `$'…'` and `"…"` (the code of `$( … )` and of backticks inside `"…"` stays). The quotes
 * themselves stay.
 */
export function maskInert(command) {
  const ctx = { text: command, out: command.split(''), pending: [] };
  scanCode(ctx, 0, null);
  return ctx.out.join('');
}

/** The end of the first command in `rest`: the next separator outside quotes. */
function segmentEnd(rest) {
  let quote = null;
  for (let i = 0; i < rest.length; i += 1) {
    const char = rest[i];
    if (char === '\\' && quote !== "'") i += 1;
    else if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (';&|\n)`'.includes(char)) return i;
  }
  return rest.length;
}

/**
 * The text after every match of `start` (found on the masked copy), up to the end of that command: the original
 * (for the path and the mutation name) and the masked copy of the same range (for the flags).
 */
function segmentsAfter(command, masked, start) {
  return [...masked.matchAll(start)].map((found) => {
    const from = found.index + found[0].length;
    const rest = command.slice(from);
    const end = segmentEnd(rest);
    return { raw: rest.slice(0, end), masked: masked.slice(from, from + end) };
  });
}

/** The `gh api` call: a POST to `…/pulls` or the `createPullRequest` mutation of `graphql`. */
function apiOpensPullRequest({ raw, masked }) {
  if (PULLS_PATH.test(raw) && postsBody(masked)) return true;
  return GH_GRAPHQL.test(raw) && PR_MUTATION.test(raw);
}

/** The `curl` call: a POST to the pulls endpoint, or the `createPullRequest` mutation sent to `/graphql`. */
function curlOpensPullRequest({ raw, masked }) {
  if (CURL_PULLS.test(raw) && curlPosts(masked)) return true;
  return CURL_GRAPHQL.test(raw) && PR_MUTATION.test(raw);
}

const ANSI_C_ESCAPES = {
  n: '\n',
  t: '\t',
  r: '\r',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
  e: '\x1b',
};

/** The value of one `\…` escape inside `$'…'`: a control letter, `\xHH`, `\uHHHH`, an octal code or the character itself. */
function ansiCEscape(_all, code) {
  if (code.length > 1 && /^[xu]/.test(code))
    return String.fromCodePoint(parseInt(code.slice(1), 16));
  if (/^[0-7]+$/.test(code)) return String.fromCodePoint(parseInt(code, 8));
  return ANSI_C_ESCAPES[code] ?? code;
}

/** `$'…'` at `from`: the content with its escapes decoded (the bash `$'…'` quoting). */
function ansiCWord(command, from) {
  let i = from + 2;
  while (i < command.length && command[i] !== "'") i += command[i] === '\\' ? 2 : 1;
  return command
    .slice(from + 2, i)
    .replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|[0-7]{1,3}|[\s\S])/g, ansiCEscape);
}

/** One level of unquoting of the word that starts at `from`: `'…'`, `$'…'`, `"…"` (with its escapes) or a bare word. */
function unquotedWord(command, from) {
  if (command.startsWith("$'", from)) return ansiCWord(command, from);
  const quote = command[from];
  if (quote === "'") {
    const close = command.indexOf("'", from + 1);
    return command.slice(from + 1, close < 0 ? command.length : close);
  }
  if (quote !== '"') return command.slice(from).split(/\s/)[0];
  let i = from + 1;
  while (i < command.length && command[i] !== '"') i += command[i] === '\\' ? 2 : 1;
  return command.slice(from + 1, i).replace(/\\(["\\$`])/g, '$1');
}

/** The commands that `bash -c '…'` (and `sh`, `zsh`, `dash`) and `eval …` run, unquoted one level. */
function wrappedCommands(command, masked) {
  const inner = [];
  for (const found of masked.matchAll(SHELL_C))
    inner.push(unquotedWord(command, found.index + found[0].length));
  for (const found of masked.matchAll(EVAL)) {
    const from = found.index + found[0].length;
    const quoted = command[from] === '"' || command[from] === "'";
    inner.push(
      quoted
        ? unquotedWord(command, from)
        : command.slice(from).slice(0, segmentEnd(command.slice(from))),
    );
  }
  return inner;
}

function commandOpensPullRequest(command, depth) {
  const masked = maskInert(command);
  if (PR_CREATE.test(masked)) return true;
  if (segmentsAfter(command, masked, GH_API).some(apiOpensPullRequest)) return true;
  if (segmentsAfter(command, masked, CURL).some(curlOpensPullRequest)) return true;
  return (
    depth < MAX_WRAPPER_DEPTH &&
    wrappedCommands(command, masked).some((inner) =>
      commandOpensPullRequest(inner, depth + 1),
    )
  );
}

/**
 * Whether a tool call opens a pull request: the create tool, `gh pr create`, a POST `gh api …/pulls`, a
 * `curl` POST to the pulls endpoint, the GraphQL `createPullRequest` mutation, or any of them inside
 * `bash -c '…'` or `eval`.
 */
export function opensPullRequest(toolName, toolInput) {
  if (toolName === 'mcp__github__create_pull_request') return true;
  if (toolName !== 'Bash') return false;
  const command = toolInput?.command;
  return typeof command === 'string' && commandOpensPullRequest(command, 0);
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
    `With no room in the lineage, follow the owner's path of "Lineage limit" and keep working. This hook cannot see the lineage and repeats this notice every ${PASSO / 1000} thousand: if the \`current\` of the panel already says "aguardando o dono abrir a sessão nova da fila", the owner was notified, so do not send it again. ` +
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
  // A subagent's `transcript_path` may be its own: its call never writes the role.
  const subagent = typeof input.agent_id === 'string' && input.agent_id !== '';
  if (!subagent && state?.papel !== papel)
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
