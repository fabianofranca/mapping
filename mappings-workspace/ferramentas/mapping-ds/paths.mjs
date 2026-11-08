// Absolute paths of the Mapping DS pipeline, derived from where this file lives, so the scripts
// work wherever the repository is cloned.
//   base = mappings-workspace/ferramentas/mapping-ds   (the pipeline)
//   ws   = mappings-workspace                          (projetos/, especializacoes/)
//   repo = the repository root                         (src/, docs/, git tags)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const posix = (p) => p.replace(/\\/g, '/');
const base = dirname(fileURLToPath(import.meta.url));

export const PATHS = {
  base: posix(base),
  ws: posix(resolve(base, '../..')),
  repo: posix(resolve(base, '../../..')),
};
