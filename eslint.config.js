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
      'react-hooks/exhaustive-deps': 'warn',
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
        {
          patterns: [
            {
              group: mcpOnlyFromModel.flatMap((dir) => [
                `**/src/${dir}`,
                `**/src/${dir}/**`,
              ]),
              message: 'mcp/ só pode importar src/model/ (veja PLAN.md, etapa 3a).',
            },
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
          ],
        },
      ],
    },
  },
  { files: ['tests/mcp/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['pwa/**/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  prettier,
);
