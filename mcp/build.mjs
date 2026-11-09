// Gera dist-mcp/mapping-mcp.js: um arquivo só, com as dependências embutidas.
// CommonJS de propósito: o `.js` roda com `node` em qualquer repositório, a menos que
// ele declare `"type": "module"` (nesse caso, ponha um package.json `{"type":"commonjs"}` em tools/).
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { fontFiles } from './fontFiles.mjs';
import { wasmFiles } from './wasmFiles.mjs';

// `import bytes from 'wasm:<codec>'` embute os bytes do módulo WebAssembly do codec de imagem
// (@jsquash). Os pacotes têm um `.d.ts` ao lado de cada `.wasm`, então o import passa por este
// nome virtual (tipado em mcp/image/wasm.d.ts).
const require = createRequire(import.meta.url);
const wasmModules = {
  name: 'wasm-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^wasm:/ }, (args) => {
      const file = wasmFiles[args.path];
      if (!file)
        return { errors: [{ text: `módulo WebAssembly desconhecido: ${args.path}` }] };
      return { path: require.resolve(file), namespace: 'wasm-bytes' };
    });
    esbuild.onLoad({ filter: /.*/, namespace: 'wasm-bytes' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
      watchFiles: [args.path],
    }));
  },
};

// `import bytes from 'font:sans'` embute os bytes do TTF livre (mcp/fonts/), como os wasm.
const fontModules = {
  name: 'font-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^font:/ }, (args) => {
      const file = fontFiles[args.path];
      if (!file) return { errors: [{ text: `fonte desconhecida: ${args.path}` }] };
      return { path: resolve(import.meta.dirname, file), namespace: 'font-bytes' };
    });
    esbuild.onLoad({ filter: /.*/, namespace: 'font-bytes' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
      watchFiles: [args.path],
    }));
  },
};

// `import texto from './arquivo.md?raw'` embute o texto do arquivo (a documentação servida como recurso).
const rawText = {
  name: 'raw-text',
  setup(esbuild) {
    esbuild.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    esbuild.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
      watchFiles: [args.path],
    }));
  },
};

// Sufixo do canal de publicação (snapshot de PR ou release candidate), posto pelo workflow
// `mcp-prerelease.yml`; vazio na estável. Vira `BUILD_VERSION` em mcp/version.ts.
const suffix = process.env.MCP_BUILD_SUFFIX ?? '';
if (suffix !== '' && !/^-(snapshot\.pr\d+\+[0-9a-f]{7,}|rc\.\d+)$/.test(suffix)) {
  throw new Error(
    `MCP_BUILD_SUFFIX inválido: "${suffix}" (esperado vazio, "-rc.<n>" ou "-snapshot.pr<N>+<sha>").`,
  );
}

const result = await build({
  entryPoints: ['mcp/main.ts'],
  plugins: [rawText, wasmModules, fontModules],
  // A versão minificada do opentype.js (245 kB em vez de 495 kB): o limite do servidor é +500 kB.
  alias: { 'opentype.js': 'opentype.js/dist/opentype.min.mjs' },
  outfile: 'dist-mcp/mapping-mcp.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Os comentários legais que as dependências já trazem vão para o fim do arquivo; os avisos
  // das que não os trazem (a maioria) são acrescentados abaixo, a partir dos arquivos LICENSE.
  legalComments: 'eof',
  metafile: true,
  banner: { js: '#!/usr/bin/env node' },
  define: { __MCP_BUILD_SUFFIX__: JSON.stringify(suffix) },
  logLevel: 'info',
});

/** Pasta de cada pacote de `node_modules` que entrou no bundle (inclusive os escopados). */
function bundledPackages(inputs) {
  const dirs = new Set();
  for (const input of Object.keys(inputs)) {
    // Os arquivos dos plugins levam o nome do namespace na frente (`wasm-bytes:<caminho>`).
    const match = /^(?:[a-z-]+:)?(.*?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (match) dirs.add(resolve(match[1]));
  }
  return [...dirs].sort();
}

/** Textos de licença de um pacote: `LICENSE*` na raiz e o `LICENSE.codec.md` dos codecs. */
async function licenseTexts(dir) {
  const names = (await readdir(dir)).filter((n) => /^licen[cs]e(\.|$)/i.test(n)).sort();
  const files = names.map((n) => join(dir, n));
  if ((await readdir(dir)).includes('codec')) {
    files.push(join(dir, 'codec', 'LICENSE.codec.md'));
  }
  const texts = [];
  for (const file of files) {
    try {
      texts.push((await readFile(file, 'utf8')).trim());
    } catch {
      // Sem esse arquivo (só a pasta `codec` existe): o pacote fica com os que há.
    }
  }
  return texts;
}

// Os avisos de licença (Apache-2.0, BSD, MIT) dos pacotes embutidos vão no fim do bundle.
const notices = [];
for (const dir of bundledPackages(result.metafile.inputs)) {
  const name = dir.slice(dir.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const texts = await licenseTexts(dir);
  if (texts.length === 0) continue;
  notices.push(`== ${name} ==\n${texts.join('\n\n')}`);
}
if (notices.length > 0) {
  const body = `THIRD-PARTY NOTICES\n\n${notices.join('\n\n')}`.replaceAll('*/', '* /');
  await appendFile('dist-mcp/mapping-mcp.js', `\n/*!\n${body}\n*/\n`);
}

// Este repositório declara "type": "module": sem isto, o `node` leria o bundle como ESM.
await writeFile('dist-mcp/package.json', '{ "type": "commonjs" }\n');
