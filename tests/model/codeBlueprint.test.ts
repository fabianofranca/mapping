import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addTypedAnnotation,
  codeBlueprint,
  createMarking,
  setFieldValue,
  type BlueprintAnnotation,
  type BlueprintNode,
  type Project,
} from '../../src/model';
import {
  CADASTRO_SCREEN_KT,
  CADASTRO_VIEW_MODEL_KT,
  codeProject,
  layerOf,
} from './specFixtures';

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

/** Nó da árvore pela marcação. */
function nodeOf(root: BlueprintNode, markingId: string): BlueprintNode {
  const found = findNode(root, markingId);
  if (!found) throw new Error(`marcação ${markingId} fora da árvore`);
  return found;
}

function findNode(root: BlueprintNode, markingId: string): BlueprintNode | null {
  if (root.markingId === markingId) return root;
  for (const child of root.children) {
    const found = findNode(child, markingId);
    if (found) return found;
  }
  return null;
}

/** Forma resumida da árvore: marcação › anotações (tipo e símbolo) › vinculadas. */
function outline(node: BlueprintNode): unknown {
  const annotation = (a: BlueprintAnnotation): unknown => ({
    [`${a.type}:${a.symbol ?? '-'}`]: a.linked.map(annotation),
  });
  return {
    [node.name ?? node.markingId]: {
      annotations: node.annotations.map(annotation),
      children: node.children.map(outline),
    },
  };
}

/** `codeProject` com um ícone dentro do botão Cadastrar (neta do Formulário). */
function withIcon(): Project {
  let p = createMarking(codeProject(), {
    id: 'MCI',
    imageId: 'I1',
    rect: { x: 120, y: 720, width: 40, height: 40 },
    name: 'Ícone',
  });
  p = addTypedAnnotation(p, {
    id: 'AIC',
    markingId: 'MCI',
    layerId: layerOf(p, 'sdui', 'componentes'),
    type: { specId: 'sdui', typeId: 'image' },
  });
  p = setFieldValue(p, 'AIC', 'id', 'img_seta');
  return setFieldValue(p, 'AIC', 'descricao', 'Seta');
}

describe('codeBlueprint', () => {
  it('espelha a hierarquia da marcação e das descendentes, com as vinculadas sob a dona', () => {
    const blueprint = codeBlueprint(withIcon(), 'MF', 'android');
    expect(blueprint.platform).toEqual({
      id: 'android',
      name: 'Android',
      language: 'kotlin',
      specIds: ['sdui'],
    });
    expect(outline(blueprint.root)).toEqual({
      Formulário: {
        // Anotações livres (User) ficam de fora; tipos sem code entram com symbol null.
        annotations: [{ 'Classe:-': [] }, { 'Endpoint:-': [] }, { 'Screen:-': [] }],
        children: [
          {
            Nome: {
              annotations: [{ 'Input:com.app.ds.DSTextField': [] }],
              children: [],
            },
          },
          {
            Idade: {
              annotations: [{ 'Input:com.app.ds.DSTextField': [] }],
              children: [],
            },
          },
          {
            'E-mail': {
              annotations: [
                {
                  'Input:com.app.ds.DSTextField': [
                    { 'onChange:com.app.ds.OnChange': [] },
                  ],
                },
              ],
              children: [],
            },
          },
          {
            Cadastrar: {
              annotations: [
                {
                  'Button:com.app.ds.DSButton': [
                    { 'onClick:com.app.ds.OnClick': [] },
                    { 'onHold:com.app.ds.OnHold': [] },
                  ],
                },
              ],
              children: [
                {
                  Ícone: {
                    annotations: [{ 'Image:com.app.ds.DSImage': [] }],
                    children: [],
                  },
                },
              ],
            },
          },
        ],
      },
    });
    expect(nodeOf(blueprint.root, 'MCI').rect).toEqual({
      x: 120,
      y: 720,
      width: 40,
      height: 40,
    });
  });

  it('parâmetros traduzidos por values (enum), notes e valores do mapping', () => {
    const { root } = codeBlueprint(codeProject(), 'MF', 'android');
    const [button] = nodeOf(root, 'MC').annotations;
    expect(button).toMatchObject({
      annotationId: 'AB',
      specId: 'sdui',
      typeId: 'button',
      type: 'Button',
      label: null,
      layer: 'Componentes',
      symbol: 'com.app.ds.DSButton',
      notes: 'Use o modifier de testTag com o valor do campo id.',
      params: [
        { key: 'texto', name: 'text', value: 'Cadastrar' },
        { key: 'estilo', name: 'style', value: 'ButtonStyle.Primary' },
        { key: 'habilitado', name: 'enabled', value: 'true' },
      ],
      // O id não é parâmetro no Android, mas a nota pede o valor dele.
      values: {
        id: 'btn_cadastrar',
        texto: 'Cadastrar',
        estilo: 'primary',
        habilitado: 'sim',
      },
      codeRefs: [],
    });
    const [onClick, onHold] = button?.linked ?? [];
    expect(onClick).toMatchObject({
      annotationId: 'AOC',
      layer: 'Eventos',
      symbol: 'com.app.ds.OnClick',
      notes: 'Associe o evento ao componente dono por meio do parâmetro onClick.',
      params: [
        { key: 'acao', name: 'action', value: 'submit' },
        { key: 'destino', name: 'target', value: '/usuarios' },
        // table: o valor do mapping, sem o `_id` interno.
        {
          key: 'parametros',
          name: 'params',
          value: [{ nome: 'origem', valor: 'cadastro' }],
        },
      ],
    });
    expect(onHold).toMatchObject({
      symbol: 'com.app.ds.OnHold',
      params: [
        { key: 'acao', name: 'action', value: 'track' },
        { key: 'duracaoMs', name: 'durationMs', value: 500 },
      ],
    });
  });

  it('ref resolvido pelo rótulo do alvo; vazio vira null', () => {
    const { root } = codeBlueprint(codeProject(), 'MF', 'android');
    const input = (markingId: string) => nodeOf(root, markingId).annotations[0];
    expect(input('MN')?.values.dado).toBe('User.name');
    expect(input('MI')?.values.dado).toBe('User.age');
    expect(input('ME')?.values.dado).toBe('Contato.email');
    expect(input('MN')?.params).toEqual([
      { key: 'tipo', name: 'keyboardType', value: 'KeyboardType.Text' },
      { key: 'placeholder', name: 'placeholder', value: null },
      { key: 'obrigatorio', name: 'required', value: 'false' },
      { key: 'maxLength', name: 'maxLength', value: null },
    ]);
    expect(input('ME')?.params[0]).toEqual({
      key: 'tipo',
      name: 'keyboardType',
      value: 'KeyboardType.Email',
    });
  });

  it('ref como parâmetro (bff não passa dado; um tipo que passa recebe o rótulo)', () => {
    const p = codeProject();
    const custom: Project = {
      ...p,
      specializations: p.specializations.map((s) => {
        if (s.id !== 'sdui' || !s.spec) return s;
        const spec = structuredClone(s.spec);
        const input = spec.layers[0]?.annotationTypes.find((t) => t.id === 'input');
        const bff = input?.code?.bff;
        if (bff) bff.params = { ...bff.params, dado: 'binding' };
        return { ...s, spec };
      }),
    };
    const { root } = codeBlueprint(custom, 'MF', 'bff');
    const params = nodeOf(root, 'ME').annotations[0]?.params ?? [];
    expect(params.find((x) => x.key === 'dado')).toEqual({
      key: 'dado',
      name: 'binding',
      value: 'Contato.email',
    });
    // Valor sem tradução em `values` é passado como está (bff não traduz o tipo).
    expect(params.find((x) => x.key === 'tipo')?.value).toBe('email');
  });

  it('tipo sem code na plataforma entra com symbol null e os codeRef existentes da plataforma', () => {
    const { root, repo } = codeBlueprint(codeProject(), 'MF', 'android');
    expect(repo).toEqual({
      urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
      localPath: '../../..',
    });
    const screen = root.annotations.find((a) => a.typeId === 'screen');
    expect(screen).toEqual({
      annotationId: 'AS',
      specId: 'sdui',
      typeId: 'screen',
      type: 'Screen',
      label: 'Cadastro',
      layer: 'Telas',
      symbol: null,
      params: [],
      notes: null,
      values: { nome: 'Cadastro', rota: '/cadastro' },
      codeRefs: [
        {
          key: 'implementacao',
          entry: {
            _id: 'C1',
            platform: 'android',
            path: CADASTRO_SCREEN_KT,
            symbol: 'CadastroScreen',
            line: null,
          },
          url: `https://github.com/org/app-android/blob/main/${CADASTRO_SCREEN_KT}`,
        },
        {
          key: 'implementacao',
          entry: {
            _id: 'C2',
            platform: 'android',
            path: CADASTRO_VIEW_MODEL_KT,
            symbol: 'CadastroViewModel',
            line: 42,
          },
          url: `https://github.com/org/app-android/blob/main/${CADASTRO_VIEW_MODEL_KT}#L42`,
        },
      ],
      linked: [],
    });
    // Classe (especialização v1, sem plataformas): sem code, com os valores do mapping.
    const classe = root.annotations.find((a) => a.typeId === 'classe');
    expect(classe).toMatchObject({
      symbol: null,
      params: [],
      label: 'Contato',
      values: {
        nome: 'Contato',
        versao: 1,
        revisadoEm: '2026-10-02',
        atributos: [
          {
            nome: 'email',
            tipo: 'String',
            obrigatorio: 'sim',
            exemplo: 'ana@exemplo.com',
          },
        ],
      },
    });
    // No iOS, o Screen traz só a entrada iOS, sem link (sem repositório).
    const ios = codeBlueprint(codeProject(), 'MF', 'ios').root.annotations.find(
      (a) => a.typeId === 'screen',
    );
    expect(ios?.codeRefs.map((c) => [c.entry._id, c.url])).toEqual([['C3', null]]);
  });

  it('a partir de uma marcação interna, só ela e as descendentes', () => {
    const { root } = codeBlueprint(withIcon(), 'MC', 'ios');
    expect(root.markingId).toBe('MC');
    expect(root.children.map((c) => c.markingId)).toEqual(['MCI']);
    expect(root.annotations[0]).toMatchObject({
      symbol: 'DSButton',
      params: [
        { key: 'texto', name: 'title', value: 'Cadastrar' },
        { key: 'estilo', name: 'style', value: '.primary' },
        { key: 'habilitado', name: 'isEnabled', value: 'true' },
      ],
    });
  });

  it('marcação inexistente ou plataforma não declarada falham', () => {
    expect(codeOf(() => codeBlueprint(codeProject(), 'sumiu', 'android'))).toBe(
      'not-found',
    );
    expect(codeOf(() => codeBlueprint(codeProject(), 'MF', 'web'))).toBe(
      'unknown-platform',
    );
  });
});
