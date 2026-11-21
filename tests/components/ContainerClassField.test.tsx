import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import {
  applySpecialization,
  setContainerClass,
  setContainerDensity,
  type Project,
  type Spec,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { ContainerClassField } from '../../src/ui/ContainerClassField';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Stage #1901, CX3 (decision 15): the container classes in the container Details.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 21,
  id: 'ds',
  name: 'DS',
  version: 1,
  layers: [],
  containerClasses: [
    {
      id: 'platform',
      name: 'Platform',
      classes: [
        { id: 'android', name: 'Android' },
        { id: 'ios', name: 'iOS' },
      ],
    },
    {
      id: 'window',
      name: 'Window',
      by: 'width',
      classes: [
        { id: 'compact', name: 'Compact', below: 600 },
        { id: 'expanded', name: 'Expanded' },
      ],
    },
    {
      id: 'tall',
      name: 'Height',
      by: 'height',
      classes: [
        { id: 'short', name: 'Short', below: 5000 },
        { id: 'long', name: 'Long' },
      ],
    },
  ],
};

function setup(project: Project, disabled = false) {
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const image = p.containers[0];
    return image ? <ContainerClassField image={image} disabled={disabled} /> : null;
  });
  return { harness, user: userEvent.setup() };
}

const withSets = () => applySpecialization(sampleProject(), SPEC);
const select = () =>
  screen.getByLabelText<HTMLSelectElement>('Platform', { selector: 'select' });

describe('ContainerClassField', () => {
  it('is hidden without declared sets', () => {
    setup(sampleProject());
    expect(screen.queryByText('Platform')).toBeNull();
    expect(document.body.textContent).not.toContain('Window');
  });

  it('a chosen set is a Select with None and the classes; choosing calls setContainerClass', async () => {
    const { harness, user } = setup(withSets());
    expect(
      within(select())
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent),
    ).toEqual([t('containerClass.none'), 'Android', 'iOS']);
    expect(select().value).toBe('');
    await user.selectOptions(select(), 'ios');
    expect(harness.project().containers[0]?.classes).toEqual({ platform: 'ios' });
    await user.selectOptions(select(), '');
    expect(harness.project().containers[0]?.classes).toBeUndefined();
  });

  it('shows the stored choice', () => {
    setup(setContainerClass(withSets(), 'I1', 'platform', 'android'));
    expect(select().value).toBe('android');
  });

  it('a computed set is a read-only line with the units, following the density', () => {
    const base = withSets();
    const width = base.containers[0]?.width ?? 0;
    const height = base.containers[0]?.height ?? 0;
    setup(setContainerDensity(base, 'I1', 8));
    expect(screen.queryByLabelText('Window', { selector: 'select' })).toBeNull();
    expect(
      screen.getByText(
        t('containerClass.byWidth', { class: 'Compact', units: width / 8 }),
        {
          exact: false,
        },
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        t('containerClass.byHeight', { class: 'Short', units: height / 8 }),
        {
          exact: false,
        },
      ),
    ).toBeTruthy();
  });

  it('read-only: the Select is disabled', () => {
    setup(withSets(), true);
    expect(select().disabled).toBe(true);
  });
});
