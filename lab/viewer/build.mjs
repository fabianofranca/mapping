// Gera dist-viewer/: o visualizador embutível, para qualquer hospedeiro.
//   mapping-viewer.js        núcleo sem framework (createViewer, loadLibrary, parseScreen...)
//   mapping-viewer-react.js  invólucro <MappingViewer/> (react, react/jsx-runtime e react-dom ficam
//                            de fora: o hospedeiro fornece o React dele)
//   types/                   declarações (.d.ts) das duas entradas, geradas pelo tsc
// Cada .js é autocontido (com o Konva e o motor embutidos): o hospedeiro usa um OU outro.
// ESM de propósito: `dist-viewer/package.json` declara "type": "module".
// O tsc roda primeiro (e verifica os tipos); se falhar, nada é gerado.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

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
  outdir: 'dist-viewer',
  bundle: true,
  splitting: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  jsx: 'automatic',
  legalComments: 'none',
  logLevel: 'info',
});

await writeFile('dist-viewer/package.json', '{ "type": "module" }\n');
