// Ganchos de disco para os testes de concorrência por stdio (fase 8.5). Carregado só pelos
// testes, com `node --import`, ANTES do `mapping-mcp.js`: troca funções do objeto do módulo
// `node:fs/promises`, que o bundle CJS chama como `import_promises.readFile(...)`. Nada daqui
// entra no bundle (`tests/mcp/staticGuards.test.ts` confere).
//
// A configuração é um JSON no arquivo apontado por `MAPPING_MCP_FS_HOOKS`, relido a cada
// chamada (o teste arma e desarma os ganchos entre uma tool e outra). Sem o arquivo, nada muda.
//
// {
//   "afterRead": [{ "match": "fontes/tela.png", "append": { "file": "/abs/mapping.json", "text": "\n" } }],
//   "fail": [{ "fn": "link", "match": "/images/", "code": "EPERM" }]
// }
//
// `match` é um trecho do caminho (qualquer argumento de texto da chamada). `afterRead` acrescenta
// `text` a `file` depois de cada leitura que casa; `fail` faz a função rejeitar com o código.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';

const configFile = process.env.MAPPING_MCP_FS_HOOKS;

function config() {
  if (!configFile || !existsSync(configFile)) return {};
  try {
    return JSON.parse(readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
}

const matches = (args, match) =>
  args.some((arg) => typeof arg === 'string' && arg.includes(match));

function failure(fn, code, args) {
  const error = new Error(`${code}: ${fn} recusado pelo gancho de teste`);
  error.code = code;
  error.syscall = fn;
  error.path = typeof args[0] === 'string' ? args[0] : undefined;
  return error;
}

for (const fn of ['readFile', 'link', 'rename', 'writeFile']) {
  const original = fsp[fn];
  fsp[fn] = async (...args) => {
    const hooks = config();
    for (const rule of hooks.fail ?? []) {
      if (rule.fn === fn && matches(args, rule.match)) {
        throw failure(fn, rule.code, args);
      }
    }
    const result = await original(...args);
    if (fn === 'readFile') {
      for (const rule of hooks.afterRead ?? []) {
        if (matches(args, rule.match)) appendFileSync(rule.append.file, rule.append.text);
      }
    }
    return result;
  };
}
