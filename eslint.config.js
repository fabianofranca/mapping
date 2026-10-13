import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

// src/model/ roda também em Node (servidor MCP): proíbe globais só de navegador
// (o que existe em `globals.browser` e não em Node) e dependências de UI/storage.
const nodeGlobals = { ...globals.node, ...globals.nodeBuiltin };
const browserOnlyGlobals = Object.keys(globals.browser).filter(
  (name) => !(name in nodeGlobals),
);
// Node 22 expõe estes nomes, mas eles não têm o comportamento do navegador.
const browserStorageGlobals = ['localStorage', 'sessionStorage', 'navigator'];
const restrictedGlobals = [
  ...new Set([...browserOnlyGlobals, ...browserStorageGlobals]),
].map((name) => ({
  name,
  message: 'src/model/ não pode depender de APIs de navegador (veja CLAUDE.md).',
}));

// mcp/ roda só no Node e não faz rede: ele lê e grava arquivos locais (veja PLAN.md, etapa 3a).
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map(
  (name) => ({ name, message: 'mcp/ não faz requisições de rede.' }),
);
const mcpOnlyFromModel = [
  'ui',
  'canvas',
  'app',
  'storage',
  'store',
  'i18n',
  'theme',
  'utils',
];

// Diretórios da app que não falam com o Konva (src/model/ tem regra própria, mais estrita).
const konvaFreeDirs = ['ui', 'app', 'store', 'storage', 'i18n', 'theme', 'utils'];

// Restrições de import do mcp/ (ver o bloco "Servidor MCP" abaixo).
const mcpImportPatterns = [
  {
    group: mcpOnlyFromModel.flatMap((dir) => [`**/src/${dir}`, `**/src/${dir}/**`]),
    message: 'mcp/ só pode importar src/model/ (veja PLAN.md, etapa 3a).',
  },
  {
    group: ['konva', 'konva/*', 'idb', 'jszip', 'preact', 'preact/*', '@preact/*'],
    message: 'mcp/ não pode importar UI, canvas nem storage.',
  },
  {
    group: [
      'node:http',
      'node:https',
      'node:http2',
      'node:net',
      'node:tls',
      'node:dns',
      'node:dgram',
    ],
    message: 'mcp/ não faz requisições de rede.',
  },
];

// Fase 8.5 (M8): só três módulos do mcp/ gravam no disco (`paths.ts`, `createProject.ts`,
// `proposalStore.ts`); nos outros, as funções de escrita do `node:fs` não podem ser importadas.
// O teste `tests/mcp/staticGuards.test.ts` é a regra completa (pega também `fs.promises.x`).
const fsWriters = [
  'writeFile',
  'appendFile',
  'rename',
  'link',
  'symlink',
  'mkdir',
  'mkdtemp',
  'rm',
  'rmdir',
  'unlink',
  'copyFile',
  'cp',
  'truncate',
  'open',
  'createWriteStream',
];
const mcpWriterImports = ['node:fs', 'node:fs/promises', 'fs', 'fs/promises'].map(
  (name) => ({
    name,
    importNames: [...fsWriters, ...fsWriters.map((fn) => `${fn}Sync`)],
    message:
      'mcp/ só grava em paths.ts, createProject.ts e proposalStore.ts (o mapping.json é da app).',
  }),
);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-mcp',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  // Só as duas regras clássicas; as regras do React Compiler (preset
  // `recommended` da v7) não se aplicam ao Preact.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Konva fica isolado em src/canvas/ (CanvasController e CanvasHost; veja CLAUDE.md).
  {
    files: [`src/{${konvaFreeDirs.join(',')}}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['konva', 'konva/*'],
              message: 'Konva fica só em src/canvas/ (veja CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/model/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'konva',
                'konva/*',
                'idb',
                'jszip',
                'preact',
                'preact/*',
                '@preact/*',
              ],
              message: 'src/model/ não pode importar UI, canvas nem storage.',
            },
            {
              group: ['../*'],
              message: 'src/model/ só pode importar arquivos do próprio model.',
            },
          ],
        },
      ],
    },
  },
  // Servidor MCP: Node puro. Do app só pode importar `src/model/`.
  {
    files: ['mcp/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals, ...networkGlobals],
      'no-restricted-imports': [
        'error',
        { patterns: mcpImportPatterns, paths: mcpWriterImports },
      ],
    },
  },
  { files: ['tests/mcp/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['pwa/**/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  // Fase 8.5: o gancho de disco dos testes do MCP (`tests/mcp/fsHooks.mjs`) roda no Node.
  { files: ['tests/mcp/**/*.mjs'], languageOptions: { globals: globals.node } },
  // Fase 8.5: os três módulos do servidor que gravam, e o script de build (`build.mjs`, que gera
  // o `dist-mcp/` e não entra no bundle). No flat config, este bloco substitui a regra do bloco
  // "Servidor MCP" nesses arquivos: repete as restrições antigas (`mcpImportPatterns`) e só
  // tira as de escrita do `node:fs`.
  {
    files: [
      'mcp/paths.ts',
      'mcp/createProject.ts',
      'mcp/proposalStore.ts',
      'mcp/build.mjs',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: mcpImportPatterns }],
    },
  },
  prettier,
);
