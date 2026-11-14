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

// "Direction and anchor" stage (R2): the reading direction in the container Details, in the
// project Settings and in the Diagnostics.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option', { hidden: true })
    .map((o) => o.textContent);

const label = () => t('direction.label');
const select = () =>
  screen.getByLabelText<HTMLSelectElement>(label(), { selector: 'select' });

describe('Container Details: direction', () => {
  function setup(project: Project = sampleProject(), disabled = false) {
    const harness = createHarness(project);
    renderLive(harness, (p) => {
      const image = p.containers[0];
      return image ? <ContainerDirectionField image={image} disabled={disabled} /> : null;
    });
    return { harness, user: userEvent.setup() };
  }

  it('always appears, with "Follows the project" when the container pins no direction', () => {
    setup();
    expect(options(select())).toEqual([
      'Follows the project',
      'Left to right',
      'Right to left',
    ]);
    expect(select().value).toBe('');
  });

  it('shows the pinned direction and changes it through the action, in one undo entry', async () => {
    const { harness, user } = setup(setContainerDirection(sampleProject(), 'I1', 'rtl'));
    expect(select().value).toBe('rtl');
    await user.selectOptions(select(), 'ltr');
    // An explicit `ltr` stays saved, only `null` goes back to following the project.
    expect(harness.project().containers[0]?.direction).toBe('ltr');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().containers[0]?.direction).toBe('rtl');
  });

  it('"Follows the project" removes the pinned direction from the container', async () => {
    const { harness, user } = setup(setContainerDirection(sampleProject(), 'I1', 'rtl'));
    await user.selectOptions(select(), '');
    expect(harness.project().containers[0]?.direction).toBeNull();
    expect(select().value).toBe('');
  });

  it('read-only disables; in pt-BR the texts come from t()', () => {
    setup(sampleProject(), true);
    expect(select().disabled).toBe(true);
    cleanup();
    locale.value = 'pt-BR';
    setup();
    // pt-BR kept: the object of this half of the test is the Portuguese dictionary
    expect(options(select())).toEqual([
      'Segue o projeto',
      'Da esquerda para a direita',
      'Da direita para a esquerda',
    ]);
  });

  it('the Details panel mounts the field', () => {
    const harness = createHarness(sampleProject());
    const image = harness.project().containers[0];
    if (!image) throw new Error('no container');
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

describe('Settings: project direction', () => {
  function setup(project: Project = sampleProject(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => (
      <ProjectDirectionSettings project={p} readOnly={readOnly} />
    ));
    return { harness, user: userEvent.setup() };
  }

  it('with no saved direction ltr applies; changing saves rtl through the action', async () => {
    const { harness, user } = setup();
    expect(options(select())).toEqual(['Left to right', 'Right to left']);
    expect(select().value).toBe('ltr');
    expect(harness.project().direction).toBeUndefined();
    await user.selectOptions(select(), 'rtl');
    expect(harness.project().direction).toBe('rtl');
    expect(harness.store.undo()).toBe(true);
    expect(harness.project().direction).toBeUndefined();
  });

  it('shows the saved direction and disables in read-only', () => {
    setup(setProjectDirection(sampleProject(), 'rtl'), true);
    expect(select().value).toBe('rtl');
    expect(select().disabled).toBe(true);
  });

  it('the section title exists in both languages', () => {
    setup();
    expect(screen.getByText('Reading direction', { selector: 'h3' })).toBeTruthy();
    cleanup();
    locale.value = 'pt-BR';
    setup();
    // pt-BR kept: the object of this half of the test is the Portuguese title
    expect(screen.getByText('Direção de leitura', { selector: 'h3' })).toBeTruthy();
  });
});

describe('Diagnostics: reading direction', () => {
  const region = () => screen.queryByRole('region', { name: t('diagnostics.direction') });
  function show(project: Project) {
    const harness = createHarness(project);
    render(
      <EditorContext.Provider value={harness.context}>
        <DiagnosticsView />
      </EditorContext.Provider>,
    );
  }

  it('in an all-ltr project the section does not appear', () => {
    show(sampleProject());
    expect(region()).toBeNull();
    cleanup();
    show(setProjectDirection(sampleProject(), 'ltr'));
    expect(region()).toBeNull();
  });

  it('with the project in rtl shows the project direction', () => {
    show(setProjectDirection(sampleProject(), 'rtl'));
    const section = region();
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText(
        t('diagnostics.directionProject', { direction: t('direction.rtl') }),
      ),
    ).toBeTruthy();
  });

  it("lists the containers that pin a direction different from the project's", () => {
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
    // Whatever pins the same direction as the project is not in the list.
    cleanup();
    p = setContainerDirection(setProjectDirection(p, 'rtl'), 'I1', 'rtl');
    show(p);
    expect(within(region() as HTMLElement).queryAllByRole('listitem')).toHaveLength(0);
  });
});
