import { spawn } from 'node:child_process';
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

/** Script carregado antes do servidor; `onFirstData` roda na primeira mensagem do cliente. */
function preload(onFirstData: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'mapping-mcp-preload-')), 'preload.mjs');
  writeFileSync(file, `process.stdin.once('data', () => { ${onFirstData} });\n`);
  return pathToFileURL(file).href;
}

/** Sobe o bundle, faz o handshake e chama uma tool; devolve o stdout em linhas, o stderr e o código de saída. */
function callTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
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
    const timer = setTimeout(() => child.kill(), 20_000);
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      // A resposta da chamada (id 2) encerra a sessão.
      if (/"id":2[,}]/.test(stdout) && stdout.endsWith('\n')) child.stdin.end();
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
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/call', params: { name, arguments: args } });
  });
}

const isJsonRpc = (line: string): boolean => {
  try {
    return (JSON.parse(line) as { jsonrpc?: unknown }).jsonrpc === '2.0';
  } catch {
    return false;
  }
};

const answered = (run: Run) => run.lines.some((line) => /"id":2[,}]/.test(line));

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
