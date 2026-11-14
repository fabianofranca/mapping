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

// CF6: the drawing mode in the Settings, in the container Details and in the Diagnostics.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);

describe('Settings: project drawing mode', () => {
  function setup(project = projectWithModes(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => <DrawingModeSettings project={p} readOnly={readOnly} />);
    return { harness, user: userEvent.setup() };
  }
  const select = () =>
    screen.getByLabelText<HTMLSelectElement>(t('drawingMode.label'), {
      selector: 'select',
    });

  it('lists the union of the declared modes and switches the mode through the action', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual(['Light', 'Dark']);
    expect(select().value).toBe('light');
    await user.selectOptions(select(), 'dark');
    expect(harness.project().drawingMode).toBe('dark');
    expect(select().value).toBe('dark');
  });

  it('a stored mode that no specialization declares appears marked', () => {
    setup({ ...projectWithModes(), drawingMode: 'solar' });
    expect(options(select())).toEqual([
      'Light',
      'Dark',
      t('drawingMode.undeclared', { mode: 'solar' }),
    ]);
    expect(select().value).toBe('solar');
  });

  it('with no declared or stored mode it shows nothing; read-only disables', () => {
    const { harness } = setup(sampleProject());
    expect(screen.queryByLabelText(t('drawingMode.label'))).toBeNull();
    expect(harness.project().drawingMode).toBeUndefined();
    cleanup();
    setup(projectWithModes(), true);
    expect(select().disabled).toBe(true);
  });

  it('in pt-BR the options also come from t(), with a capital initial (pt-BR)', () => {
    locale.value = 'pt-BR';
    setup();
    // pt-BR kept: the pt-BR option labels are the object of this test
    expect(options(select())).toEqual(['Claro', 'Escuro']);
  });

  it('the texts exist in both languages', () => {
    locale.value = 'pt-BR';
    setup();
    // pt-BR kept: the test checks the title in both languages
    expect(screen.getByText('Modo do desenho', { selector: 'h3' })).toBeTruthy();
    cleanup();
    locale.value = 'en-US';
    setup();
    expect(screen.getByText('Drawing mode', { selector: 'h3' })).toBeTruthy();
    // pt-BR kept: the English text must differ from the Portuguese one
    expect(t('drawingMode.followProject')).not.toBe('Seguir o projeto');
  });
});

describe('Container Details: drawing mode', () => {
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

  it('"Follow the project" is the first option; switching fixes the mode and going back removes it', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual([t('drawingMode.followProject'), 'Light', 'Dark']);
    expect(select().value).toBe('');
    await user.selectOptions(select(), 'dark');
    expect(harness.project().containers[0]?.drawingMode).toBe('dark');
    await user.selectOptions(select(), '');
    expect(harness.project().containers[0]?.drawingMode).toBeNull();
  });

  it('with no declared modes the field does not appear', () => {
    setup(sampleProject());
    expect(screen.queryByLabelText(t('drawingMode.label'))).toBeNull();
  });
});

describe('Diagnostics: drawing mode', () => {
  it('a stored, undeclared mode is warned about and stays stored', () => {
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

  it('with no undeclared mode the section does not appear', () => {
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
