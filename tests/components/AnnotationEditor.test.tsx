import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTypedAnnotation, createMarking, type Project } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { sampleProject } from '../model/fixtures';
import { addChild, roleProject, withRoles } from '../model/roleFixtures';
import { cadastroProject, layerOf } from '../model/specFixtures';
import type { Json } from '../model/specV11Fixtures';
import { descriptionOf } from './describedBy';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(annotationId: string, project: Project = cadastroProject()) {
  const harness: Harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  const onShowLayer = vi.fn();
  renderLive(harness, (p) =>
    // Como no painel: excluída a anotação, o editor deixa de existir.
    p.annotations.some((a) => a.id === annotationId) ? (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={onGoToAnnotation}
        onShowLayer={onShowLayer}
        readOnly={harness.store.readOnly.value}
      />
    ) : null,
  );
  return { harness, onGoToAnnotation, onShowLayer, user: userEvent.setup() };
}

describe('AnnotationEditor — anotação livre', () => {
  it('mostra o nome e os pares da anotação', () => {
    setup('AU');
    expect(screen.getByLabelText('Nome da anotação')).toHaveProperty('value', 'User');
    const keys = screen
      .getAllByLabelText('Chave')
      .map((i) => (i as HTMLInputElement).value);
    const values = screen
      .getAllByLabelText('Valor')
      .map((i) => (i as HTMLInputElement).value);
    expect(keys).toEqual(['name', 'age']);
    expect(values).toEqual(['string', 'number']);
  });

  it('renomeia a anotação ao confirmar', async () => {
    const { harness, user } = setup('AU');
    const name = screen.getByLabelText('Nome da anotação');
    await user.clear(name);
    await user.type(name, 'Usuário{Enter}');
    expect(annotationOf(harness.project(), 'AU').name).toBe('Usuário');
  });

  it('edita o valor de um par pelo id da tupla', async () => {
    const { harness, user } = setup('AU');
    const [, second] = screen.getAllByLabelText('Valor');
    if (!second) throw new Error('sem segundo par');
    await user.clear(second);
    await user.type(second, 'integer{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => [e.id, e.key, e.value])).toEqual([
      ['EN', 'name', 'string'],
      ['EA', 'age', 'integer'],
    ]);
  });

  it('adiciona um par novo só depois de ter chave', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const keys = screen.getAllByLabelText('Chave');
    expect(keys).toHaveLength(3);
    const key = keys[2];
    if (!key) throw new Error('sem campo novo');
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);
    await user.type(key, 'email{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => e.key)).toEqual(['name', 'age', 'email']);
  });

  // Etapa 6 (6.4), achado 4: Enter na Chave de um par novo grava e leva ao Valor.
  it('Enter na chave de um par novo grava e põe o foco no valor', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const key = screen.getAllByLabelText('Chave')[2];
    if (!key) throw new Error('sem campo novo');
    await user.type(key, 'email{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
      'email',
    ]);
    expect(document.activeElement).toBe(screen.getAllByLabelText('Valor')[2]);
    await user.type(document.activeElement as HTMLElement, 'string{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries[2]?.value).toBe('string');
  });

  it('chave repetida mostra o erro e não grava', async () => {
    const { harness, user } = setup('AU');
    const [first] = screen.getAllByLabelText('Chave');
    if (!first) throw new Error('sem par');
    await user.clear(first);
    await user.type(first, 'age{Enter}');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('reordena os pares pelo menu ⋯ da linha', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: 'Ações do par name' }));
    await user.click(screen.getByRole('menuitem', { name: 'Descer par' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
      'EN',
    ]);
  });

  it('remove um par sem referências direto, sem confirmação', async () => {
    const { harness, user } = setup('AU');
    // EA tem a referência de AII; remove pelo par novo (sem referências).
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const key = screen.getAllByLabelText('Chave')[2];
    if (!key) throw new Error('sem campo novo');
    await user.type(key, 'tmp{Enter}');
    await user.click(screen.getByRole('button', { name: 'Ações do par tmp' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remover par' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('remover um par que é alvo de referência pede confirmação', async () => {
    const { harness, user } = setup('AU');
    const removeFirst = async () => {
      await user.click(screen.getByRole('button', { name: 'Ações do par name' }));
      await user.click(screen.getByRole('menuitem', { name: 'Remover par' }));
    };
    await removeFirst();
    // Etapa 8 (8.3), F10: confirmação destrutiva, anunciada como alerta.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Referências vão quebrar')).toBeTruthy();
    // Cancelar mantém o par.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);

    await removeFirst();
    const again = await screen.findByRole('alertdialog');
    await user.click(within(again).getByRole('button', { name: 'Excluir' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
    ]);
  });

  it('mostra quem referencia cada par e vai até a origem', async () => {
    const { onGoToAnnotation, user } = setup('AU');
    const backlink = screen.getAllByRole('button', { name: /^← / })[0];
    if (!backlink) throw new Error('sem backlink');
    await user.click(backlink);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AIN' });
  });

  it('somente leitura desabilita a edição', () => {
    const harness = createHarness(cadastroProject(), true);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AU')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly
      />
    ));
    expect(screen.getByLabelText('Nome da anotação')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '+ Par' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('AnnotationEditor — anotação tipada', () => {
  it('mostra os campos do tipo e grava o valor de um campo de texto', async () => {
    const { harness, user } = setup('AB');
    const id = screen.getByLabelText('id');
    expect(id).toHaveProperty('value', 'btn_cadastrar');
    await user.clear(id);
    await user.type(id, 'btn_enviar{Enter}');
    expect(annotationOf(harness.project(), 'AB').values?.['id']).toBe('btn_enviar');
  });

  it('campo obrigatório vazio aparece como pendência', async () => {
    setup('AT');
    expect(screen.getAllByTitle('obrigatório').length).toBeGreaterThan(0);
  });

  it('oferece vincular um filho pelo diálogo (não há botão "+ tipo" direto)', async () => {
    const { harness, user, onGoToAnnotation } = setup('AB');
    const before = harness.project().annotations.length;
    expect(screen.queryByRole('button', { name: /^\+ onChange|^\+ onClick/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ Vincular…' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: /^onChange|^onClick/, hidden: true }),
    );
    expect(harness.project().annotations.length).toBe(before + 1);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
  });

  it('excluir uma anotação que é alvo de referência pede confirmação', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: 'Excluir anotação' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(harness.project().annotations.some((a) => a.id === 'AU')).toBe(false);
  });
});

describe('AnnotationEditor — descrição do tipo', () => {
  /** O projeto da especialização com a descrição do tipo `button`. */
  function withTypeDescription(): Project {
    const p = cadastroProject();
    return {
      ...p,
      specializations: p.specializations.map((entry) => ({
        ...entry,
        spec: entry.spec && {
          ...entry.spec,
          layers: entry.spec.layers.map((layer) => ({
            ...layer,
            annotationTypes: layer.annotationTypes.map((type) =>
              type.id === 'button' ? { ...type, description: 'Aciona uma ação.' } : type,
            ),
          })),
        },
      })),
    };
  }

  it('é um ícone "Sobre {tipo}" ao lado do nome do tipo, fora de botão, sem texto fixo', () => {
    setup('AB', withTypeDescription());
    expect(document.querySelector('.typed-description')).toBeNull();
    const help = screen.getByRole('button', { name: 'Sobre Button' });
    expect(descriptionOf(help)).toBe('Aciona uma ação.');
    // Botão dentro de botão não pode.
    expect(help.parentElement?.closest('button')).toBeNull();
    expect(help.closest('.annotation-header')).not.toBeNull();
  });

  it('tipo sem descrição não tem o ícone', () => {
    setup('AB');
    expect(screen.queryByRole('button', { name: 'Sobre Button' })).toBeNull();
  });
});

describe('AnnotationEditor — "Vinculada a"', () => {
  const owner = () => screen.getByLabelText('Vinculada a') as HTMLSelectElement;

  it('o select leva o valor inteiro no title, para o corte ser desfeito ao passar o mouse', async () => {
    const { user } = setup('A1', sampleProject());
    expect(owner().title).toBe('');
    await user.selectOptions(owner(), 'A2');
    expect(owner().title).toBe('Vidros: tipo: trinca');
  });

  it('explica que só aparecem anotações da mesma marcação em outras camadas', () => {
    // A1 (M1, camada L1) pode pertencer a A2 (M1, camada L2).
    setup('A1', sampleProject());
    // A explicação é um ícone com dica; o texto fica como descrição do ícone e do campo.
    const help = screen.getByRole('button', { name: 'Sobre Vinculada a' });
    expect(descriptionOf(help)).toBe(t('annotation.ownerHelp'));
    expect(descriptionOf(owner())).toBe(t('annotation.ownerHelp'));
    expect(document.querySelector('.props-note')).toBeNull();
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
    expect(owner().disabled).toBe(false);
    const options = [...owner().options].map((o) => o.textContent);
    expect(options).toEqual(['Nenhuma', 'Vidros: tipo: trinca']);
  });

  it('sem nenhuma opção, sem dona e sem exigência: o campo não aparece', () => {
    // A3 é a única anotação de M2: não há outra camada com anotação para ser a dona.
    setup('A3', sampleProject());
    expect(screen.queryByLabelText('Vinculada a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sobre Vinculada a' })).toBeNull();
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
  });

  it('tipo que exige dona e sem opção: o campo aparece desabilitado com a mensagem', () => {
    let p = cadastroProject();
    p = createMarking(p, {
      id: 'MX',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 20, height: 20 },
      name: 'Solta',
    });
    p = addTypedAnnotation(p, {
      id: 'AY',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'button' },
      parentAnnotationId: null,
    });
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'eventos'),
      type: { specId: 'sdui', typeId: 'onClick' },
      parentAnnotationId: 'AY',
    });
    // Órfã, como após uma edição externa do arquivo: sem dona e sem quem possa sê-lo.
    p = {
      ...p,
      annotations: p.annotations
        .filter((a) => a.id !== 'AY')
        .map((a) => (a.id === 'AX' ? { ...a, parentAnnotationId: null } : a)),
    };
    setup('AX', p);
    expect(owner().disabled).toBe(true);
    expect(screen.getByText(t('annotation.ownerEmpty'))).toBeTruthy();
  });

  it('a anotação com dona continua mostrando o campo', () => {
    setup('AOC');
    expect(owner().value).toBe('AB');
  });

  it('o rótulo não tem title: a dica é o ícone de ajuda', () => {
    setup('A1', sampleProject());
    expect(screen.getByText('Vinculada a').getAttribute('title')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sobre Vinculada a' })).toBeTruthy();
  });

  it('com a lista vazia mas um dono já definido, o campo continua habilitado', async () => {
    const { harness, user } = setup('A1', sampleProject());
    await user.selectOptions(owner(), 'A2');
    expect(annotationOf(harness.project(), 'A1').parentAnnotationId).toBe('A2');
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
    // A2 passa a ter a A1 vinculada: nada para escolher, mas não é a lista vazia.
    expect(owner().disabled).toBe(false);
  });
});

describe('AnnotationEditor — papel no dono (decisão 20)', () => {
  const role = (label = 'Trigger') => screen.getByLabelText(label) as HTMLSelectElement;
  const edit = (s: Json) => {
    withRoles(s);
    // A `image` também aceita eventos, mas não oferece papéis.
    (s.layers[0].annotationTypes[1] as Json).allowedChildren = [{ layer: 'eventos' }];
  };
  const noLabel = (s: Json) => {
    withRoles(s);
    delete (s.layers[0].annotationTypes[0] as Json).childRolesLabel;
  };

  it('dono com papéis: o Select leva o rótulo do childRolesLabel e as opções do dono', () => {
    setup('E1', addChild(roleProject(withRoles), 'E1', 'A1', 'click'));
    expect(role().value).toBe('click');
    expect([...role().options].map((o) => [o.value, o.textContent])).toEqual([
      ['click', 'Clique'],
      ['hold', 'Pressionar'],
    ]);
    expect(screen.getByText('Trigger')).toBeTruthy();
  });

  it('sem childRolesLabel o rótulo é "Papel"', () => {
    setup('E1', addChild(roleProject(noLabel), 'E1', 'A1', 'click'));
    expect(role('Papel')).toBeTruthy();
  });

  it('dono sem papéis: o Select não aparece', () => {
    setup('E1', addChild(roleProject(), 'E1', 'A1', null));
    expect(screen.queryByLabelText('Trigger')).toBeNull();
    expect(screen.queryByLabelText('Papel')).toBeNull();
  });

  it('sem papel: "Escolha…" e a pendência', () => {
    setup('E1', addChild(roleProject(withRoles), 'E1', 'A1', null));
    expect(role().value).toBe('');
    expect(role().options[0]?.textContent).toBe('Escolha…');
    expect(role().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/sem Trigger \(escolha Clique ou Pressionar\)/)).toBeTruthy();
  });

  it('papel que o dono não oferece: pendência', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    setup('E1', {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E1' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    });
    expect(screen.getByText('Trigger que o dono não oferece')).toBeTruthy();
  });

  it('escolher grava o papel, numa só entrada de desfazer', async () => {
    const { harness, user } = setup(
      'E1',
      addChild(roleProject(withRoles), 'E1', 'A1', null),
    );
    await user.selectOptions(role(), 'hold');
    expect(annotationOf(harness.project(), 'E1').parentRole).toBe('hold');
    expect(screen.queryByText(/sem Trigger/)).toBeNull();
    act(() => {
      harness.store.undo();
    });
    expect(annotationOf(harness.project(), 'E1').parentRole).toBeNull();
  });

  it('trocar para um dono que não oferece o papel limpa o papel na mesma entrada', async () => {
    let p = addChild(roleProject(edit), 'E1', 'A1', 'hold');
    p = addTypedAnnotation(p, {
      id: 'IMG',
      markingId: 'M1',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'image' },
    });
    const { harness, user } = setup('E1', p);
    await user.selectOptions(screen.getByLabelText('Vinculada a'), 'IMG');
    const after = annotationOf(harness.project(), 'E1');
    expect(after.parentAnnotationId).toBe('IMG');
    expect(after.parentRole).toBeNull();
    expect(screen.queryByLabelText('Trigger')).toBeNull();
    act(() => {
      harness.store.undo();
    });
    const undone = annotationOf(harness.project(), 'E1');
    expect(undone.parentAnnotationId).toBe('A1');
    expect(undone.parentRole).toBe('hold');
  });
});
