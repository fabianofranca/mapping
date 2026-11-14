import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { ContainerDirectionField } from '../../src/ui/ContainerDirectionField';
import { DiagnosticsView } from '../../src/ui/DiagnosticsView';
import { EditorContext } from '../../src/ui/EditorContext';
import { ProjectDirectionSettings } from '../../src/ui/ProjectDirectionSettings';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import {
  setContainerDirection,
  setProjectDirection,
  type Project,
} from '../../src/model';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Etapa "direção e âncora" (R2): a direção de leitura nos Detalhes do container, nas
// Configurações do projeto e no Diagnóstico.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);

const label = () => t('direction.label');
const select = () =>
  screen.getByLabelText<HTMLSelectElement>(label(), { selector: 'select' });

describe('Detalhes do container: direção', () => {
  function setup(project: Project = sampleProject(), disabled = false) {
    const harness = createHarness(project);
    renderLive(harness, (p) => {
      const image = p.containers[0];
      return image ? <ContainerDirectionField image={image} disabled={disabled} /> : null;
    });
    return { harness, user: userEvent.setup() };
  }

  it('aparece sempre, com "Segue o projeto" quando o container não fixa direção', () => {
    setup();
    expect(options(select())).toEqual([
      'Segue o projeto',
      'Da esquerda para a direita',
      'Da direita para a esquerda',
    ]);
    expect(select().value).toBe('');
  });

  it('mostra a direção fixada e troca pela action, numa entrada de desfazer', async () => {
    const { harness, user } = setup(setContainerDirection(sampleProject(), 'I1', 'rtl'));
    expect(select().value).toBe('rtl');
    await user.selectOptions(select(), 'ltr');
    // `ltr` explícito: continua gravado, só `null` volta a seguir o projeto.
    expect(harness.project().containers[0]?.direction).toBe('ltr');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers[0]?.direction).toBe('rtl');
  });

  it('"Segue o projeto" remove a direção fixada do container', async () => {
    const { harness, user } = setup(setContainerDirection(sampleProject(), 'I1', 'rtl'));
    await user.selectOptions(select(), '');
    expect(harness.project().containers[0]?.direction).toBeNull();
    expect(select().value).toBe('');
  });

  it('somente leitura desabilita; em en-US os textos vêm de t()', () => {
    setup(sampleProject(), true);
    expect(select().disabled).toBe(true);
    cleanup();
    locale.value = 'en-US';
    setup();
    expect(options(select())).toEqual([
      'Follows the project',
      'Left to right',
      'Right to left',
    ]);
  });

  it('o painel de Detalhes monta o campo', () => {
    const harness = createHarness(sampleProject());
    const image = harness.project().containers[0];
    if (!image) throw new Error('sem container');
    render(
      <EditorContext.Provider value={harness.context}>
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={false}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      </EditorContext.Provider>,
    );
    expect(select().value).toBe('');
  });
});

describe('Configurações: direção do projeto', () => {
  function setup(project: Project = sampleProject(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => (
      <ProjectDirectionSettings project={p} readOnly={readOnly} />
    ));
    return { harness, user: userEvent.setup() };
  }

  it('sem direção gravada vale ltr; trocar grava rtl pela action', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual([
      'Da esquerda para a direita',
      'Da direita para a esquerda',
    ]);
    expect(select().value).toBe('ltr');
    expect(harness.project().direction).toBeUndefined();
    await user.selectOptions(select(), 'rtl');
    expect(harness.project().direction).toBe('rtl');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().direction).toBeUndefined();
  });

  it('mostra a direção gravada e desabilita em somente leitura', () => {
    setup(setProjectDirection(sampleProject(), 'rtl'), true);
    expect(select().value).toBe('rtl');
    expect(select().disabled).toBe(true);
  });

  it('o título da seção existe nos dois idiomas', () => {
    setup();
    expect(screen.getByText('Direção de leitura', { selector: 'h3' })).toBeTruthy();
    cleanup();
    locale.value = 'en-US';
    setup();
    expect(screen.getByText('Reading direction', { selector: 'h3' })).toBeTruthy();
  });
});

describe('Diagnóstico: direção de leitura', () => {
  const region = () => screen.queryByRole('region', { name: t('diagnostics.direction') });
  function show(project: Project) {
    const harness = createHarness(project);
    render(
      <EditorContext.Provider value={harness.context}>
        <DiagnosticsView />
      </EditorContext.Provider>,
    );
  }

  it('em projeto todo ltr a seção não aparece', () => {
    show(sampleProject());
    expect(region()).toBeNull();
    cleanup();
    show(setProjectDirection(sampleProject(), 'ltr'));
    expect(region()).toBeNull();
  });

  it('com o projeto em rtl mostra a direção do projeto', () => {
    show(setProjectDirection(sampleProject(), 'rtl'));
    const section = region();
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText(
        t('diagnostics.directionProject', { direction: t('direction.rtl') }),
      ),
    ).toBeTruthy();
  });

  it('lista os containers que fixam uma direção diferente da do projeto', () => {
    let p = setContainerDirection(sampleProject(), 'I2', 'rtl');
    show(p);
    const section = within(region() as HTMLElement);
    expect(
      section.getByText(
        t('diagnostics.directionContainer', {
          name: 'images/frente.jpg',
          direction: t('direction.rtl'),
        }),
      ),
    ).toBeTruthy();
    // O que fixa a mesma direção do projeto não entra na lista.
    cleanup();
    p = setContainerDirection(setProjectDirection(p, 'rtl'), 'I1', 'rtl');
    show(p);
    expect(within(region() as HTMLElement).queryAllByRole('listitem')).toHaveLength(0);
  });
});
