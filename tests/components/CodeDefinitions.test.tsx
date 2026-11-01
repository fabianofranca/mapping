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
import { ANDROID_REPO, codeProject, withSpecRepo } from '../model/specFixtures';
import { variantsProject } from '../model/variantsFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

// Etapas 3b.3, 9 e Código de instanciação: a linha "Definição" (o `path` do `code` do tipo, com
// o link pelo `repo` da especialização) nos Detalhes, a Lista sem referência ao código gerado, o
// clone local por plataforma nas Configurações, as plataformas no diálogo de especializações e a
// Ajuda de uso.

// O exemplo SDUI pode renomear a plataforma `bff`: o nome vem da própria especialização.
const BFF = codeProject()
  .specializations.flatMap((s) => s.spec?.platforms ?? [])
  .find((platform) => platform.id === 'bff');
const BFF_NAME = BFF?.name ?? 'bff';
const BFF_LANGUAGE = BFF?.language ?? '';

beforeEach(() => {
  locale.value = 'pt-BR';
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

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
    ).toEqual(expect.arrayContaining(['Android · DSButton.kt', 'iOS · DSButton.swift']));
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

  it('o link vem só da especialização: sem nada em Configurações; sem urlTemplate só o caminho', () => {
    const base = codeProject();
    const project = { ...base, platformRepos: {} };
    const harness = createHarness(project);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AB')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    expect(
      screen.getByRole('link', { name: /^Abrir no repositório/ }).getAttribute('href'),
    ).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    cleanup();
    const noTemplate = withSpecRepo(project, 'sdui', 'android', {
      url: ANDROID_REPO.url,
    });
    renderLive(createHarness(noTemplate), (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AB')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Copiar caminho/ })).not.toHaveLength(
      0,
    );
  });

  it('também aparece com o projeto somente leitura (não há o que editar)', () => {
    const { lines } = setupDetails('AB', true);
    expect(lines().length).toBeGreaterThanOrEqual(2);
  });

  it('tipo sem path (Screen) não tem a linha', () => {
    for (const id of ['AS']) {
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

describe('Configurações: clone local por plataforma', () => {
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

  it('uma linha por plataforma declarada, só com o caminho local e sem aviso', () => {
    setupSettings();
    expect(
      screen
        .getAllByRole('group', { hidden: true })
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(expect.arrayContaining(['Android', 'iOS', BFF_NAME]));
    expect(
      group('Android').getByLabelText('Caminho local da raiz', { selector: 'input' }),
    ).toHaveProperty('value', '../../..');
    expect(
      group('iOS').getByLabelText('Caminho local da raiz', { selector: 'input' }),
    ).toHaveProperty('value', '');
    // O endereço vem da especialização: não há campo nem aviso de repositório ausente.
    expect(screen.queryByLabelText('Endereço do arquivo')).toBeNull();
    for (const name of ['Android', 'iOS', BFF_NAME]) {
      expect(group(name).queryByRole('status', { hidden: true })).toBeNull();
    }
  });

  it('grava pelas actions, com os erros traduzidos, e limpa a configuração', async () => {
    const { harness, user } = setupSettings();
    const ios = group('iOS');
    const local = ios.getByLabelText('Caminho local da raiz', { selector: 'input' });
    await user.type(local, '/absoluto{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relativo à pasta do projeto/,
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();

    await user.clear(local);
    await user.type(local, '../ios{Enter}');
    expect(harness.project().platformRepos.ios).toEqual({ localPath: '../ios' });
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();

    await user.click(
      ios.getByRole('button', { name: 'Limpar repositório de iOS', hidden: true }),
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();
    expect((local as HTMLInputElement).value).toBe('');
    // Um passo de desfazer por ação.
    harness.store.undo();
    expect(harness.project().platformRepos.ios?.localPath).toBe('../ios');
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
    expect(screen.getByText(`${BFF_NAME} · bff · ${BFF_LANGUAGE}`)).toBeTruthy();
    // O repo declarado aparece como link comum, com a ref (só o Android declara).
    const link = screen.getByRole('link', { name: ANDROID_REPO.url });
    expect(link.getAttribute('href')).toBe(ANDROID_REPO.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('referência v1.2.0')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
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

describe('Detalhes: a Definição pelo caso de variants (formatVersion 9)', () => {
  function definitionOf(annotationId: string) {
    const harness = createHarness(variantsProject());
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    return document.querySelector('[data-definition="compose"]') as HTMLElement;
  }

  it('o botão text mostra o arquivo do caso, com o link pelo repo', () => {
    const line = definitionOf('BT');
    expect(line.querySelector('.code-definition-name')?.textContent).toBe(
      'Compose · TextButton.kt',
    );
    expect(
      within(line)
        .getByRole('link', { name: /^Abrir no repositório/ })
        .getAttribute('href'),
    ).toBe(
      'https://github.com/androidx/androidx/blob/main/compose/material3/TextButton.kt',
    );
    expect(
      screen.getByText(
        'compose/material3/TextButton.kt · androidx.compose.material3.TextButton',
      ),
    ).toBeTruthy();
  });

  it('o outlined mostra o símbolo do caso sobre o arquivo da base; o filled, a base', () => {
    expect(definitionOf('BO').querySelector('.code-definition-name')?.textContent).toBe(
      'Compose · Button.kt',
    );
    expect(
      screen.getByText(
        'compose/material3/Button.kt · androidx.compose.material3.OutlinedButton',
      ),
    ).toBeTruthy();
    cleanup();
    definitionOf('BF');
    expect(
      screen.getByText('compose/material3/Button.kt · androidx.compose.material3.Button'),
    ).toBeTruthy();
  });
});
