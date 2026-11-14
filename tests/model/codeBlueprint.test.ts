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

/** Tree node by marking. */
function nodeOf(root: BlueprintNode, markingId: string): BlueprintNode {
  const found = findNode(root, markingId);
  if (!found) throw new Error(`marking ${markingId} outside the tree`);
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

/** Summarized shape of the tree: marking › annotations (type and symbol) › linked ones. */
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

/** `codeProject` with an icon inside the Cadastrar button (granddaughter of Formulário). */
function withIcon(): Project {
  let p = createMarking(codeProject(), {
    id: 'MCI',
    containerId: 'I1',
    rect: { x: 120, y: 720, width: 40, height: 40 },
    name: 'Icon',
  });
  p = addTypedAnnotation(p, {
    id: 'AIC',
    markingId: 'MCI',
    layerId: layerOf(p, 'sdui', 'componentes'),
    type: { specId: 'sdui', typeId: 'image' },
  });
  p = setFieldValue(p, 'AIC', 'id', 'img_seta');
  return setFieldValue(p, 'AIC', 'descricao', 'Arrow');
}

// pt-BR kept: the names, keys, values and notes asserted here (Formulário, Cadastrar, Componentes, Eventos, texto, estilo, ...) come from specFixtures / variantsFixtures (data of the fixtures)
describe('codeBlueprint', () => {
  it('mirrors the hierarchy of the marking and its descendants, with the linked ones under the owner', () => {
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
        // Free annotations (User) are left out; types without code come in with symbol null.
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
                  Icon: {
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

  it('parameters translated by values (enum), notes and mapping values', () => {
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
      // The id is not a parameter on Android, but the note asks for its value.
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
        // table: the mapping value, without the internal `_id`.
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

  it('ref resolved by the label of the target; empty becomes null', () => {
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

  it('ref as a parameter (bff does not pass dado; a type that does receives the label)', () => {
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
    // A value without a translation in `values` is passed as is (bff does not translate the type).
    expect(params.find((x) => x.key === 'tipo')?.value).toBe('email');
  });

  it('a type without code on the platform comes in with symbol null and only the type values', () => {
    const { root, repo } = codeBlueprint(codeProject(), 'MF', 'android');
    // `url` and `ref` come from the `repo` of the specialization; `localPath`, from the project override.
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
      targets: [],
    });
    // Classe (specialization v1, without platforms): no code, with the mapping values.
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
    // No annotation carries a reference to the generated code (the field left the format in stage 9).
    const ios = codeBlueprint(codeProject(), 'MF', 'ios').root.annotations.find(
      (a) => a.typeId === 'screen',
    );
    expect(Object.keys(ios ?? {})).not.toContain('codeRefs');
  });

  it('repo: only from the specialization, only from the local clone, from both or none', () => {
    const blueprint = (p: Project, platform: string) =>
      codeBlueprint(p, 'MF', platform).repo;
    const p = codeProject();
    // iOS: the specialization does not declare `repo` and the project has no clone.
    expect(blueprint(p, 'ios')).toBeNull();
    // Only the local clone.
    expect(blueprint(setPlatformRepo(p, 'ios', { localPath: '../ios' }), 'ios')).toEqual({
      url: null,
      ref: null,
      localPath: '../ios',
    });
    // Only the `repo` of the specialization (no clone), with `ref` absent.
    const onlyUrl = withSpecRepo(removePlatformRepo(p, 'android'), 'sdui', 'android', {
      url: 'https://git.internal/app',
    });
    expect(blueprint(onlyUrl, 'android')).toEqual({
      url: 'https://git.internal/app',
      ref: null,
      localPath: null,
    });
    // Two specializations: `url`/`ref` from the first one that declares `repo`.
    const second = applySpecialization(
      removeSpecialization(p, 'modelo-dados', 'convert'),
      {
        format: 'mapping-spec',
        formatVersion: 5,
        id: 'other',
        name: 'Other',
        version: 1,
        platforms: [
          { id: 'android', name: 'Android', repo: { url: 'https://gitlab.com/other' } },
        ],
        layers: [],
      },
      { newId: idGen('LX') },
    );
    expect(blueprint(second, 'android')?.url).toBe('https://github.com/org/app-android');
  });

  it('the path link comes from the repo of the specialization that owns the type, not from the project', () => {
    const p = codeProject();
    const android = nodeOf(codeBlueprint(p, 'MF', 'android').root, 'MC').annotations[0];
    expect(android?.pathUrl).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    // Without `urlTemplate` in the `repo`, no link, even with the local clone given.
    const noTemplate = withSpecRepo(p, 'sdui', 'android', {
      url: 'https://git.internal/app',
    });
    expect(
      nodeOf(codeBlueprint(noTemplate, 'MF', 'android').root, 'MC').annotations[0]
        ?.pathUrl,
    ).toBeNull();
  });

  it('the code path comes in the blueprint; without a platform repo in the specialization, no address', () => {
    const android = nodeOf(codeBlueprint(codeProject(), 'MF', 'android').root, 'MC')
      .annotations[0];
    expect(android?.path).toBe('app/src/main/java/com/app/ds/DSButton.kt');
    // OnClick has no path in the example.
    expect(android?.linked[0]).toMatchObject({ path: null, pathUrl: null });
    const ios = nodeOf(codeBlueprint(codeProject(), 'MF', 'ios').root, 'MC')
      .annotations[0];
    expect(ios).toMatchObject({
      path: 'App/DesignSystem/DSButton.swift',
      pathUrl: null,
    });
  });

  it('from an inner marking, only it and its descendants', () => {
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

  it('a nonexistent marking or an undeclared platform fail', () => {
    expect(codeOf(() => codeBlueprint(codeProject(), 'gone', 'android'))).toBe(
      'not-found',
    );
    expect(codeOf(() => codeBlueprint(codeProject(), 'MF', 'web'))).toBe(
      'unknown-platform',
    );
  });
});

describe('codeBlueprint with variants (formatVersion 9)', () => {
  const annotationOf = (blueprint: ReturnType<typeof codeBlueprint>, id: string) => {
    const found = blueprint.root.annotations.find((a) => a.annotationId === id);
    if (found) return found;
    for (const child of blueprint.root.children) {
      const inChild = child.annotations.find((a) => a.annotationId === id);
      if (inChild) return inChild;
    }
    throw new Error(`annotation ${id} outside the tree`);
  };

  const blueprintOf = (markingId: string) =>
    codeBlueprint(variantsProject(), markingId, 'compose');

  it('the default value (no value) uses the base; outlined returns the OutlinedButton', () => {
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

  it('the case swaps symbol, path and notes', () => {
    const text = annotationOf(blueprintOf('MBT'), 'BT');
    expect(text.symbol).toBe('androidx.compose.material3.TextButton');
    expect(text.path).toBe(TEXT_BUTTON_PATH);
    expect(text.pathUrl).toBe(
      `https://github.com/androidx/androidx/blob/main/${TEXT_BUTTON_PATH}`,
    );
    expect(text.notes).toBe('sem fundo');
  });

  it('the case params and values add to the base ones and translate the enum', () => {
    const tonal = annotationOf(blueprintOf('MBN'), 'BN');
    expect(tonal.symbol).toBe('androidx.compose.material3.FilledTonalButton');
    expect(tonal.params).toEqual([
      { key: 'label', name: 'text', value: 'Tonal' },
      // `size` is only in the case params; `large` is translated by the case values.
      { key: 'size', name: 'sizeHint', value: 'XL' },
    ]);
    // The mapping value stays the mapping one.
    expect(tonal.values).toMatchObject({ style: 'tonal', size: 'large' });
  });

  it('a type without variants does not change', () => {
    const card = annotationOf(blueprintOf('MCD'), 'CD');
    expect(card.symbol).toBe('androidx.compose.material3.Card');
    expect(card.params).toEqual([]);
  });
});
