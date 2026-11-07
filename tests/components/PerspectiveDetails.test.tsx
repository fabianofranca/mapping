import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createArrow, type Arrival, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { libraryHarness } from './libraryHarness';
import { viewOf } from '../store/perspectiveHarness';
import { createHarness, renderLive, type Harness } from './harness';

// Detalhes com perspectivas (etapa #659, PE3, frente C2): a seção Perspectivas, o aviso da marca
// "Veio de…", o selo "fora desta perspectiva" em Ligado por seta e o "só na Principal" de Arrumar
// e Excluir. Mundo: I1 (com M1 › M2 › M3) e I2 (com M4) são as raízes; a perspectiva V mostra só
// I1; a W mostra só I2.

beforeEach(() => {
  locale.value = 'pt-BR';
  // A perspectiva aberta fica guardada por projeto neste navegador: cada teste começa na Principal.
  localStorage.clear();
});
afterEach(cleanup);

function world(arrivals: readonly Arrival[] = []): Project {
  const base = sampleProject();
  const v = viewOf(base, { id: 'V', root: 'I1', at: { x: 0, y: 0 } });
  const w = {
    ...viewOf(base, { id: 'W', root: 'I2', at: { x: 0, y: 0 } }),
    name: 'Outra',
  };
  return {
    ...createArrow(base, { id: 'R1', from: 'M1', to: 'M4' }),
    perspectives: [{ ...v, name: 'Vista' }, w],
    arrivals,
  };
}

function panels(harness: Harness, which: { marking?: string; image?: string }) {
  renderLive(harness, (p) => {
    if (which.image) {
      const image = p.containers.find((c) => c.id === which.image)!;
      return (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={harness.store.locked.value}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      );
    }
    const marking = p.markings.find((m) => m.id === which.marking)!;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={p.containers.find((c) => c.id === marking.containerId) ?? null}
        readOnly={harness.store.locked.value}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const section = () => screen.queryByRole('region', { name: t('perspective.section') });
const open = (h: Harness, id: string | null) => {
  expect(h.context.session.perspective.open(id)).toBe(true);
};

describe('Detalhes — seção Perspectivas', () => {
  it('lista a Principal e as perspectivas em que a raiz aparece', () => {
    const h = createHarness(world());
    panels(h, { image: 'I1' });
    const body = within(section()!);
    expect(body.getByText(t('perspective.principal'))).toBeTruthy();
    expect(body.getByText('Vista')).toBeTruthy();
    expect(body.queryByText('Outra')).toBeNull();
  });

  it('item que não é raiz mostra onde a raiz dele aparece', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M3' });
    expect(within(section()!).getByText('Vista')).toBeTruthy();
  });

  it('Enviar para perspectiva… envia a raiz; marcada, tira', async () => {
    const h = createHarness(world());
    const user = panels(h, { image: 'I1' });
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    await user.click(screen.getByRole('menuitem', { name: /Outra/ }));
    expect(
      h
        .project()
        .perspectives.find((x) => x.id === 'W')
        ?.items.some((i) => i.root === 'I1'),
    ).toBe(true);
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    await user.click(screen.getByRole('menuitem', { name: /Vista/ }));
    expect(
      h
        .project()
        .perspectives.find((x) => x.id === 'V')
        ?.items.some((i) => i.root === 'I1'),
    ).toBe(false);
  });

  it('a Principal e a perspectiva aberta ficam travadas no menu', async () => {
    const h = createHarness(world());
    open(h, 'V');
    const user = panels(h, { image: 'I1' });
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    const principal = screen.getByRole('menuitem', {
      name: new RegExp(t('perspective.principal')),
    });
    expect((principal as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('menuitem', { name: /Vista/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('somente leitura: o botão Enviar fica desabilitado', () => {
    const h = createHarness(world(), true);
    panels(h, { image: 'I1' });
    const button = within(section()!).getByRole('button', {
      name: t('perspective.section.send'),
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Detalhes — aviso "Veio de…"', () => {
  const arrival = (root: string, fromName = 'Analytics'): Arrival => ({
    root,
    from: 'W',
    fromName,
  });
  const notice = () => screen.queryByText(/Veio de Analytics\./);

  it('sem info de sessão (depois de recarregar): só "Veio de X."', () => {
    const h = createHarness(world([arrival('I1')]));
    panels(h, { image: 'I1' });
    expect(notice()).toBeTruthy();
    expect(screen.queryByText(/Sem referência/)).toBeNull();
    expect(screen.queryByText(/estava ocupado/)).toBeNull();
  });

  it.each([
    ['near', 'I2', 'Ficou perto de images/frente.jpg, na mesma distância.'],
    [
      'occupied',
      'I2',
      'Ao lado de images/frente.jpg estava ocupado; ficou no espaço livre mais próximo.',
    ],
    ['arrival-area', null, 'Sem referência; foi para a área de chegada.'],
  ] as const)('explica o caso %s', (kind, referenceId, text) => {
    const h = createHarness(world([arrival('I1')]));
    h.context.session.perspective.arrivals.value = [
      { root: 'I1', from: 'W', kind, referenceId },
    ];
    panels(h, { image: 'I1' });
    expect(notice()).toBeTruthy();
    expect(document.body.textContent).toContain(text);
  });

  it('Dispensar tira a marca do projeto', async () => {
    const h = createHarness(world([arrival('I1'), arrival('I2')]));
    const user = panels(h, { image: 'I1' });
    await user.click(
      screen.getByRole('button', { name: t('perspective.arrival.dismiss') }),
    );
    expect(h.project().arrivals.map((a) => a.root)).toEqual(['I2']);
    expect(notice()).toBeNull();
  });

  it('Próximo que veio (N) seleciona a próxima raiz com marca, em círculo', async () => {
    const h = createHarness(world([arrival('I1'), arrival('I2')]));
    const user = panels(h, { image: 'I1' });
    const next = screen.getByRole('button', {
      name: t('perspective.arrival.next', { count: 2 }),
    });
    await user.click(next);
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });

  it('não aparece fora da Principal', () => {
    const h = createHarness(world([arrival('I1')]));
    open(h, 'V');
    panels(h, { image: 'I1' });
    expect(notice()).toBeNull();
  });

  it('item sem marca não mostra o aviso', () => {
    const h = createHarness(world([arrival('I2')]));
    panels(h, { image: 'I1' });
    expect(notice()).toBeNull();
  });
});

describe('Detalhes — Ligado por seta fora da perspectiva', () => {
  const outside = () => t('perspective.arrow.outside');

  it('com perspectiva aberta, a outra ponta fora dela ganha o selo', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { marking: 'M1' });
    expect(screen.getByText(outside())).toBeTruthy();
  });

  it('na Principal, sem selo', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M1' });
    expect(screen.queryByText(outside())).toBeNull();
  });

  it('outra ponta na mesma raiz (dentro da perspectiva): sem selo', () => {
    const base = world();
    const h = createHarness(createArrow(base, { id: 'R2', from: 'M1', to: 'M2' }));
    open(h, 'V');
    panels(h, { marking: 'M1' });
    // Só a seta para M4 (fora de V) leva o selo; a para M2 (mesma raiz) não.
    expect(screen.getAllByText(outside())).toHaveLength(1);
  });
});

describe('Detalhes — só na Principal', () => {
  /** Uma coluna com dois botões na I1 (Arrumar existe) e a perspectiva V mostrando a I1. */
  async function arrangeable() {
    const h = await libraryHarness();
    const add = (typeId: string, parentId: string | null) => {
      const result = h.actions.addComponent({
        containerId: 'I1',
        parentId,
        specId: 'material3',
        typeId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const column = add('m3-column', null);
    add('m3-button', column);
    const applied = h.store.apply((p) => ({
      ...p,
      perspectives: [viewOf(p, { id: 'V', root: 'I1', at: { x: 0, y: 0 } })],
    }));
    expect(applied).toEqual({ ok: true, value: undefined });
    renderLive(h, (project) => {
      const marking = project.markings.find((m) => m.id === column)!;
      return (
        <MarkingPanel
          project={project}
          marking={marking}
          image={project.containers.find((i) => i.id === marking.containerId) ?? null}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    return h;
  }

  it('na Principal, Arrumar vale', async () => {
    await arrangeable();
    const arrange = screen.getByRole('button', { name: t('arrange.action') });
    expect((arrange as HTMLButtonElement).disabled).toBe(false);
  });

  it('numa perspectiva, Arrumar fica desabilitado com a dica', async () => {
    const h = await arrangeable();
    open(h, 'V');
    const arrange = screen.getByRole('button', { name: t('arrange.action') });
    expect((arrange as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain(t('perspective.principalOnly'));
  });

  it('na Principal, Excluir uma marcação vale', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M1' });
    const del = screen.getByRole('button', { name: t('marking.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(false);
  });

  it('numa perspectiva, excluir um container raiz fica desabilitado com a dica', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { image: 'I1' });
    const del = screen.getByRole('button', { name: t('image.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    expect(del.getAttribute('title')).toBe(t('perspective.principalOnly'));
  });

  it('numa perspectiva, excluir marcação que não é raiz continua valendo', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { marking: 'M3' });
    const del = screen.getByRole('button', { name: t('marking.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(false);
  });
});
