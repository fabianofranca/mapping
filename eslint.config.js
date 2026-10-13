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

// Só a sessão (src/store/session.ts) lê e grava o mapping.json de um projeto aberto: a
// conferência de alteração externa (revisão e conteúdo) depende de todo acesso passar por ela
// (fase 8.1; veja docs/ARCHITECTURE.md, "Sessão e gravação"). As exceções: `loadProject.ts`
// (abrir e recarregar) e, no controller, as conferências de existência e a criação da pasta.
// Os seletores ficam em constantes nomeadas porque `no-restricted-syntax` de um bloco
// posterior SUBSTITUI o anterior nos arquivos em comum: outro conjunto para `src/ui/**` ou
// `src/app/**` (ex.: o do foco, fase 8.3) precisa ser juntado ao mesmo bloco
// (`[...sessionStorageSyntaxRules, ...outros]`). `tests/tooling/sessionStorageLint.test.ts`
// prova que a regra pega o padrão antigo em `src/app/` e `src/ui/`.
const mappingCall = (method) =>
  `CallExpression[callee.type='MemberExpression'][callee.property.name='${method}']`;
const onlyInFunction = (method, kind, name) =>
  `${mappingCall(method)}:not(${kind}[id.name='${name}'] CallExpression)`;
export const sessionStorageSyntaxRules = ['loadMapping', 'saveMapping'].map((method) => ({
  selector: mappingCall(method),
  message: `Só a sessão (src/store/session.ts) lê e grava o mapping.json de um projeto aberto; use session.sync()/flush() (veja docs/ARCHITECTURE.md).`,
}));
const sessionFileSyntaxRules = [
  {
    selector: onlyInFunction('loadMapping', 'VariableDeclarator', 'readMapping'),
    message:
      'Em session.ts, storage.loadMapping() só dentro de readMapping (o único ponto de leitura).',
  },
  {
    selector: onlyInFunction('saveMapping', 'VariableDeclarator', 'writeProject'),
    message:
      'Em session.ts, storage.saveMapping() só dentro de writeProject (o único ponto de gravação).',
  },
];
const controllerFileSyntaxRules = [
  {
    selector: onlyInFunction('saveMapping', 'FunctionDeclaration', 'createFolderProject'),
    message:
      'No controller, saveMapping() só na criação do projeto em pasta (createFolderProject); o resto é da sessão.',
  },
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
  // Só a sessão lê e grava o mapping.json (fase 8.1; constantes definidas acima).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/store/session.ts',
      'src/storage/loadProject.ts',
      'src/app/controller.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...sessionStorageSyntaxRules] },
  },
  {
    files: ['src/store/session.ts'],
    rules: { 'no-restricted-syntax': ['error', ...sessionFileSyntaxRules] },
  },
  {
    files: ['src/app/controller.ts'],
    rules: { 'no-restricted-syntax': ['error', ...controllerFileSyntaxRules] },
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
