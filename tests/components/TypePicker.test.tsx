import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecAnnotationType, SpecLayerGroup } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypePicker } from '../../src/ui/TypePicker';
import { noticeSpec } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const type = (id: string, name: string, groups?: string[]): SpecAnnotationType =>
  ({ id, name, fields: [], ...(groups ? { groups } : {}) }) as SpecAnnotationType;

const groups: SpecLayerGroup[] = [
  { id: 'nav', name: 'Navegação' },
  { id: 'dados', name: 'Dados' },
];
const types = [
  type('onClick', 'Clique', ['nav']),
  type('track', 'Rastrear', ['dados']),
  type('misc', 'Variado'),
  type('acao', 'Ação', ['nav']),
];

describe('TypePicker', () => {
  it('foca o campo de busca ao abrir, com rótulo e placeholder do total', () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    const field = screen.getByRole('searchbox', { name: 'Buscar entre 4 tipos' });
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('placeholder')).toBe('Buscar entre 4 tipos');
  });

  it('cabeçalhos de grupo na ordem e "Outros" no fim', () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Navegação', 'Dados', 'Outros']);
  });

  it('sem grupos, não há cabeçalhos', () => {
    render(<TypePicker types={types} onChoose={vi.fn()} />);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getAllByText(/./, { selector: 'strong' })).toHaveLength(4);
  });

  it('busca sem acento e sem caixa filtra e esconde os grupos sem resultado', async () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    await userEvent.setup().keyboard('ACAO');
    expect(screen.getByText('Ação', { selector: 'strong' })).toBeTruthy();
    expect(screen.queryByText('Rastrear', { selector: 'strong' })).toBeNull();
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(['Navegação']);
  });

  it('sem resultado mostra "Nenhum tipo com"', async () => {
    render(<TypePicker types={types} groups={groups} onChoose={vi.fn()} />);
    await userEvent.setup().keyboard('zzz');
    expect(screen.getByText('Nenhum tipo com "zzz"')).toBeTruthy();
  });

  it('escolher um tipo chama onChoose com ele', async () => {
    const onChoose = vi.fn();
    render(<TypePicker types={types} groups={groups} onChoose={onChoose} />);
    await userEvent.setup().click(screen.getByText('Rastrear', { selector: 'strong' }));
    expect(onChoose).toHaveBeenCalledWith(types[1]);
  });

  it('o selo de aviso continua no item', () => {
    const notice = noticeSpec().layers[0]?.annotationTypes ?? [];
    render(<TypePicker types={notice} onChoose={vi.fn()} />);
    const option = screen
      .getByText('Gone', { selector: 'strong' })
      .closest('button') as HTMLElement;
    expect(within(option).getByRole('img')).toBeTruthy();
  });
});
