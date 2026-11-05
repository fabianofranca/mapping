// formatVersion 11 nos consumidores da especialização: avisos, contrato de versão e pacote
// (etapa #559, PD1).
import { describe, expect, it } from 'vitest';
import {
  diffSpecs,
  specWarnings,
  usesPackageFiles,
  type Spec,
  type SpecWarning,
} from '../../src/model';
import { validateLibrary } from '../../src/model/library';
import { parsedV11, v11Json, type Json } from './specV11Fixtures';

const owner = (s: Json) => s.layers[0].annotationTypes[0] as Json;

/** Camada de eventos com `n` tipos `e1`…`en` (a camada `eventos` ganha os tipos). */
function withEvents(spec: Json, n: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    ids.push(`e${i}`);
    spec.layers[1].annotationTypes.push({ id: `e${i}`, name: `e${i}`, fields: [] });
  }
  return ids;
}

const codes = (warnings: SpecWarning[], code: string) =>
  warnings.filter((w) => w.code === code);

describe('specWarnings: formatVersion 11', () => {
  it('allowedChildren com 20 ids em texto avisa; com 19 não', () => {
    const twenty = parsedV11((s) => {
      owner(s).allowedChildren = ['navigate', ...withEvents(s, 19)];
    });
    expect(codes(specWarnings(twenty), 'many-children-ids')).toEqual([
      {
        code: 'many-children-ids',
        path: 'layers[0].annotationTypes[0].allowedChildren',
        message:
          '20 tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos',
      },
    ]);
    const nineteen = parsedV11((s) => {
      owner(s).allowedChildren = ['navigate', ...withEvents(s, 18)];
    });
    expect(codes(specWarnings(nineteen), 'many-children-ids')).toEqual([]);
  });

  it('as cláusulas não contam como ids listados', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos' }, ...withEvents(s, 5)];
    });
    expect(codes(specWarnings(spec), 'many-children-ids')).toEqual([]);
  });

  it('grupo declarado que nenhum tipo usa', () => {
    const spec = parsedV11((s) =>
      s.layers[1].groups.push({ id: 'vazio', name: 'Vazio' }),
    );
    expect(codes(specWarnings(spec), 'unused-group')).toEqual([
      {
        code: 'unused-group',
        path: 'layers[1].groups[2]',
        message:
          'o grupo "vazio" da camada "eventos" é declarado, mas nenhum tipo está nele',
      },
    ]);
    expect(codes(specWarnings(parsedV11()), 'unused-group')).toEqual([]);
  });

  it('repositório de docRepos que nenhum doc usa', () => {
    const repos = [
      { id: 'usado', url: 'https://x.com/a' },
      { id: 'solto', url: 'https://x.com/b' },
    ];
    const spec = parsedV11((s) => {
      s.docRepos = repos;
      owner(s).doc = { repo: 'usado', path: 'a.md' };
    });
    expect(codes(specWarnings(spec), 'unused-doc-repo')).toEqual([
      {
        code: 'unused-doc-repo',
        path: 'docRepos[1]',
        message: 'o repositório "solto" de docRepos é declarado, mas nenhum `doc` o usa',
      },
    ]);
  });

  it('uma especialização sem as chaves novas não ganha aviso', () => {
    expect(specWarnings(parsedV11())).toEqual([]);
  });
});

describe('diffSpecs: as chaves novas ficam fora do contrato de versão', () => {
  const edits: Record<string, (s: Json) => void> = {
    cláusula: (s) =>
      (owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }]),
    'groups da camada': (s) => s.layers[1].groups.push({ id: 'novo', name: 'Novo' }),
    'groups do tipo': (s) => (s.layers[1].annotationTypes[1].groups = ['dados']),
    childRoles: (s) => (owner(s).childRoles = [{ id: 'a', name: 'A' }]),
    childRolesLabel: (s) => {
      owner(s).childRoles = [{ id: 'a', name: 'A' }];
      owner(s).childRolesLabel = 'Trigger';
    },
    docRepos: (s) => (s.docRepos = [{ id: 'd', url: 'https://x.com/a' }]),
    'doc objeto': (s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'a.md' };
    },
  };

  it.each(Object.keys(edits))('incluir, mudar e tirar %s não gera mudança', (name) => {
    const edit = edits[name] as (s: Json) => void;
    const plain = parsedV11();
    const added = parsedV11(edit);
    expect(diffSpecs(plain, added)).toEqual([]);
    expect(diffSpecs(added, plain)).toEqual([]);
    const changed = parsedV11((s) => {
      edit(s);
      owner(s).childRoles = [{ id: 'b', name: 'B' }];
      s.layers[1].groups[0].name = 'Outro nome';
    });
    expect(diffSpecs(added, changed)).toEqual([]);
  });

  it('a troca do doc entre texto e objeto não gera mudança', () => {
    const text = parsedV11((s) => (owner(s).doc = 'docs/button.md'));
    const object = parsedV11((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'button.md' };
    });
    expect(diffSpecs(text, object)).toEqual([]);
    expect(diffSpecs(object, text)).toEqual([]);
  });
});

describe('usesPackageFiles: doc em repositório externo', () => {
  const external = (extra?: (s: Json) => void): Spec =>
    parsedV11((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'components/button.md' };
      extra?.(s);
    });

  it('só doc objeto vale como arquivo isolado', () => {
    expect(usesPackageFiles(external())).toBe(false);
  });

  it('doc texto pede a pasta do pacote', () => {
    expect(usesPackageFiles(parsedV11((s) => (owner(s).doc = 'docs/button.md')))).toBe(
      true,
    );
  });

  it('doc objeto num tipo e doc texto noutro: pede o pacote', () => {
    const spec = external((s) => (s.layers[0].annotationTypes[1].doc = 'docs/image.md'));
    expect(usesPackageFiles(spec)).toBe(true);
  });

  it('doc objeto com component, examples ou fonts: continua pedindo o pacote', () => {
    const spec = external((s) => (s.layers[0].annotationTypes[1].component = 'c/a.json'));
    expect(usesPackageFiles(spec)).toBe(true);
  });
});

describe('validateLibrary: doc em repositório externo', () => {
  it('o nível 1 não confere o doc externo nem o conta como documento do pacote', () => {
    const json = v11Json((s) => {
      s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
      owner(s).doc = { repo: 'd', path: 'components/button.md' };
      s.layers[0].annotationTypes[1].doc = 'docs/image.md';
    });
    const report = validateLibrary({
      level: 1,
      files: [
        { path: 'pkg.spec.json', text: JSON.stringify(json) },
        { path: 'docs/image.md', text: '# Image' },
      ],
    });
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.issues.filter((i) => i.message.includes('button.md'))).toEqual([]);
    expect(report.summary.docs).toBe(1);
  });
});
