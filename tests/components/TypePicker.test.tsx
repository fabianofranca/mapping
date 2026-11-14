import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecAnnotationType, SpecLayerGroup } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypePicker } from '../../src/ui/TypePicker';
import { noticeSpec } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const type = (id: string, name: string, groups?: string[]): SpecAnnotationType =>
  ({ id, name, fields: [], ...(groups ? { groups } : {}) }) as SpecAnnotationType;

const groups: SpecLayerGroup[] = [
  { id: 'nav', name: 'Navigation' },
  { id: 'data', name: 'Data' },
];
const types = [
  type('onClick', 'Click', ['nav']),
  type('track', 'Track', ['data']),
  type('misc', 'Misc'),
  type('action', 'Action', ['nav']),
];

describe('TypePicker', () => {
  it('focuses the search field on open, with the total in label and placeholder', () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    const field = screen.getByRole('searchbox', { name: 'Search among 4 types' });
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('placeholder')).toBe('Search among 4 types');
  });

  it('with a single type, the search field is singular (pt-BR and en-US)', () => {
    locale.value = 'pt-BR';
    const { unmount } = render(
      <TypePicker types={[types[0]!]} groups={groups} onChoose={vi.fn()} />,
    );
    // pt-BR kept: the singular of the pt-BR search label is the object of the test
    expect(screen.getByRole('searchbox', { name: 'Buscar entre 1 tipo' })).toBeTruthy();
    unmount();
    locale.value = 'en-US';
    render(<TypePicker types={[types[0]!]} groups={groups} onChoose={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: 'Search among 1 type' })).toBeTruthy();
  });

  it('group headings in order and "Other" last', () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Navigation', 'Data', 'Other']);
  });

  it('without groups, there are no headings', () => {
    render(<TypePicker types={types} onChoose={vi.fn()} />);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getAllByText(/./, { selector: 'strong' })).toHaveLength(4);
  });

  it('search without accents or case filters and hides the groups without results', async () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    await userEvent.setup().keyboard('ACTION');
    expect(screen.getByText('Action', { selector: 'strong' })).toBeTruthy();
    expect(screen.queryByText('Track', { selector: 'strong' })).toBeNull();
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Navigation']);
  });

  it('no result shows "No type matching"', async () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    await userEvent.setup().keyboard('zzz');
    expect(screen.getByText('No type matching "zzz"')).toBeTruthy();
  });

  it('choosing a type calls onChoose with it', async () => {
    const onChoose = vi.fn();
    render(<TypePicker types={types} groups={groups} onChoose={onChoose} />);
    await userEvent.setup().click(screen.getByText('Track', { selector: 'strong' }));
    expect(onChoose).toHaveBeenCalledWith(types[1]);
  });

  it('the notice badge stays on the item', () => {
    const notice = noticeSpec().layers[0]?.annotationTypes ?? [];
    render(<TypePicker types={notice} onChoose={vi.fn()} />);
    const option = screen
      .getByText('Gone', { selector: 'strong' })
      .closest('button') as HTMLElement;
    expect(within(option).getByRole('img')).toBeTruthy();
  });
});
