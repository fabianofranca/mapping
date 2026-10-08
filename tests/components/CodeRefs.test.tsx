import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeRefEntries, typeOfAnnotation, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationLines } from '../../src/ui/AnnotationSummary';
import { HelpDialog } from '../../src/ui/HelpDialog';
import { SettingsDialog } from '../../src/ui/SettingsDialog';
import { SpecsDialog } from '../../src/ui/SpecsDialog';
import { TypedField } from '../../src/ui/TypedFields';
import {
  CADASTRO_SCREEN_KT,
  CADASTRO_VIEW_MODEL_KT,
  CADASTRO_VIEW_SWIFT,
  codeProject,
} from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

// Etapa 3b.3: editor do `codeRef`, exibição na Lista, repositórios por plataforma nas
// Configurações, plataformas no diálogo de especializações e a Ajuda de uso.

beforeEach(() => {
  locale.value = 'pt-BR';
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

const ANDROID_URL = 'https://github.com/org/app-android/blob/main/{path}#L{line}';

function setupEditor(readOnly = false, project: Project = codeProject()) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AS');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === 'implementacao',
    );
    if (!field) throw new Error('sem o campo implementacao');
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={readOnly}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  const entries = () =>
    codeRefEntries(
      harness.project().annotations.find((a) => a.id === 'AS')?.values?.implementacao,
    );
  const items = () =>
    within(screen.getByRole('list', { name: 'implementação' })).getAllByRole('listitem');
  return { harness, entries, items, user: userEvent.setup() };
}

describe('editor do codeRef', () => {
  it('lista as entradas com o nome da plataforma, o arquivo e a contagem', () => {
    const { items } = setupEditor();
    expect(screen.getByText('3 entradas')).toBeTruthy();
    expect(
      items().map((li) => li.querySelector('.code-entry-name')?.textContent),
    ).toEqual([
      'Android · CadastroScreen.kt',
      'Android · CadastroViewModel.kt:42',
      'iOS · CadastroView.swift',
    ]);
  });

  it('altera caminho, símbolo e linha; cada alteração é um passo do desfazer', async () => {
    const { harness, entries, items, user } = setupEditor();
    const first = within(items()[0]!);
    const path = first.getByRole('textbox', { name: 'Caminho', exact: true });
    await user.clear(path);
    await user.type(path, 'app\\Novo.kt{Enter}');
    expect(entries()[0]?.path).toBe('app/Novo.kt');

    const line = first.getByRole('textbox', { name: 'Linha', exact: true });
    await user.type(line, '7{Enter}');
    expect(entries()[0]?.line).toBe(7);
    await user.clear(line);
    await user.keyboard('{Enter}');
    expect(entries()[0]?.line).toBeNull();

    const symbol = first.getByRole('textbox', { name: 'Símbolo', exact: true });
    await user.clear(symbol);
    await user.type(symbol, 'Novo{Enter}');
    expect(entries()[0]?.symbol).toBe('Novo');

    harness.store.undo();
    expect(entries()[0]?.symbol).toBe('CadastroScreen');
  });

  it('recusa linha inválida e caminho fora do formato, com a mensagem', async () => {
    const { entries, items, user } = setupEditor();
    const first = within(items()[0]!);
    await user.type(
      first.getByRole('textbox', { name: 'Linha', exact: true }),
      'abc{Enter}',
    );
    expect(
      first.getByText('A linha precisa ser um número inteiro a partir de 1.'),
    ).toBeTruthy();
    expect(entries()[0]?.line).toBeNull();

    const path = first.getByRole('textbox', { name: 'Caminho', exact: true });
    await user.clear(path);
    await user.type(path, '../fora.kt{Enter}');
    expect(first.getByText(/caminho relativo à raiz do repositório/)).toBeTruthy();
    expect(entries()[0]?.path).toBe(CADASTRO_SCREEN_KT);
  });

  it('troca a plataforma pelas permitidas do campo', async () => {
    const { entries, items, user } = setupEditor();
    const select = within(items()[0]!).getByRole('combobox', { name: 'Plataforma' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Android', 'iOS', 'Contrato SDUI']);
    await user.selectOptions(select, 'ios');
    expect(entries()[0]?.platform).toBe('ios');
  });

  it('adiciona (repetindo a plataforma da última), remove e reordena', async () => {
    const { entries, items, user } = setupEditor();
    await user.click(screen.getByRole('button', { name: '+ Entrada' }));
    expect(entries()).toHaveLength(4);
    expect(entries()[3]).toMatchObject({ platform: 'ios', path: null });
    // Sem caminho: pendência da entrada.
    await waitFor(() =>
      expect(items()[3]?.textContent).toContain('sem caminho do arquivo'),
    );

    await user.click(
      within(items()[3]!).getByRole('button', { name: /^Ações da entrada/ }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Subir entrada' }));
    expect(
      entries()
        .map((e) => e._id)
        .indexOf('C3'),
    ).toBe(3);
    expect(entries()[2]?.path).toBeNull();

    await user.click(
      within(items()[2]!).getByRole('button', { name: /^Ações da entrada/ }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Remover entrada' }));
    expect(entries().map((e) => e._id)).toEqual(['C1', 'C2', 'C3']);
  });

  it('"Abrir no repositório" é um link comum, só com repositório; com e sem linha', () => {
    const { items } = setupEditor();
    const [screenKt, viewModel, swift] = items();
    const open = (li: HTMLElement | undefined) =>
      within(li!).queryByRole('link', { name: /^Abrir no repositório/ });
    const link = open(screenKt);
    expect(link?.getAttribute('href')).toBe(
      `https://github.com/org/app-android/blob/main/${CADASTRO_SCREEN_KT}`,
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(open(viewModel)?.getAttribute('href')).toBe(
      `https://github.com/org/app-android/blob/main/${CADASTRO_VIEW_MODEL_KT}#L42`,
    );
    expect(open(swift)).toBeNull();
  });

  it('"Copiar caminho" grava o caminho na área de transferência e confirma', async () => {
    const { items, user } = setupEditor();
    await user.click(
      within(items()[2]!).getByRole('button', { name: /^Copiar caminho/ }),
    );
    expect(await navigator.clipboard.readText()).toBe(CADASTRO_VIEW_SWIFT);
    await waitFor(() =>
      expect(within(items()[2]!).getByRole('status').textContent).toBe('Caminho copiado'),
    );
  });

  it('plataforma não declarada: mantém a opção e mostra o motivo', () => {
    const base = codeProject();
    const project: Project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'AS'
          ? {
              ...a,
              values: {
                ...(a.values ?? {}),
                implementacao: [{ _id: 'W', platform: 'web', path: 'src/Web.ts' }],
              },
            }
          : a,
      ),
    };
    const { items } = setupEditor(false, project);
    const li = items()[0]!;
    expect(li.querySelector('.code-entry-name')?.textContent).toBe('web · Web.ts');
    expect(
      (within(li).getByRole('combobox', { name: 'Plataforma' }) as HTMLSelectElement)
        .value,
    ).toBe('web');
    expect(
      within(li).getByText('plataforma não declarada pela especialização'),
    ).toBeTruthy();
  });

  it('somente leitura: nada é editável', () => {
    setupEditor(true);
    expect(screen.getByRole('button', { name: '+ Entrada' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(
      screen
        .getAllByRole('textbox', { name: 'Caminho', exact: true })
        .every((i) => (i as HTMLInputElement).disabled),
    ).toBe(true);
  });
});

describe('Lista e herdadas (AnnotationLines)', () => {
  it('uma linha por entrada, com a dica do caminho completo e as ações', async () => {
    const harness = createHarness(codeProject());
    renderLive(harness, (p) => (
      <AnnotationLines
        project={p}
        annotation={annotationOf(p, 'AS')}
        lineClass="list-entry"
        keyClass="list-key"
      />
    ));
    expect(screen.getByText('Android · CadastroScreen.kt')).toBeTruthy();
    expect(screen.getByText('Android · CadastroViewModel.kt:42')).toBeTruthy();
    expect(screen.getByText('iOS · CadastroView.swift')).toBeTruthy();
    // O caminho completo (e a linha) está na dica.
    expect(
      screen.getByText(`${CADASTRO_VIEW_MODEL_KT}:42 · CadastroViewModel`),
    ).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Abrir no repositório/ })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole('button', { name: /^Copiar caminho/ })).toHaveLength(3);
  });
});

describe('Configurações: repositórios por plataforma', () => {
  function setupSettings(project: Project = codeProject(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => (
      <SettingsDialog
        project={p}
        readOnly={readOnly}
        onClose={() => undefined}
        onShowShortcuts={() => undefined}
      />
    ));
    return { harness, user: userEvent.setup() };
  }
  const group = (name: string) =>
    within(screen.getByRole('group', { name, hidden: true }));

  it('uma linha por plataforma declarada, com o aviso só de quem é usada sem repositório', () => {
    setupSettings();
    expect(
      screen
        .getAllByRole('group', { hidden: true })
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(expect.arrayContaining(['Android', 'iOS', 'Contrato SDUI']));
    expect(
      group('Android').getByLabelText('Endereço do arquivo', { selector: 'input' }),
    ).toHaveProperty('value', ANDROID_URL);
    expect(group('iOS').getByRole('status', { hidden: true }).textContent).toBe(
      'iOS sem repositório: 1 referência de código usa esta plataforma.',
    );
    expect(group('Android').queryByRole('status', { hidden: true })).toBeNull();
    expect(group('Contrato SDUI').queryByRole('status', { hidden: true })).toBeNull();
  });

  it('grava pelas actions, com os erros traduzidos, e limpa a configuração', async () => {
    const { harness, user } = setupSettings();
    const ios = group('iOS');
    const url = ios.getByLabelText('Endereço do arquivo', { selector: 'input' });
    await user.type(url, 'ftp://x/{{path}{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /http:\/\/ ou https:\/\//,
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();

    await user.type(url, 'https://git.exemplo/{{path}{Enter}');
    expect(harness.project().platformRepos.ios).toEqual({
      urlTemplate: 'https://git.exemplo/{path}',
      localPath: null,
    });
    // Agora o aviso some.
    await waitFor(() => expect(ios.queryByRole('status', { hidden: true })).toBeNull());

    const local = ios.getByLabelText('Caminho local da raiz', { selector: 'input' });
    await user.type(local, '/absoluto{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relativo à pasta do projeto/,
    );

    await user.click(
      ios.getByRole('button', { name: 'Limpar repositório de iOS', hidden: true }),
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();
    expect(
      (
        ios.getByLabelText('Endereço do arquivo', {
          selector: 'input',
        }) as HTMLInputElement
      ).value,
    ).toBe('');
    // Um passo de desfazer por ação.
    harness.store.undo();
    expect(harness.project().platformRepos.ios?.urlTemplate).toBe(
      'https://git.exemplo/{path}',
    );
  });

  it('sem plataformas (ou fora do editor) a seção não aparece', () => {
    const harness = createHarness({ ...codeProject(), specializations: [] });
    renderLive(harness, (p) => (
      <SettingsDialog
        project={p}
        onClose={() => undefined}
        onShowShortcuts={() => undefined}
      />
    ));
    expect(screen.queryByText('Repositórios de código')).toBeNull();
  });
});

describe('Especializações e Ajuda', () => {
  it('o diálogo mostra as plataformas de cada especialização: nome, id e linguagem', () => {
    const harness = createHarness(codeProject());
    renderLive(harness, (p) => (
      <SpecsDialog project={p} readOnly={false} onClose={() => undefined} />
    ));
    expect(screen.getByText('Android · android · kotlin')).toBeTruthy();
    expect(screen.getByText('iOS · ios · swift')).toBeTruthy();
    expect(screen.getByText('Contrato SDUI · bff · json')).toBeTruthy();
    // O Modelo de dados (v1) não declara plataformas: só uma lista.
    expect(screen.getAllByText('Plataformas')).toHaveLength(1);
  });

  it('a Ajuda tem a seção de uso das plataformas e do codeRef, nos dois idiomas', () => {
    for (const l of ['pt-BR', 'en-US'] as const) {
      locale.value = l;
      cleanup();
      renderLive(createHarness(codeProject()), () => (
        <HelpDialog onClose={() => undefined} />
      ));
      const section = document.getElementById('help-code-usage');
      expect(section, l).not.toBeNull();
      expect(section?.querySelectorAll('li').length, l).toBeGreaterThanOrEqual(5);
    }
  });
});
