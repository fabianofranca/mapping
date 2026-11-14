// Disk hooks for the concurrency tests over stdio (phase 8.5). Loaded only by the
// tests, with `node --import`, BEFORE `mapping-mcp.js`: replaces functions on the
// `node:fs/promises` module object, which the CJS bundle calls as `import_promises.readFile(...)`. Nothing here
// goes into the bundle (`tests/mcp/staticGuards.test.ts` checks).
//
// The configuration is a JSON in the file pointed to by `MAPPING_MCP_FS_HOOKS`, re-read on every
// call (the test arms and disarms the hooks between one tool and another). Without the file, nothing changes.
//
// {
//   "afterRead": [{ "match": "fontes/tela.png", "append": { "file": "/abs/mapping.json", "text": "\n" } }],
//   "fail": [{ "fn": "link", "match": "/images/", "code": "EPERM" }, { "fn": "rm", "match": ".tmp", "code": "EBUSY" }]
// }
//
// `match` is a piece of the path (any text argument of the call). `afterRead` appends
// `text` to `file` after each matching read (or, with `copy: { from, to }`, copies `from`
// over `to`); with `nth`, only after the nth matching read (counted per rule, from the
// start of the process). `fail` makes the function reject with the code.

import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import fsp from 'node:fs/promises';

const configFile = process.env.MAPPING_MCP_FS_HOOKS;
const counts = new Map();

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
  const error = new Error(`${code}: ${fn} refused by the test hook`);
  error.code = code;
  error.syscall = fn;
  error.path = typeof args[0] === 'string' ? args[0] : undefined;
  return error;
}

for (const fn of ['readFile', 'link', 'rename', 'rm', 'writeFile']) {
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
        if (!matches(args, rule.match)) continue;
        const key = JSON.stringify(rule);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (rule.nth !== undefined && count !== rule.nth) continue;
        if (rule.copy) copyFileSync(rule.copy.from, rule.copy.to);
        else appendFileSync(rule.append.file, rule.append.text);
      }
    }
    return result;
  };
}
