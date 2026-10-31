import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addTypedAnnotation,
  applySpecialization,
  codeBlueprint,
  createMarking,
  removePlatformRepo,
  removeSpecialization,
  setFieldValue,
  setPlatformRepo,
  type BlueprintAnnotation,
  type BlueprintNode,
  type Project,
} from '../../src/model';
import { ANDROID_REPO, codeProject, idGen, layerOf, withSpecRepo } from './specFixtures';
import { BUTTON_PATH, TEXT_BUTTON_PATH, variantsProject } from './variantsFixtures';

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
    containerId: 'I1',
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
      repos: [{ specId: 'sdui', repo: ANDROID_REPO }],
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
      path: 'app/src/main/java/com/app/ds/DSButton.kt',
      pathUrl:
        'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
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

  it('tipo sem code na plataforma entra com symbol null e só os valores do tipo', () => {
    const { root, repo } = codeBlueprint(codeProject(), 'MF', 'android');
    // `url` e `ref` vêm do `repo` da especialização; `localPath`, da sobreposição do projeto.
    expect(repo).toEqual({
      url: 'https://github.com/org/app-android',
      ref: 'v1.2.0',
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
      path: null,
      pathUrl: null,
      params: [],
      notes: null,
      values: { nome: 'Cadastro', rota: '/cadastro' },
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
    // Nenhuma anotação traz referência ao código gerado (o campo saiu do formato na etapa 9).
    const ios = codeBlueprint(codeProject(), 'MF', 'ios').root.annotations.find(
      (a) => a.typeId === 'screen',
    );
    expect(Object.keys(ios ?? {})).not.toContain('codeRefs');
  });

  it('repo: só da especialização, só do clone local, dos dois ou nenhum', () => {
    const blueprint = (p: Project, platform: string) =>
      codeBlueprint(p, 'MF', platform).repo;
    const p = codeProject();
    // iOS: a especialização não declara `repo` e o projeto não tem clone.
    expect(blueprint(p, 'ios')).toBeNull();
    // Só o clone local.
    expect(blueprint(setPlatformRepo(p, 'ios', { localPath: '../ios' }), 'ios')).toEqual({
      url: null,
      ref: null,
      localPath: '../ios',
    });
    // Só o `repo` da especialização (sem clone), com `ref` ausente.
    const onlyUrl = withSpecRepo(removePlatformRepo(p, 'android'), 'sdui', 'android', {
      url: 'https://git.interno/app',
    });
    expect(blueprint(onlyUrl, 'android')).toEqual({
      url: 'https://git.interno/app',
      ref: null,
      localPath: null,
    });
    // Duas especializações: `url`/`ref` da primeira que declara `repo`.
    const second = applySpecialization(
      removeSpecialization(p, 'modelo-dados', 'convert'),
      {
        format: 'mapping-spec',
        formatVersion: 5,
        id: 'outra',
        name: 'Outra',
        version: 1,
        platforms: [
          { id: 'android', name: 'Android', repo: { url: 'https://gitlab.com/outra' } },
        ],
        layers: [],
      },
      { newId: idGen('LX') },
    );
    expect(blueprint(second, 'android')?.url).toBe('https://github.com/org/app-android');
  });

  it('o link do path vem do repo da especialização dona do tipo, não do projeto', () => {
    const p = codeProject();
    const android = nodeOf(codeBlueprint(p, 'MF', 'android').root, 'MC').annotations[0];
    expect(android?.pathUrl).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    // Sem `urlTemplate` no `repo`, sem link, mesmo com o clone local informado.
    const noTemplate = withSpecRepo(p, 'sdui', 'android', {
      url: 'https://git.interno/app',
    });
    expect(
      nodeOf(codeBlueprint(noTemplate, 'MF', 'android').root, 'MC').annotations[0]
        ?.pathUrl,
    ).toBeNull();
  });

  it('o path do code vem na planta; sem repo da plataforma na especialização, sem endereço', () => {
    const android = nodeOf(codeBlueprint(codeProject(), 'MF', 'android').root, 'MC')
      .annotations[0];
    expect(android?.path).toBe('app/src/main/java/com/app/ds/DSButton.kt');
    // O OnClick não tem path no exemplo.
    expect(android?.linked[0]).toMatchObject({ path: null, pathUrl: null });
    const ios = nodeOf(codeBlueprint(codeProject(), 'MF', 'ios').root, 'MC')
      .annotations[0];
    expect(ios).toMatchObject({
      path: 'App/DesignSystem/DSButton.swift',
      pathUrl: null,
    });
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

describe('codeBlueprint com variants (formatVersion 9)', () => {
  const annotationOf = (blueprint: ReturnType<typeof codeBlueprint>, id: string) => {
    const found = blueprint.root.annotations.find((a) => a.annotationId === id);
    if (found) return found;
    for (const child of blueprint.root.children) {
      const inChild = child.annotations.find((a) => a.annotationId === id);
      if (inChild) return inChild;
    }
    throw new Error(`anotação ${id} fora da árvore`);
  };

  const blueprintOf = (markingId: string) =>
    codeBlueprint(variantsProject(), markingId, 'compose');

  it('o valor padrão (sem valor) usa a base; outlined devolve o OutlinedButton', () => {
    const filled = annotationOf(blueprintOf('MBF'), 'BF');
    expect(filled.symbol).toBe('androidx.compose.material3.Button');
    expect(filled.path).toBe(BUTTON_PATH);
    expect(filled.notes).toBe('content = { Text(label) }');

    const outlined = annotationOf(blueprintOf('MBO'), 'BO');
    expect(outlined.symbol).toBe('androidx.compose.material3.OutlinedButton');
    expect(outlined.path).toBe(BUTTON_PATH);
    expect(outlined.pathUrl).toBe(
      `https://github.com/androidx/androidx/blob/main/${BUTTON_PATH}`,
    );
    expect(outlined.params).toEqual([{ key: 'label', name: 'text', value: 'Outlined' }]);
  });

  it('o caso troca symbol, path e notes', () => {
    const text = annotationOf(blueprintOf('MBT'), 'BT');
    expect(text.symbol).toBe('androidx.compose.material3.TextButton');
    expect(text.path).toBe(TEXT_BUTTON_PATH);
    expect(text.pathUrl).toBe(
      `https://github.com/androidx/androidx/blob/main/${TEXT_BUTTON_PATH}`,
    );
    expect(text.notes).toBe('sem fundo');
  });

  it('params e values do caso somam aos da base e traduzem o enum', () => {
    const tonal = annotationOf(blueprintOf('MBN'), 'BN');
    expect(tonal.symbol).toBe('androidx.compose.material3.FilledTonalButton');
    expect(tonal.params).toEqual([
      { key: 'label', name: 'text', value: 'Tonal' },
      // `size` só está nos params do caso; `large` é traduzido pelo values do caso.
      { key: 'size', name: 'sizeHint', value: 'XL' },
    ]);
    // O valor do mapping continua o do mapping.
    expect(tonal.values).toMatchObject({ style: 'tonal', size: 'large' });
  });

  it('o tipo sem variants não muda', () => {
    const card = annotationOf(blueprintOf('MCD'), 'CD');
    expect(card.symbol).toBe('androidx.compose.material3.Card');
    expect(card.params).toEqual([]);
  });
});
