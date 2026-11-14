// Gancho `PostToolUse` do Claude Code (etapa #1856, fase GC1): mede o contexto do fio principal
// depois de cada chamada de ferramenta e, acima do gatilho, injeta o aviso de troca de sessão.
// Só Node, sem dependências; a conta é a do `contextUsage.mjs` (`lastContext`).
//   Ligado no `.claude/settings.json`: node "$CLAUDE_PROJECT_DIR/scripts/ci/contextGuard.mjs"
//     Lê a entrada do gancho (JSON) no stdin. Só age na nuvem (`CLAUDE_CODE_REMOTE=true`), no fio
//     principal (sem `agent_id`) e em sessão de fase ou de correção (o prompt inicial do transcript
//     abre por `MARCADOR` ou pelo prompt curto do coordenador). Senão sai em silêncio.
//     Com o contexto acima de `GATILHO`, e a cada +10 mil depois do último aviso, escreve no stdout
//     `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<aviso>"}}`.
//     O estado fica em `<os.tmpdir()>/context-guard/<session_id>.json`: `fase`, `contexto`,
//     `ferramenta`, `ultimoAviso`, `saltos` (os 3 maiores) e `erro`.
//     Sempre código 0: o gancho nunca trava nem atrasa uma chamada, e qualquer falha só cala.
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

/** Contexto, em tokens, acima do qual o gancho avisa (fonte única; o teto da fase é 300.000). */
export const GATILHO = 270000;
/** O aviso se repete a cada alta de tanto contexto desde o último. */
export const PASSO = 10000;
/** Primeira frase da mensagem de "Para a sessão da fase" do `docs/FLOW.md`. */
export const MARCADOR = 'Você é o agente da fase ';
/**
 * Abertura do prompt curto que o coordenador manda de fato (skill `implementar-fila`, "Por etapa"):
 * `Fase <código> — <título> da etapa #<n> (sub-issue #<n>), …`.
 */
export const MARCADOR_FILA = /^Fase \S+ — .* da etapa #\d+ \(sub-issue #\d+\)/;
/** O gancho lê só o fim do transcript, até esta quantidade de bytes. */
export const TAIL_BYTES = 2 * 1024 * 1024;
/** O prompt inicial é procurado no começo do transcript, até esta quantidade de bytes. */
export const HEAD_BYTES = 1024 * 1024;

const TETO_MIL = 300;
const ROTULO_BASH = 40;
const SALTOS_GUARDADOS = 3;
const SESSION_ID = /^[A-Za-z0-9_-]+$/;

/** Textos do prompt de uma linha `user` do transcript (a string, ou os blocos `text`). */
export function promptTexts(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text);
}

/**
 * Textos da primeira linha `type: "user"` (a que não é meta) do começo do transcript, ou `null`
 * quando ainda não há uma linha completa dessas. Um bloco de lembrete antes do prompt não o esconde. Com `partial`, o texto é um pedaço do arquivo e a
 * última linha, que pode estar cortada, fica de fora.
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

/** Se algum dos textos do prompt inicial abre uma sessão de fase ou de correção. */
export function isPhasePrompt(texts) {
  return texts.some((raw) => {
    const text = raw.trimStart();
    return text.startsWith(MARCADOR) || MARCADOR_FILA.test(text);
  });
}

/** Rótulo da chamada para atribuir os saltos: `Bash: <40 caracteres>`, `Read: <arquivo>`, … */
export function toolLabel(toolName, toolInput) {
  const name = typeof toolName === 'string' && toolName ? toolName : 'ferramenta';
  const input = toolInput !== null && typeof toolInput === 'object' ? toolInput : {};
  const field = { Bash: input.command, Read: input.file_path, Agent: input.description }[
    name
  ];
  // Uma linha só: o aviso vai inteiro numa linha, e um comando pode ter quebras (heredoc).
  const text = typeof field === 'string' ? field.replace(/\s+/g, ' ').trim() : '';
  const shown = name === 'Bash' ? text.slice(0, ROTULO_BASH).trimEnd() : text;
  return shown ? `${name}: ${shown}` : name;
}

/** Os maiores saltos (`{ rotulo, mil }`), do maior para o menor, com o novo se ele entra. */
export function addJump(jumps, rotulo, delta) {
  if (delta <= 0) return jumps;
  const all = [...jumps, { rotulo, mil: Math.ceil(delta / 1000) }];
  // `sort` é estável: de salto igual, fica o que entrou antes.
  all.sort((a, b) => b.mil - a.mil);
  return all.slice(0, SALTOS_GUARDADOS);
}

/** Se o contexto pede aviso: acima do gatilho e, depois de um aviso, a cada +`PASSO`. */
export function shouldWarn(contexto, ultimoAviso) {
  if (contexto <= GATILHO) return false;
  return (
    ultimoAviso === null || ultimoAviso === undefined || contexto >= ultimoAviso + PASSO
  );
}

/** O texto do aviso (uma linha), com o contexto e os maiores saltos da sessão. */
export function warningText(contexto, jumps) {
  const mil = Math.ceil(contexto / 1000);
  const saltos =
    jumps.length > 0
      ? jumps.map((j) => `${j.rotulo} +${j.mil} mil`).join('; ')
      : 'nenhum registrado';
  return (
    `Gancho de contexto: esta sessão está em ${mil} mil, acima do gatilho de ${GATILHO / 1000} mil ` +
    `(teto ${TETO_MIL} mil; sub-item "Teto de contexto da fase" do item 3 de "Para a sessão da fase", ` +
    `docs/FLOW.md). Se o PR da fase ainda não está aberto e esta não é a sessão 5 de 5, ` +
    `passe a vez agora (passos 1 a 5 da passagem), com <n> = ${mil}. ` +
    `Com o PR aberto, ou na sessão 5 de 5, siga. ` +
    `Maiores saltos (aproximados): ${saltos}. Subagente: ignore este aviso.`
  );
}

/** O JSON que o Claude Code lê no stdout do gancho. */
export function warningOutput(contexto, jumps) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: warningText(contexto, jumps),
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

/** Contexto da última chamada ao modelo: lê o fim do transcript e, sem medida lá, o arquivo todo. */
export function measureTranscript(path) {
  const size = statSync(path).size;
  if (size <= TAIL_BYTES) return lastContext(readFileSync(path, 'utf8'));
  // A linha cortada no começo do pedaço não vale: o `JSON.parse` dela falha e ela é pulada.
  const tail = lastContext(readRange(path, size - TAIL_BYTES, TAIL_BYTES));
  return tail !== null ? tail : lastContext(readFileSync(path, 'utf8'));
}

function statePath(sessionId) {
  return join(tmpdir(), 'context-guard', `${sessionId}.json`);
}

/** O estado da sessão, ou `null` sem arquivo; estado ilegível lança. */
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

/** Grava por arquivo temporário e `rename`: chamadas paralelas não corrompem o estado. */
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

/** Decide se a sessão é de fase pelo prompt inicial; `null` enquanto o transcript não o traz. */
function decidePhase(transcript) {
  const size = statSync(transcript).size;
  const texts = firstPrompt(
    readRange(transcript, 0, Math.min(size, HEAD_BYTES)),
    size > HEAD_BYTES,
  );
  return texts === null ? null : isPhasePrompt(texts);
}

/**
 * Processa uma chamada do gancho: devolve o JSON do aviso, ou `null` para o silêncio. Grava o
 * estado; lança em qualquer falha (quem chama a transforma em silêncio).
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
    // Estado corrompido: recomeça e guarda o erro, em vez de calar a sessão para sempre.
    erro = error instanceof Error ? error.message : String(error);
  }
  let fase = state?.fase;
  if (typeof fase !== 'boolean') {
    fase = decidePhase(transcript);
    if (fase === null) return null;
  }
  if (!fase) {
    // Decidida uma vez: a sessão que não é de fase não grava de novo nem relê o transcript.
    if (state?.fase !== false || erro !== null)
      saveState(file, {
        fase: false,
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
  // Contexto que volta ao gatilho ou abaixo (compactação) zera o aviso: o próximo cruzamento avisa.
  const lastWarning =
    contexto > GATILHO && Number.isFinite(state?.ultimoAviso) ? state.ultimoAviso : null;
  const warn = shouldWarn(contexto, lastWarning);
  saveState(file, {
    fase: true,
    contexto,
    ferramenta: toolLabel(input.tool_name, input.tool_input),
    ultimoAviso: warn ? contexto : lastWarning,
    saltos: jumps,
    erro: erroEstado(erro) ?? state?.erro ?? null,
  });
  return warn ? warningOutput(contexto, jumps) : null;
}

function erroEstado(mensagem) {
  return mensagem === null ? null : { mensagem, em: new Date().toISOString() };
}

/** Grava o último erro no estado, quando dá; nunca lança. */
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
    if (state === null) return; // sessão que o gancho nem chegou a decidir: nada a registrar
    const mensagem = error instanceof Error ? error.message : String(error);
    saveState(file, { ...state, erro: erroEstado(mensagem) });
  } catch {
    // Sem como registrar: o gancho segue em silêncio.
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
