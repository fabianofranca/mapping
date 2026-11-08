import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { DiagnosticsView } from '../../src/ui/DiagnosticsView';
import { DrawingModeSettings } from '../../src/ui/DrawingModeSettings';
import { EditorContext } from '../../src/ui/EditorContext';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { projectWithModes } from './drawingModeFixtures';
import { createHarness, renderLive } from './harness';

// CF6: o modo do desenho nas Configurações, nos Detalhes do container e no Diagnóstico.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);

describe('Configurações: modo do desenho do projeto', () => {
  function setup(project = projectWithModes(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => <DrawingModeSettings project={p} readOnly={readOnly} />);
    return { harness, user: userEvent.setup() };
  }
  const select = () =>
    screen.getByLabelText<HTMLSelectElement>(t('drawingMode.label'), {
      selector: 'select',
    });

  it('lista a união dos modos declarados e troca o modo pela action', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual(['light', 'dark']);
    expect(select().value).toBe('light');
    await user.selectOptions(select(), 'dark');
    expect(harness.project().drawingMode).toBe('dark');
    expect(select().value).toBe('dark');
  });

  it('modo gravado que nenhuma especialização declara aparece marcado', () => {
    setup({ ...projectWithModes(), drawingMode: 'solar' });
    expect(options(select())).toEqual([
      'light',
      'dark',
      t('drawingMode.undeclared', { mode: 'solar' }),
    ]);
    expect(select().value).toBe('solar');
  });

  it('sem modo declarado nem gravado não mostra nada; somente leitura desabilita', () => {
    const { harness } = setup(sampleProject());
    expect(screen.queryByLabelText(t('drawingMode.label'))).toBeNull();
    expect(harness.project().drawingMode).toBeUndefined();
    cleanup();
    setup(projectWithModes(), true);
    expect(select().disabled).toBe(true);
  });

  it('os textos existem nos dois idiomas', () => {
    setup();
    expect(screen.getByText('Modo do desenho', { selector: 'h3' })).toBeTruthy();
    cleanup();
    locale.value = 'en-US';
    setup();
    expect(screen.getByText('Drawing mode', { selector: 'h3' })).toBeTruthy();
    expect(t('drawingMode.followProject')).not.toBe('Seguir o projeto');
  });
});

describe('Detalhes do container: modo do desenho', () => {
  function setup(project = projectWithModes()) {
    const harness = createHarness(project);
    const id = harness.project().containers[0]?.id ?? '';
    renderLive(harness, (project) => {
      const image = project.containers[0];
      return image ? (
        <EditorContext.Provider value={harness.context}>
          <SelectionPanel
            image={image}
            display={undefined}
            readOnly={false}
            busy={false}
            onReplace={() => undefined}
            onDelete={() => undefined}
          />
        </EditorContext.Provider>
      ) : null;
    });
    return { harness, id, user: userEvent.setup() };
  }
  const select = () =>
    screen.getByLabelText<HTMLSelectElement>(t('drawingMode.label'), {
      selector: 'select',
    });

  it('"Seguir o projeto" é a primeira opção; trocar fixa o modo e voltar remove', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual([t('drawingMode.followProject'), 'light', 'dark']);
    expect(select().value).toBe('');
    await user.selectOptions(select(), 'dark');
    expect(harness.project().containers[0]?.drawingMode).toBe('dark');
    await user.selectOptions(select(), '');
    expect(harness.project().containers[0]?.drawingMode).toBeNull();
  });

  it('sem modos declarados o campo não aparece', () => {
    setup(sampleProject());
    expect(screen.queryByLabelText(t('drawingMode.label'))).toBeNull();
  });
});

describe('Diagnóstico: modo do desenho', () => {
  it('modo gravado e não declarado é avisado e continua gravado', () => {
    const harness = createHarness({ ...projectWithModes(), drawingMode: 'solar' });
    render(
      <EditorContext.Provider value={harness.context}>
        <DiagnosticsView />
      </EditorContext.Provider>,
    );
    const region = screen.getByRole('region', { name: t('diagnostics.drawingMode') });
    expect(
      within(region).getByText(t('diagnostics.modeUndeclared', { mode: 'solar' })),
    ).toBeTruthy();
    expect(t('diagnostics.modeUndeclared', { mode: 'solar' })).toContain('solar');
    expect(harness.project().drawingMode).toBe('solar');
  });

  it('sem modo não declarado a seção não aparece', () => {
    const harness = createHarness(projectWithModes());
    render(
      <EditorContext.Provider value={harness.context}>
        <DiagnosticsView />
      </EditorContext.Provider>,
    );
    expect(
      screen.queryByRole('region', { name: t('diagnostics.drawingMode') }),
    ).toBeNull();
  });
});
