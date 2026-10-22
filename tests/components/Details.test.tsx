import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { goToAnnotation } from '../../src/store/ui';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';
import { layerOf } from '../model/specFixtures';

// R5: Detalhes redesenhado (identidade, PropertyGrid, LayerGroup recolhível, pendências
// com links, KeyValueGrid com arrasto e teclado). Edição e desfazer iguais aos de antes.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function renderMarking(markingId: string, project: Project = cadastroProject()) {
  const harness = createHarness(project);
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === markingId);
    const image = p.containers.find((i) => i.id === marking?.containerId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => undefined}
        onSelectMarking={() => undefined}
        onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
      />
    );
  });
  return { harness, user: userEvent.setup() };
}

describe('Detalhes — marcação', () => {
  it('identidade: nome, onde está e o ID com copiar', async () => {
    const { user } = renderMarking('MN');
    expect(screen.getByText('Nome', { selector: '.identity-name' })).toBeTruthy();
    expect(screen.getByText('Em images/cadastro.png › Formulário')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copiar ID: MN' }));
    // O user-event troca a área de transferência por uma em memória.
    expect(await navigator.clipboard.readText()).toBe('MN');
    expect(screen.getByText('ID copiado.').getAttribute('role')).toBe('status');
  });

  it('seção Marcação: posição e tamanho em pares; recolhida, mostra o resumo', async () => {
    const { harness, user } = renderMarking('MT');
    const x = screen.getByLabelText('X');
    await user.clear(x);
    await user.type(x, '120{Enter}');
    expect(harness.project().markings.find((m) => m.id === 'MT')?.rect.x).toBe(120);
    expect(screen.getByLabelText('Largura')).toHaveProperty('value', '800');

    await user.click(screen.getByRole('button', { name: /^Marcação/ }));
    expect(screen.queryByLabelText('X')).toBeNull();
    expect(screen.getByText('X 120 · Y 50 · 800 × 100 px')).toBeTruthy();
    // Um passo de desfazer volta o X (recolher não entra no histórico).
    harness.store.undo();
    expect(harness.project().markings.find((m) => m.id === 'MT')?.rect.x).toBe(100);
  });

  // Devolução da 8.3 (segunda leitura, A1): depois de desfazer, o mesmo nome era engolido
  // pela guarda do Enter (o campo mostrava o texto e o projeto não mudava).
  it('nome: gravar, desfazer e redigitar o mesmo nome grava de novo com Enter', async () => {
    const { harness, user } = renderMarking('MN');
    const name = () => screen.getByLabelText<HTMLInputElement>('Nome');
    const stored = () => harness.project().markings.find((m) => m.id === 'MN')?.name;
    await user.clear(name());
    await user.type(name(), 'Novo nome{Enter}');
    expect(stored()).toBe('Novo nome');
    act(() => {
      harness.store.undo();
    });
    expect(stored()).toBe('Nome');
    expect(name().value).toBe('Nome');
    await user.clear(name());
    await user.type(name(), 'Novo nome{Enter}');
    expect(stored()).toBe('Novo nome');
    expect(document.activeElement).toBe(name());
  });

  it('pendências: cada motivo leva o foco ao campo', async () => {
    const { user } = renderMarking('MT');
    const notice = screen.getByText('Incompleta: 1 pendência').closest('.issues');
    if (!(notice instanceof HTMLElement)) throw new Error('sem aviso de pendências');
    const id = screen.getByLabelText('id');
    expect(id.getAttribute('aria-invalid')).toBe('true');
    await user.click(
      within(notice).getByRole('button', { name: /id: obrigatório vazio/ }),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(id));
  });

  it('LayerGroup recolhido resume a primeira anotação e não monta as anotações', async () => {
    const { user } = renderMarking('MF');
    const group = screen.getByRole('button', { name: /^Model/ });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Nome da anotação')).toBeTruthy();
    await user.click(group);
    expect(screen.queryByLabelText('Nome da anotação')).toBeNull();
    expect(group.textContent).toContain('User — name: string · age: number');
  });

  it('ir até uma anotação de uma camada recolhida abre a camada e foca a anotação', async () => {
    const { harness, user } = renderMarking('MF');
    await user.click(screen.getByRole('button', { name: /^Model/ }));
    expect(screen.queryByLabelText('Nome da anotação')).toBeNull();
    act(() => goToAnnotation(harness.ui, annotationOf(harness.project(), 'AU')));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Nome da anotação')),
    );
  });

  it('anotação recolhida mostra o resumo no lugar do corpo', async () => {
    const { user } = renderMarking('MF');
    await user.click(screen.getByRole('button', { name: 'Recolher User' }));
    expect(screen.queryAllByLabelText('Chave')).toHaveLength(0);
    expect(screen.getByText('User — name: string · age: number')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mostrar User' }));
    expect(screen.getAllByLabelText('Chave')).toHaveLength(2);
  });
});

function renderAnnotation(id: string): {
  harness: Harness;
  user: ReturnType<typeof userEvent.setup>;
} {
  const harness = createHarness(cadastroProject());
  renderLive(harness, (p) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, id)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={() => undefined}
      onShowLayer={() => undefined}
      readOnly={false}
    />
  ));
  return { harness, user: userEvent.setup() };
}

const keys = (h: Harness, id: string) =>
  annotationOf(h.project(), id).entries.map((e) => e.key);

describe('Detalhes — KeyValueGrid', () => {
  it('Alt+Shift+↓ move o par e o foco segue a linha', async () => {
    const { harness, user } = renderAnnotation('AU');
    const [first] = screen.getAllByLabelText('Chave');
    first?.focus();
    await user.keyboard('{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}');
    expect(keys(harness, 'AU')).toEqual(['age', 'name']);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Mover o par name' }),
      ),
    );
    // ↑ na alça devolve.
    await user.keyboard('{ArrowUp}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('Alt+Enter cria um par novo com o foco na chave', async () => {
    const { harness, user } = renderAnnotation('AU');
    screen.getAllByLabelText('Valor')[0]?.focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    const created = screen.getAllByLabelText('Chave')[2];
    await vi.waitFor(() => expect(document.activeElement).toBe(created));
    await user.keyboard('email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
  });

  it('arrastar pela alça reordena com uma única entrada de desfazer', () => {
    const { harness } = renderAnnotation('AU');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-drag-row]')];
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => new DOMRect(0, i * 30, 300, 30);
    });
    const grip = screen.getByRole('button', { name: 'Mover o par name' });
    fireEvent.pointerDown(grip, { button: 0, clientY: 15, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 40, pointerId: 1 });
    expect(rows[0]?.classList.contains('is-dragging')).toBe(true);
    fireEvent.pointerMove(grip, { clientY: 55, pointerId: 1 });
    expect(rows[1]?.getAttribute('data-drop')).toBe('after');
    fireEvent.pointerUp(grip, { clientY: 55, pointerId: 1 });
    expect(keys(harness, 'AU')).toEqual(['age', 'name']);
    harness.store.undo();
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('arrasto cancelado não muda nada', () => {
    const { harness } = renderAnnotation('AU');
    const grip = screen.getByRole('button', { name: 'Mover o par name' });
    fireEvent.pointerDown(grip, { button: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 500, pointerId: 1 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
  });

  it('Esc no par novo descarta a linha', async () => {
    const { user } = renderAnnotation('AU');
    await user.click(screen.getByRole('button', { name: '+ Par' }));
    const created = screen.getAllByLabelText('Chave')[2];
    await vi.waitFor(() => expect(document.activeElement).toBe(created));
    await user.keyboard('x{Escape}');
    expect(screen.getAllByLabelText('Chave')).toHaveLength(2);
    // Etapa 8 (8.3), F5: a linha descartada levava o foco; ele vai ao "+ Par".
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Par' })),
    );
  });

  // Etapa 8 (8.3), achado F5 (O5): Enter no Valor tirava o foco do campo (ia ao body).
  it('Enter no Valor grava e mantém o foco no campo', async () => {
    const { harness, user } = renderAnnotation('AU');
    const [value] = screen.getAllByLabelText('Valor');
    if (!value) throw new Error('sem o Valor');
    await user.clear(value);
    await user.type(value, 'text{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries[0]?.value).toBe('text');
    expect(document.activeElement).toBe(screen.getAllByLabelText('Valor')[0]);
  });

  // Devolução da 8.3 (segunda leitura, A1): a guarda do Enter dos pares nunca era zerada, e
  // o rascunho gravado voltava ao campo depois de desfazer. Redigitar o mesmo texto não
  // gravava.
  it('Valor: gravar, desfazer e redigitar o mesmo valor grava de novo com Enter', async () => {
    const { harness, user } = renderAnnotation('AU');
    const value = () => screen.getAllByLabelText<HTMLInputElement>('Valor')[0];
    const stored = () => annotationOf(harness.project(), 'AU').entries[0]?.value;
    await user.clear(value()!);
    await user.type(value()!, 'text{Enter}');
    expect(stored()).toBe('text');
    act(() => {
      harness.store.undo();
    });
    expect(stored()).toBe('string');
    // O campo acompanha o par gravado, não o rascunho de antes.
    expect(value()?.value).toBe('string');
    await user.clear(value()!);
    await user.type(value()!, 'text{Enter}');
    expect(stored()).toBe('text');
  });

  it('Chave: gravar, desfazer e redigitar a mesma chave grava de novo', async () => {
    const { harness, user } = renderAnnotation('AU');
    const key = () => screen.getAllByLabelText<HTMLInputElement>('Chave')[0];
    await user.clear(key()!);
    await user.type(key()!, 'nome{Enter}');
    expect(keys(harness, 'AU')).toEqual(['nome', 'age']);
    act(() => {
      harness.store.undo();
    });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
    expect(key()?.value).toBe('name');
    await user.clear(key()!);
    await user.type(key()!, 'nome{Enter}');
    expect(keys(harness, 'AU')).toEqual(['nome', 'age']);
  });

  // A linha é identificada pela posição: a que gravou o par novo vira o par gravado e, ao
  // desfazer a criação com outro par novo aberto, volta a ser o par novo (mesma instância).
  it('par novo: criar, desfazer com outro par novo aberto e recriar a mesma chave grava', async () => {
    const { harness, user } = renderAnnotation('AU');
    const addButton = () => screen.getByRole('button', { name: '+ Par' });
    await user.click(addButton());
    await user.type(screen.getAllByLabelText('Chave')[2]!, 'email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
    await user.click(addButton());
    expect(screen.getAllByLabelText('Chave')).toHaveLength(4);
    act(() => {
      harness.store.undo();
    });
    expect(keys(harness, 'AU')).toEqual(['name', 'age']);
    const created = screen.getAllByLabelText<HTMLInputElement>('Chave');
    expect(created).toHaveLength(3);
    // A linha nova começa vazia, não com o rascunho da criação desfeita.
    expect(created[2]?.value).toBe('');
    await user.type(created[2]!, 'email{Enter}');
    expect(keys(harness, 'AU')).toEqual(['name', 'age', 'email']);
  });
});

describe('Detalhes — DataGrid', () => {
  it('Alt+Enter na tabela cria uma linha', async () => {
    const { harness, user } = renderAnnotation('AC');
    screen.getByLabelText('exemplo (email)').focus();
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    const rows = annotationOf(harness.project(), 'AC').values?.['atributos'];
    expect(Array.isArray(rows) ? rows.length : 0).toBe(2);
  });

  it('linhas numeradas, com o nome da linha', () => {
    renderAnnotation('AC');
    const table = screen.getByRole('table', { name: 'atributos' });
    const [, row] = within(table).getAllByRole('row');
    expect(row?.textContent).toContain('1');
    expect(row?.textContent).toContain('email');
  });
});

// Etapa 8 (8.3), achado F3: o passo "tipo" troca pelo passo "dono" no mesmo slot; o diálogo
// novo guardava como "quem abriu" o botão do tipo, que já tinha saído, e o foco se perdia.
describe('Detalhes — nova anotação tipada com dono (F3)', () => {
  it('tipo › dono › Cancelar volta ao "+ Anotação"', async () => {
    const { harness, user } = renderMarking('MC');
    act(() => {
      harness.ui.activeLayer.value = layerOf(harness.project(), 'sdui', 'eventos');
    });
    // O "+ Anotação" do cabeçalho (o que o Alt+N aciona), não o de cada camada.
    const add = await vi.waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-action="add-annotation"]');
      if (!el) throw new Error('sem o "+ Anotação"');
      return el;
    });
    await user.click(add);
    const types = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el) throw new Error('sem o passo do tipo');
      return el;
    });
    await user.click(
      within(types).getByRole('button', { name: /^onClick/, hidden: true }),
    );
    const owner = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.textContent?.includes('Dono do')) throw new Error('sem o passo do dono');
      return el;
    });
    owner.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(add);
  });
});

/** Elementos que receberam o foco enquanto `run` roda (na ordem). */
async function focusTrail(run: () => Promise<void>): Promise<Element[]> {
  const focused: Element[] = [];
  const track = (e: FocusEvent) => focused.push(e.target as Element);
  document.addEventListener('focusin', track);
  try {
    await run();
  } finally {
    document.removeEventListener('focusin', track);
  }
  return focused;
}

// Etapa 8 (8.3), achado F2: "escolher e ir" (Ctrl+Enter no seletor) tinha dois donos do
// foco: o retorno do seletor (ao campo `dado`) e o painel (à anotação de destino), e o certo
// vencia só pela ordem das filas. Agora o painel é o dono e age no commit; o retorno do
// seletor vê o foco já no destino e não mexe. O foco vai direto, sem passar por outro lugar.
describe('Detalhes — escolher e ir até o alvo (F2)', () => {
  it('Ctrl+Enter no seletor leva o foco direto à anotação de destino', async () => {
    const harness = createHarness(cadastroProject());
    harness.ui.selection.value = { kind: 'marking', id: 'MN' };
    renderLive(harness, (p) => {
      const selection = harness.ui.selection.value;
      const marking = p.markings.find(
        (m) => selection?.kind === 'marking' && m.id === selection.id,
      );
      const image = p.containers.find((i) => i.id === marking?.containerId);
      if (!marking || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onSelectMarking={() => undefined}
          onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
        />
      );
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^dado: / }));
    await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.contains(document.activeElement)) throw new Error('o seletor não abriu');
    });
    let target: Element | null = null;
    const trail = await focusTrail(async () => {
      // Abre no atual (User.name); ↓ vai para User.age, da anotação User no Formulário.
      await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
      await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
      const name = await screen.findByLabelText('Nome da anotação');
      target = name;
      await vi.waitFor(() => expect(document.activeElement).toBe(name));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(trail).toEqual([target]);
  });
});
