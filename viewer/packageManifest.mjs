// Manifest of the `mapping-viewer` package (the `package.json` of dist-viewer/). It lives in its own
// module so the build and the declarations test (tests/viewer/declarations.test.ts) read the
// same source, without running the build.
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

// Package version: it goes up with API changes (exports, signatures, behavior).
export const VIEWER_VERSION = '0.4.2';

// The Konva range comes from the root package.json, never written by hand.
const rootPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

// Without `sideEffects: false` on purpose: the bundled Konva registers classes on load.
// Without `license`: the repository does not have a LICENSE file yet.
export const packageJson = {
  name: 'mapping-viewer',
  version: VIEWER_VERSION,
  description:
    'Embeddable viewer of Mapping: draws a screen of components (Konva), with a framework-free core and a React wrapper.',
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
  // `konva` is a peer only for the types (ScreenRenderer exposes Konva.Group): the code uses the copy
  // bundled in the output. Required (not optional) so that npm 7+ installs it on its own.
  peerDependencies: { konva: rootPackage.dependencies.konva, react: '>=18' },
  peerDependenciesMeta: { react: { optional: true } },
};
