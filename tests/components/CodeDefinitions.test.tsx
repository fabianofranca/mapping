import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { AnnotationLines } from '../../src/ui/AnnotationSummary';
import { HelpDialog } from '../../src/ui/HelpDialog';
import { SettingsDialog } from '../../src/ui/SettingsDialog';
import { SpecsDialog } from '../../src/ui/SpecsDialog';
import { codeProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

// Etapas 3b.3 e 9: a linha "Definição" (o `path` do `code` do tipo) nos Detalhes, a Lista sem
// referência ao código gerado, os repositórios por plataforma nas Configurações (com o aviso
// pelo `path`), as plataformas no diálogo de especializações e a Ajuda de uso.

beforeEach(() => {
  locale.value = 'pt-BR';
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

const ANDROID_URL = 'https://github.com/org/app-android/blob/main/{path}#L{line}';

describe('Lista e herdadas (AnnotationLines)', () => {
  it('o Screen mostra só os campos do tipo, sem entradas de código nem ações', () => {
    const harness = createHarness(codeProject());
    renderLive(harness, (p) => (
      <AnnotationLines
        project={p}
        annotation={annotationOf(p, 'AS')}
        lineClass="list-entry"
        keyClass="list-key"
      />
    ));
    expect(
      Array.from(document.querySelectorAll('.list-entry')).map((l) => l.textContent),
    ).toEqual(['nome: Cadastro', 'rota: /cadastro']);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Detalhes: linha "Definição" do tipo (code.<plataforma>.path)', () => {
  function setupDetails(annotationId: string, readOnly = false) {
    const harness = createHarness(codeProject(), readOnly);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={readOnly}
      />
    ));
    const lines = () => Array.from(document.querySelectorAll('[data-definition]'));
    return { lines, user: userEvent.setup() };
  }

  it('uma linha por plataforma com path: "Plataforma · arquivo", com a dica do caminho e do símbolo', () => {
    const { lines } = setupDetails('AB');
    expect(screen.getByText('Definição')).toBeTruthy();
    expect(
      lines().map((l) => l.querySelector('.code-definition-name')?.textContent),
    ).toEqual(['Android · DSButton.kt', 'iOS · DSButton.swift']);
    // O bff do exemplo não tem path: sem linha.
    expect(document.querySelector('[data-definition="bff"]')).toBeNull();
    expect(
      screen.getByText('app/src/main/java/com/app/ds/DSButton.kt · com.app.ds.DSButton'),
    ).toBeTruthy();
  });

  it('"Abrir no repositório" só onde há repositório; "Copiar caminho" em todas', async () => {
    const { lines, user } = setupDetails('AB');
    const [android, ios] = lines() as HTMLElement[];
    const link = within(android!).getByRole('link', { name: /^Abrir no repositório/ });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // iOS não tem repositório: mostra o caminho e "Copiar caminho", sem link.
    expect(within(ios!).queryByRole('link')).toBeNull();
    await user.click(within(ios!).getByRole('button', { name: /^Copiar caminho/ }));
    expect(await navigator.clipboard.readText()).toBe('App/DesignSystem/DSButton.swift');
    await waitFor(() =>
      expect(within(ios!).getByRole('status').textContent).toBe('Caminho copiado'),
    );
  });

  it('também aparece com o projeto somente leitura (não há o que editar)', () => {
    const { lines } = setupDetails('AB', true);
    expect(lines()).toHaveLength(2);
  });

  it('tipo sem path (Screen, onClick) não tem a linha', () => {
    for (const id of ['AS', 'AOC']) {
      cleanup();
      const { lines } = setupDetails(id);
      expect(lines()).toHaveLength(0);
      expect(screen.queryByText('Definição')).toBeNull();
    }
  });

  it('em en-US o rótulo é "Definition"', () => {
    locale.value = 'en-US';
    setupDetails('AB');
    expect(screen.getByText('Definition')).toBeTruthy();
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

  it('uma linha por plataforma declarada, com o aviso só de quem tem arquivo de tipo sem repositório', () => {
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
      'iOS sem repositório: 1 tipo aponta um arquivo nesta plataforma.',
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

  it('a Ajuda tem a seção de uso das plataformas e do code, nos dois idiomas', () => {
    for (const l of ['pt-BR', 'en-US'] as const) {
      locale.value = l;
      cleanup();
      renderLive(createHarness(codeProject()), () => (
        <HelpDialog onClose={() => undefined} />
      ));
      const section = document.getElementById('help-code-usage');
      expect(section, l).not.toBeNull();
      expect(section?.querySelectorAll('li').length, l).toBe(4);
      expect(section?.textContent, l).not.toMatch(/codeRef/);
    }
  });
});
