// Gera dist-viewer/: o visualizador embutível, um pacote npm instalável (`npm pack`).
//   mapping-viewer.js        núcleo sem framework (createViewer, loadLibrary, screenTree...)
//   mapping-viewer-react.js  invólucro <MappingViewer/> (react, react/jsx-runtime e react-dom ficam
//                            de fora: o hospedeiro fornece o React dele)
//   *.js.map                 mapas de código (externos), um por bundle
//   types/                   declarações (.d.ts) das duas entradas, geradas pelo tsc
//   package.json, README.md  o manifesto do pacote (exports "." e "./react") e o guia de uso
// Cada .js é autocontido (com o Konva e o motor embutidos): o hospedeiro usa um OU outro.
// ESM de propósito: `dist-viewer/package.json` declara "type": "module".
// Minificado, com mapas: núcleo ~ 227 kB (mapa ~ 1,2 MB) e invólucro React ~ 228 kB
// (mapa ~ 1,2 MB); sem minificar eram ~ 487 kB e ~ 489 kB. Os mapas não pesam no site do
// hospedeiro (o navegador só os baixa com o DevTools aberto).
// O tsc roda primeiro (e verifica os tipos); se falhar, nada é gerado. Depois do esbuild, o
// script confere que todo arquivo apontado por `exports` existe.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { access, copyFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Versão do pacote: sobe junto com mudanças da API (exports, assinaturas, comportamento).
const VIEWER_VERSION = '0.3.0';

const OUT = 'dist-viewer';

// Sem `sideEffects: false` de propósito: o núcleo ajusta `Konva.pixelRatio` ao carregar.
// Sem `license`: o repositório ainda não tem arquivo LICENSE.
const packageJson = {
  name: 'mapping-viewer',
  version: VIEWER_VERSION,
  description:
    'Visualizador embutível do Mapping: desenha uma tela de componentes (Konva), com núcleo sem framework e invólucro React.',
  type: 'module',
  files: ['*.js', '*.js.map', 'types', 'README.md'],
  exports: {
    '.': {
      types: './types/lab/viewer/index.d.ts',
      import: './mapping-viewer.js',
    },
    './react': {
      types: './types/lab/viewer/react.d.ts',
      import: './mapping-viewer-react.js',
    },
  },
  types: './types/lab/viewer/index.d.ts',
  peerDependencies: { react: '>=18' },
  peerDependenciesMeta: { react: { optional: true } },
};

execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'lab/viewer/tsconfig.json'],
  {
    stdio: 'inherit',
  },
);

await build({
  entryPoints: {
    'mapping-viewer': 'lab/viewer/index.ts',
    'mapping-viewer-react': 'lab/viewer/react.tsx',
  },
  outdir: OUT,
  bundle: true,
  splitting: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  jsx: 'automatic',
  legalComments: 'none',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});

await writeFile(`${OUT}/package.json`, `${JSON.stringify(packageJson, null, 2)}\n`);
await copyFile('lab/viewer/PACKAGE-README.md', `${OUT}/README.md`);

/** Os caminhos (strings) de `exports`, em qualquer profundidade, mais o campo `types`. */
function exportedFiles(value) {
  if (typeof value === 'string') return [value];
  return Object.values(value).flatMap(exportedFiles);
}

const missing = [];
for (const file of [...exportedFiles(packageJson.exports), packageJson.types]) {
  try {
    await access(`${OUT}/${file}`);
  } catch {
    missing.push(file);
  }
}
if (missing.length > 0) {
  process.stderr.write(
    `dist-viewer/package.json aponta para arquivos que o build não gerou: ${missing.join(', ')}\n`,
  );
  process.exit(1);
}
