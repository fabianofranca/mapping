import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IDS, IMAGE_FILES, codeOf, createImageWorkspace } from './imageFixtures';

// O stdout do servidor é o canal do protocolo: nada além de mensagens JSON-RPC pode sair
// nele. Os codecs Emscripten escrevem com `Module.print || console.log.bind(console)`
// (capturado quando o codec é instanciado, sob demanda, no meio de uma chamada). Os testes
// leem o stdout bruto do bundle, sem o cliente do SDK (que ignoraria as linhas que não são
// JSON). Um script carregado com `--import` faz o papel de uma dependência que escreve no
// console durante a chamada, ou que deixa escapar um erro.

const bundle = resolve('dist-mcp/mapping-mcp.js');

interface Run {
  readonly lines: string[];
  readonly stderr: string;
  readonly code: number | null;
}

/**
 * Script carregado antes do servidor; `onCall` roda quando chega a chamada da tool, depois do
 * handshake (o servidor já está conectado).
 */
function preload(onCall: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'mapping-mcp-preload-')), 'preload.mjs');
  writeFileSync(
    file,
    // Só escuta o stdin depois que o transporte do servidor o escuta (não rouba mensagens).
    `const wait = setInterval(() => {
  if (process.stdin.listenerCount('data') === 0) return;
  clearInterval(wait);
  process.stdin.on('data', function onData(chunk) {
    if (!String(chunk).includes('tools/call')) return;
    process.stdin.off('data', onData);
    ${onCall}
  });
}, 5);
`,
  );
  return pathToFileURL(file).href;
}

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * Sobe o bundle, faz o handshake e chama as tools em sequência (ids 2, 3…), cada uma depois da
 * resposta da anterior; devolve o stdout em linhas, o stderr e o código de saída.
 */
function callTools(
  root: string,
  calls: readonly Call[],
  importUrl?: string,
): Promise<Run> {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [...(importUrl ? ['--import', importUrl] : []), bundle, '--root', root],
      { stdio: 'pipe' },
    );
    let stdout = '';
    let stderr = '';
    // Sem resposta (o processo pode ter caído): encerra e deixa o teste conferir o que saiu.
    const timer = setTimeout(() => child.kill(), 50_000);
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    let next = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!stdout.endsWith('\n')) return;
      // Depois da resposta anterior (o handshake é o id 1), a próxima chamada.
      if (!new RegExp(`"id":${next + 1}[,}]`).test(stdout)) return;
      if (next === 0) send({ method: 'notifications/initialized' });
      const call = calls[next];
      next += 1;
      if (call) {
        send({
          id: next + 1,
          method: 'tools/call',
          params: { name: call.name, arguments: call.args },
        });
      } else {
        child.stdin.end();
      }
    });
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ lines: stdout.split('\n').filter((line) => line !== ''), stderr, code });
    });
    child.stdin.on('error', () => {});
    const send = (message: Record<string, unknown>) =>
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    send({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'teste', version: '0' },
      },
    });
  });
}

const callTool = (
  root: string,
  name: string,
  args: Record<string, unknown>,
  importUrl?: string,
): Promise<Run> => callTools(root, [{ name, args }], importUrl);

const isJsonRpc = (line: string): boolean => {
  try {
    return (JSON.parse(line) as { jsonrpc?: unknown }).jsonrpc === '2.0';
  } catch {
    return false;
  }
};

const answered = (run: Run, id = 2) =>
  run.lines.some((line) => new RegExp(`"id":${id}[,}]`).test(line));

describe('stdout do bundle (só JSON-RPC)', () => {
  it('get_image_file sobre um JPEG truncado não escreve nada além de JSON-RPC no stdout', async () => {
    const { root, dir } = await createImageWorkspace();
    const file = join(dir, IMAGE_FILES.jpeg);
    // Mantém o cabeçalho (as dimensões são lidas antes de decodificar) e corta o resto: a
    // libjpeg avisa "Premature end of JPEG file".
    const bytes = readFileSync(file);
    writeFileSync(file, bytes.subarray(0, Math.floor(bytes.length / 2)));

    const run = await callTool(root, 'get_image_file', {
      ref: `i:${codeOf(IDS.jpeg)}`,
      project: 'imagens',
    });

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(answered(run)).toBe(true);
  }, 30_000);

  it('o que um codec escreve com console.log durante a chamada vai para o stderr', async () => {
    const { root } = await createImageWorkspace();
    // Como o Emscripten: captura `console.log` ao instanciar o módulo, depois do início.
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload(
        "const out = console.log.bind(console); out('aviso do codec'); console.info('info'); console.debug('debug');",
      ),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(answered(run)).toBe(true);
    expect(run.stderr).toContain('aviso do codec');
  }, 30_000);

  it('rejeição sem tratamento: uma linha com o prefixo no stderr e saída 1', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload("Promise.reject(new Error('falha solta'));"),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toContain('mapping-mcp: falha solta');
    expect(run.code).toBe(1);
  }, 30_000);

  it('exceção sem tratamento: uma linha com o prefixo no stderr e saída 1', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(
      root,
      'list_projects',
      {},
      preload("setImmediate(() => { throw new Error('exceção solta'); });"),
    );

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toContain('mapping-mcp: exceção solta');
    expect(run.code).toBe(1);
  }, 30_000);
});

describe('mensagens grandes no stdin', () => {
  it('plan_changes com 20 MB de base64 responde ao id e o servidor continua vivo', async () => {
    const { root } = await createImageWorkspace();
    const base64 = randomBytes(15 * 1024 * 1024).toString('base64');
    expect(base64.length).toBeGreaterThan(20_000_000);

    const run = await callTools(root, [
      {
        name: 'plan_changes',
        args: { project: 'imagens', operations: [{ op: 'add_image', base64 }] },
      },
      { name: 'list_projects', args: {} },
    ]);

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    const reply = run.lines.find((line) => /"id":2[,}]/.test(line));
    // Erro estruturado da operação (os bytes não são uma imagem), não queda da conexão.
    expect(reply).toContain('unsupported-image');
    expect(answered(run, 3)).toBe(true);
  }, 60_000);

  it('acima do teto do transporte: linha com o prefixo no stderr e saída 1, nunca 0 em silêncio', async () => {
    const { root } = await createImageWorkspace();
    const run = await callTool(root, 'plan_changes', {
      project: 'imagens',
      operations: [{ op: 'add_image', base64: 'A'.repeat(40 * 1024 * 1024) }],
    });

    expect(run.lines.filter((line) => !isJsonRpc(line))).toEqual([]);
    expect(run.stderr).toMatch(/mapping-mcp: mensagem maior que \d+ bytes/);
    expect(run.code).toBe(1);
  }, 60_000);
});
