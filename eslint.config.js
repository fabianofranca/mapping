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

// Etapa 8 (8.3): seletor por classe em `querySelector(All)` atravessa componentes (a
// classe é do CSS de outro componente); dentro do próprio `ref`, use `[data-…]` ou `[role=…]`.
const classSelectorMessage =
  'Seletor por classe atravessa componentes: use um ref ou [data-…]/[role=…] dentro do próprio ref (docs/ARCHITECTURE.md, "Foco e teclado").';
const classSelectorRules = [
  {
    selector:
      'CallExpression[callee.property.name=/^querySelector(All)?$/] > Literal.arguments[value=/\\./]',
    message: classSelectorMessage,
  },
  {
    selector:
      'CallExpression[callee.property.name=/^querySelector(All)?$/] > TemplateLiteral.arguments > TemplateElement[value.raw=/\\./]',
    message: classSelectorMessage,
  },
];
// Consulta global ao DOM em src/ui e src/app: um contrato invisível entre componentes.
const focusSyntaxRules = [
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName)$/]",
    message:
      'Consulta global ao DOM: use um ref, returnFocus, buttonRef/triggerRef ou um signal (docs/ARCHITECTURE.md, "Foco e teclado").',
  },
  ...classSelectorRules,
];
// Exceções nominais da consulta global: o último recurso do retorno do foco
// (`data-focus-root`) e a janela de ferramenta pelo `data-window` (função de módulo).
const focusGlobalQueryExceptions = ['src/ui/focus.ts', 'src/ui/toolWindowLayout.ts'];

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
// Fase 8.4: o controller confere se a pasta tem projeto por `hasMappingFile` (storage/folder.ts),
// sem `loadMapping`; ele só grava o mapping.json ao criar o projeto em pasta.
const controllerFileSyntaxRules = [
  {
    selector: onlyInFunction('saveMapping', 'FunctionDeclaration', 'createFolderProject'),
    message:
      'No controller, saveMapping() só na criação do projeto em pasta (createFolderProject); o resto é da sessão.',
  },
  {
    selector: mappingCall('loadMapping'),
    message:
      'No controller, use hasMappingFile (storage/folder.ts) para conferir a pasta; ler o mapping.json é da sessão e do loadProject.',
  },
];

// Fase 8.4: o armazenamento do navegador só passa por `utils/safeStorage.ts` (try/catch e a
// chave do canal) e por `storage/local.ts` (os bancos IndexedDB). O `src/model/` fica fora
// deste bloco: a regra da arquitetura dele já proíbe esses nomes (e mais), e um segundo
// `no-restricted-globals` nos mesmos arquivos substituiria aquele.
// `tests/tooling/storageGlobalsLint.test.ts` prova as duas regras.
const storageGlobalsMessage =
  'Use readSetting/writeSetting (utils/safeStorage.ts) ou storage/local.ts: o acesso direto ao armazenamento do navegador pode lançar (modo privado, file://).';
const storageGlobalNames = ['localStorage', 'sessionStorage', 'indexedDB'];
const storageGlobals = storageGlobalNames.map((name) => ({
  name,
  message: storageGlobalsMessage,
}));
const storageGlobalProperties = ['window', 'globalThis', 'self'].flatMap((object) =>
  storageGlobalNames.map((property) => ({
    object,
    property,
    message: storageGlobalsMessage,
  })),
);
const storageGlobalExceptions = ['src/utils/safeStorage.ts', 'src/storage/local.ts'];

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
  // Armazenamento do navegador (fase 8.4; constantes definidas acima).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/model/**', ...storageGlobalExceptions],
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals],
      'no-restricted-properties': ['error', ...storageGlobalProperties],
    },
  },
  // Fase 8.4: sinal do próximo god-module (o controller tinha 713 linhas e oito
  // responsabilidades). Aviso, não erro: dividir é decisão de desenho, não de lint.
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
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
  // Etapa 8 (8.3), foco e teclado: nenhum componente acha outro pelo DOM global nem pela
  // classe de outro componente (`docs/ARCHITECTURE.md`, "Foco e teclado"). No flat config o
  // último bloco vence por regra, então estes blocos repetem os seletores da sessão (8.1)
  // para os mesmos arquivos: `sessionStorageSyntaxRules` em src/ui e src/app e
  // `controllerFileSyntaxRules` no controller (exceção da 8.1). Outra fase que use
  // `no-restricted-syntax` nestes arquivos junta os seletores dela aqui.
  {
    files: ['src/{ui,app}/**/*.{ts,tsx}'],
    ignores: [...focusGlobalQueryExceptions, 'src/app/controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionStorageSyntaxRules,
        ...focusSyntaxRules,
      ],
    },
  },
  {
    files: focusGlobalQueryExceptions,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionStorageSyntaxRules,
        ...classSelectorRules,
      ],
    },
  },
  {
    files: ['src/app/controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...controllerFileSyntaxRules,
        ...focusSyntaxRules,
      ],
    },
  },
);
