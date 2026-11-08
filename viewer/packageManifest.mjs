// Manifesto do pacote `mapping-viewer` (o `package.json` de dist-viewer/). Fica num módulo
// próprio para o build e o teste das declarações (tests/viewer/declarations.test.ts) lerem a
// mesma fonte, sem rodar o build.
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

// Versão do pacote: sobe junto com mudanças da API (exports, assinaturas, comportamento).
export const VIEWER_VERSION = '0.4.1';

// A faixa do Konva vem do package.json da raiz, nunca escrita à mão.
const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

// Sem `sideEffects: false` de propósito: o núcleo ajusta `Konva.pixelRatio` ao carregar.
// Sem `license`: o repositório ainda não tem arquivo LICENSE.
export const packageJson = {
  name: 'mapping-viewer',
  version: VIEWER_VERSION,
  description:
    'Visualizador embutível do Mapping: desenha uma tela de componentes (Konva), com núcleo sem framework e invólucro React.',
  type: 'module',
  files: ['*.js', '*.js.map', 'types', 'README.md'],
  exports: {
    '.': {
      types: './types/viewer/index.d.ts',
      import: './mapping-viewer.js',
    },
    './react': {
      types: './types/viewer/react.d.ts',
      import: './mapping-viewer-react.js',
    },
  },
  types: './types/viewer/index.d.ts',
  // `konva` é peer só pelos tipos (ScreenRenderer expõe Konva.Group): o código usa a cópia
  // embutida no bundle. Obrigatório (não opcional) para o npm 7+ instalá-lo sozinho.
  peerDependencies: { konva: rootPackage.dependencies.konva, react: '>=18' },
  peerDependenciesMeta: { react: { optional: true } },
};
