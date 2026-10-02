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

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
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
  { files: ['pwa/**/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  prettier,
);
