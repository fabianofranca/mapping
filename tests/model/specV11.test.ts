// `formatVersion` 11: filhos por camada e grupo, papéis no vínculo e documento em repositório
// externo (etapa #559, PD1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseSpec,
  parseSpecText,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
} from '../../src/model';
import { issuesOf, OWNER, parsedV11, v11Json, type Json } from './specV11Fixtures';

const EVENTS = 'layers[1]';
const EVENT0 = `${EVENTS}.annotationTypes[0]`;
const EMPTY_GROUPS = 'não pode ser vazio; tire a chave ou liste ao menos um grupo';
const BAD_PATH =
  'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: components/button.md)';

const owner = (spec: Json) => spec.layers[0].annotationTypes[0] as Json;
const event = (spec: Json, i: number) => spec.layers[1].annotationTypes[i] as Json;

/** v11 com o repo `design-docs` e um `doc` objeto no `button`. */
function withDoc(doc: unknown, edit?: (spec: Json) => void): Json {
  return v11Json((spec) => {
    spec.docRepos = [
      {
        id: 'design-docs',
        url: 'https://gitlab.empresa.com/grupo/design-docs',
        urlTemplate: 'https://gitlab.empresa.com/grupo/design-docs/-/blob/main/{path}',
        ref: 'main',
      },
    ];
    owner(spec).doc = doc;
    edit?.(spec);
  });
}

describe('formatVersion 11: versões', () => {
  it('a versão atual é a 15 e v1 a v11 continuam aceitas', () => {
    expect(SPEC_FORMAT_VERSION).toBe(15);
    expect(SPEC_FORMAT_VERSIONS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    for (const v of SPEC_FORMAT_VERSIONS) {
      expect(issuesOf(v11Json(undefined, v)), `v${v}`).toEqual([]);
    }
  });

  it('a mensagem de versão inválida lista de 1 a 15', () => {
    expect(issuesOf(v11Json(undefined, 16))).toContainEqual({
      path: 'formatVersion',
      message: 'deve ser 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 ou 15',
    });
  });

  it('as especializações de examples/ e de libraries/ continuam válidas', () => {
    const files = [
      ...readdirSync('examples/specs').map((f) => join('examples/specs', f)),
      ...['kotlin', 'material3-compose', 'notas'].map((d) =>
        join('libraries', d, `${d}.spec.json`),
      ),
    ];
    expect(files.length).toBe(6);
    for (const file of files) {
      const result = parseSpecText(readFileSync(file, 'utf8'));
      expect(result.ok ? [] : result.errors, file).toEqual([]);
    }
  });
});

describe('formatVersion 11: o que vale', () => {
  it('cláusula sem groups (a camada inteira) e com groups', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos' }];
      s.layers[0].annotationTypes[1].allowedChildren = [
        { layer: 'eventos', groups: ['navegacao', 'dados'] },
      ];
    });
    expect(spec.layers[0]?.annotationTypes[0]?.allowedChildren).toEqual([
      { layer: 'eventos' },
    ]);
    expect(spec.layers[0]?.annotationTypes[1]?.allowedChildren).toEqual([
      { layer: 'eventos', groups: ['navegacao', 'dados'] },
    ]);
  });

  it('lista mista de ids e cláusulas', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = ['onHold', { layer: 'eventos', groups: ['dados'] }];
    });
    expect(spec.layers[0]?.annotationTypes[0]?.allowedChildren).toEqual([
      'onHold',
      { layer: 'eventos', groups: ['dados'] },
    ]);
  });

  it('groups na camada (com description) e no tipo', () => {
    const spec = parsedV11();
    expect(spec.layers[1]?.groups).toEqual([
      { id: 'navegacao', name: 'Navegação' },
      { id: 'dados', name: 'Dados', description: 'Eventos de dados' },
    ]);
    expect(spec.layers[1]?.annotationTypes[4]?.groups).toEqual(['dados', 'navegacao']);
  });

  it('childRoles com e sem childRolesLabel', () => {
    const roles = [
      { id: 'click', name: 'Clique' },
      { id: 'hold', name: 'Pressionar', description: 'Segurar o botão' },
    ];
    const withoutLabel = parsedV11((s) => (owner(s).childRoles = roles));
    expect(withoutLabel.layers[0]?.annotationTypes[0]?.childRoles).toEqual(roles);
    expect(withoutLabel.layers[0]?.annotationTypes[0]?.childRolesLabel).toBeUndefined();
    const withLabel = parsedV11((s) => {
      owner(s).childRoles = roles;
      owner(s).childRolesLabel = 'Trigger';
    });
    expect(withLabel.layers[0]?.annotationTypes[0]?.childRolesLabel).toBe('Trigger');
  });

  it('docRepos e doc objeto; doc texto continua valendo', () => {
    const spec = parsedV11((s) => {
      s.docRepos = [{ id: 'design-docs', url: 'https://gitlab.empresa.com/g/d' }];
      owner(s).doc = { repo: 'design-docs', path: 'components/button.md' };
      s.layers[0].annotationTypes[1].doc = 'docs/image.md';
    });
    expect(spec.docRepos).toEqual([
      { id: 'design-docs', url: 'https://gitlab.empresa.com/g/d' },
    ]);
    expect(spec.layers[0]?.annotationTypes[0]?.doc).toEqual({
      repo: 'design-docs',
      path: 'components/button.md',
    });
    expect(spec.layers[0]?.annotationTypes[1]?.doc).toBe('docs/image.md');
  });
});

describe('formatVersion 11: cláusula de allowedChildren', () => {
  const clause = (c: unknown) => (s: Json) => (owner(s).allowedChildren = [c]);
  const at = `${OWNER}.allowedChildren[0]`;

  it('camada inexistente', () => {
    expect(issuesOf(v11Json(clause({ layer: 'nada' })))).toContainEqual({
      path: `${at}.layer`,
      message: 'camada "nada" não existe na especialização',
    });
  });

  it('camada igual à do dono', () => {
    expect(issuesOf(v11Json(clause({ layer: 'componentes' })))).toContainEqual({
      path: `${at}.layer`,
      message:
        'camada "componentes" é a do próprio tipo; filhos devem estar em outra camada',
    });
  });

  it('grupo inexistente na camada da cláusula', () => {
    expect(
      issuesOf(v11Json(clause({ layer: 'eventos', groups: ['dados', 'nada'] }))),
    ).toEqual([
      { path: `${at}.groups[1]`, message: 'grupo "nada" não existe na camada "eventos"' },
    ]);
  });

  it('groups: [] na cláusula', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', groups: [] })))).toEqual([
      { path: `${at}.groups`, message: EMPTY_GROUPS },
    ]);
  });

  it('groups que não é lista é erro de forma, sem derrubar o parseSpec', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', groups: 3 })))).toEqual([
      { path: `${at}.groups`, message: 'deve ser uma lista de ids de grupo' },
    ]);
  });

  it('propriedade a mais na cláusula', () => {
    expect(issuesOf(v11Json(clause({ layer: 'eventos', extra: 1 })))).toEqual([
      { path: at, message: 'propriedade desconhecida: "extra"' },
    ]);
  });

  it('cláusula sem layer e item que não é texto nem objeto', () => {
    expect(issuesOf(v11Json(clause({ groups: ['dados'] })))).toEqual([
      { path: `${at}.layer`, message: 'obrigatório' },
    ]);
    expect(issuesOf(v11Json(clause(5)))).toEqual([
      {
        path: at,
        message: 'deve ser um id de tipo (texto) ou uma cláusula { layer, groups }',
      },
    ]);
  });

  it('o id em texto continua conferido como antes', () => {
    expect(issuesOf(v11Json(clause('nada')))).toContainEqual({
      path: at,
      message: 'tipo "nada" não existe na especialização',
    });
    expect(issuesOf(v11Json(clause('image')))).toContainEqual({
      path: at,
      message: 'tipo "image" está na mesma camada; filhos devem estar em outra camada',
    });
  });
});

describe('formatVersion 11: groups', () => {
  it('grupo do tipo inexistente na camada do tipo', () => {
    const spec = v11Json((s) => (event(s, 1).groups = ['navegacao', 'nada']));
    expect(issuesOf(spec)).toEqual([
      {
        path: `${EVENTS}.annotationTypes[1].groups[1]`,
        message: 'grupo "nada" não existe na camada "eventos"',
      },
    ]);
  });

  it('grupo do tipo numa camada que não declara groups', () => {
    const spec = v11Json((s) => (s.layers[0].annotationTypes[1].groups = ['navegacao']));
    expect(issuesOf(spec)).toEqual([
      {
        path: 'layers[0].annotationTypes[1].groups[0]',
        message: 'grupo "navegacao" não existe na camada "componentes"',
      },
    ]);
  });

  it('id de grupo repetido na camada', () => {
    const spec = v11Json((s) => s.layers[1].groups.push({ id: 'dados', name: 'Outro' }));
    expect(issuesOf(spec)).toEqual([
      { path: `${EVENTS}.groups[2].id`, message: 'id "dados" repetido' },
    ]);
  });

  it('name vazio ou ausente no grupo', () => {
    const spec = v11Json((s) => (s.layers[1].groups[0].name = ''));
    expect(issuesOf(spec)).toEqual([
      { path: `${EVENTS}.groups[0].name`, message: 'não pode ser vazio' },
    ]);
  });

  it('groups: [] e grupo repetido no tipo', () => {
    expect(issuesOf(v11Json((s) => (event(s, 0).groups = [])))).toEqual([
      { path: `${EVENT0}.groups`, message: EMPTY_GROUPS },
    ]);
    expect(
      issuesOf(v11Json((s) => (event(s, 0).groups = ['navegacao', 'navegacao']))),
    ).toEqual([{ path: `${EVENT0}.groups[1]`, message: 'grupo "navegacao" repetido' }]);
  });
});

describe('formatVersion 11: childRoles e childRolesLabel', () => {
  const roles = [{ id: 'click', name: 'Clique' }];

  it('childRoles vazio', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRoles = [])))).toEqual([
      {
        path: `${OWNER}.childRoles`,
        message: 'não pode ser vazio; tire a chave ou declare ao menos um papel',
      },
    ]);
  });

  it('id de papel repetido', () => {
    const spec = v11Json(
      (s) =>
        (owner(s).childRoles = [
          { id: 'click', name: 'Clique' },
          { id: 'click', name: 'Outro' },
        ]),
    );
    expect(issuesOf(spec)).toEqual([
      { path: `${OWNER}.childRoles[1].id`, message: 'id "click" repetido' },
    ]);
  });

  it('childRoles em tipo sem allowedChildren', () => {
    const spec = v11Json((s) => (s.layers[0].annotationTypes[1].childRoles = roles));
    expect(issuesOf(spec)).toEqual([
      {
        path: 'layers[0].annotationTypes[1].childRoles',
        message: 'só é permitido em tipo com allowedChildren',
      },
    ]);
  });

  it('childRolesLabel sem childRoles; vazio com childRoles', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRolesLabel = 'Trigger')))).toEqual([
      { path: `${OWNER}.childRolesLabel`, message: 'só é permitido com childRoles' },
    ]);
    const empty = v11Json((s) => {
      owner(s).childRoles = roles;
      owner(s).childRolesLabel = '';
    });
    expect(issuesOf(empty)).toEqual([
      { path: `${OWNER}.childRolesLabel`, message: 'não pode ser vazio' },
    ]);
  });

  it('papel sem name ou com propriedade a mais', () => {
    expect(issuesOf(v11Json((s) => (owner(s).childRoles = [{ id: 'a' }])))).toEqual([
      { path: `${OWNER}.childRoles[0].name`, message: 'obrigatório' },
    ]);
    expect(
      issuesOf(v11Json((s) => (owner(s).childRoles = [{ id: 'a', name: 'A', x: 1 }]))),
    ).toEqual([{ path: `${OWNER}.childRoles[0]`, message: 'Unrecognized key: "x"' }]);
  });
});

describe('formatVersion 11: doc em repositório externo', () => {
  const doc = (path: string) => ({ repo: 'design-docs', path });

  it('repo fora de docRepos (e sem docRepos)', () => {
    expect(issuesOf(withDoc({ repo: 'outro', path: 'a.md' }))).toEqual([
      {
        path: `${OWNER}.doc.repo`,
        message: 'repositório "outro" não declarado em docRepos',
      },
    ]);
    const none = v11Json((s) => (owner(s).doc = doc('a.md')));
    expect(issuesOf(none)).toEqual([
      {
        path: `${OWNER}.doc.repo`,
        message: 'repositório "design-docs" não declarado em docRepos',
      },
    ]);
  });

  it('path sem .md', () => {
    expect(issuesOf(withDoc(doc('components/button.txt')))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'extensão inválida: esperava .md' },
    ]);
  });

  it('path com #', () => {
    expect(issuesOf(withDoc(doc('components/button.md#topo')))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'não pode ter "#" (âncora)' },
    ]);
  });

  it('path com .. ou / no começo', () => {
    for (const path of ['../button.md', 'a/../button.md', '/components/button.md']) {
      expect(issuesOf(withDoc(doc(path))), path).toEqual([
        { path: `${OWNER}.doc.path`, message: BAD_PATH },
      ]);
    }
  });

  it('propriedade a mais, repo ou path ausente, tipo errado', () => {
    expect(issuesOf(withDoc({ ...doc('a.md'), x: 1 }))).toEqual([
      { path: `${OWNER}.doc`, message: 'propriedade desconhecida: "x"' },
    ]);
    expect(issuesOf(withDoc({ path: 'a.md' }))).toContainEqual({
      path: `${OWNER}.doc.repo`,
      message: 'obrigatório',
    });
    expect(issuesOf(withDoc({ repo: 'design-docs' }))).toEqual([
      { path: `${OWNER}.doc.path`, message: 'obrigatório' },
    ]);
    expect(issuesOf(withDoc(5))).toEqual([
      {
        path: `${OWNER}.doc`,
        message: 'deve ser texto (arquivo do pacote) ou um objeto { repo, path }',
      },
    ]);
  });

  it('o doc texto continua conferido como arquivo do pacote', () => {
    expect(issuesOf(withDoc('docs/button.txt'))).toEqual([
      { path: `${OWNER}.doc`, message: 'extensão inválida: esperava .md' },
    ]);
  });

  it('docRepos com id repetido e urlTemplate sem {path}', () => {
    const repos = (list: Json[]) => (s: Json) => (s.docRepos = list);
    expect(
      issuesOf(
        v11Json(
          repos([
            { id: 'd', url: 'https://x.com/a' },
            { id: 'd', url: 'https://x.com/b' },
          ]),
        ),
      ),
    ).toEqual([{ path: 'docRepos[1].id', message: 'id "d" repetido' }]);
    expect(
      issuesOf(
        v11Json(
          repos([{ id: 'd', url: 'https://x.com/a', urlTemplate: 'https://x.com/a' }]),
        ),
      ),
    ).toEqual([{ path: 'docRepos[0].urlTemplate', message: 'deve conter {path}' }]);
  });
});

describe('formatVersion 11: requiresOwner no conjunto resolvido', () => {
  const requires = (spec: Json) => (event(spec, 2).requiresOwner = true);
  const NOT_OWNED = {
    path: `${EVENTS}.annotationTypes[2].requiresOwner`,
    message: '"navigate" exige dono, mas nenhum tipo o lista em allowedChildren',
  };

  it('um dono que lista o tipo por cláusula atende', () => {
    expect(issuesOf(v11Json(requires))).toEqual([]);
    const byGroup = v11Json((s) => {
      requires(s);
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    });
    expect(issuesOf(byGroup)).toEqual([]);
  });

  it('erro quando nenhuma cláusula nem id cobre o tipo', () => {
    const spec = v11Json((s) => {
      requires(s);
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados'] }];
    });
    expect(issuesOf(spec)).toEqual([NOT_OWNED]);
  });

  it('erro quando ninguém lista nada; outro dono por id atende', () => {
    const none = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
    });
    expect(issuesOf(none)).toEqual([NOT_OWNED]);
    const other = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      s.layers[0].annotationTypes[1].allowedChildren = ['navigate'];
    });
    expect(issuesOf(other)).toEqual([]);
  });

  it('tipo que só lista a si mesmo como filho não satisfaz o próprio requiresOwner (CR #945, item 46)', () => {
    const self = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      event(s, 2).allowedChildren = ['navigate'];
    }, 15);
    expect(issuesOf(self)).toEqual([
      {
        path: NOT_OWNED.path,
        message:
          '"navigate" exige dono, mas nenhum outro tipo o aceita como filho (só ele mesmo o lista em allowedChildren)',
      },
    ]);
    const viaLayer = v11Json((s) => {
      requires(s);
      delete owner(s).allowedChildren;
      event(s, 2).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    }, 15);
    expect(issuesOf(viaLayer).map((i) => i.path)).toEqual([NOT_OWNED.path]);
  });
});

describe('chaves novas numa versão anterior à 11', () => {
  const ONLY = 'só é permitido com formatVersion 11';

  it('cláusula, groups, childRoles, childRolesLabel, docRepos e doc objeto dão erro no caminho exato', () => {
    for (const v of [4, 8, 10]) {
      const spec = v11Json((s) => {
        owner(s).allowedChildren = ['navigate', { layer: 'eventos' }];
        s.layers[0].annotationTypes[1].groups = ['x'];
        owner(s).childRoles = [{ id: 'a', name: 'A' }];
        owner(s).childRolesLabel = 'Trigger';
        s.layers[1].groups = [{ id: 'g', name: 'G' }];
        s.docRepos = [{ id: 'd', url: 'https://x.com/a' }];
        s.layers[0].annotationTypes[2].doc = { repo: 'd', path: 'a.md' };
      }, v);
      expect(issuesOf(spec), `v${v}`).toEqual(
        expect.arrayContaining([
          { path: `${OWNER}.allowedChildren[1]`, message: ONLY },
          { path: 'layers[0].annotationTypes[1].groups', message: ONLY },
          { path: `${OWNER}.childRoles`, message: ONLY },
          { path: `${OWNER}.childRolesLabel`, message: ONLY },
          { path: `${EVENTS}.groups`, message: ONLY },
          { path: 'docRepos', message: ONLY },
          { path: 'layers[0].annotationTypes[2].doc', message: ONLY },
        ]),
      );
      expect(issuesOf(spec).filter((i) => i.message === ONLY)).toHaveLength(7);
    }
  });

  it('doc texto vale da v4 em diante e continua erro da v4 antes dela', () => {
    expect(issuesOf(v11Json((s) => (owner(s).doc = 'docs/a.md'), 4))).toEqual([]);
    expect(issuesOf(v11Json((s) => (owner(s).doc = 'docs/a.md'), 3))).toEqual([
      { path: `${OWNER}.doc`, message: 'só é permitido com formatVersion 4' },
    ]);
  });

  it('parseSpec devolve a especialização v10 sem as chaves novas', () => {
    expect(parseSpec(v11Json(undefined, 10)).ok).toBe(true);
  });
});
