import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { createMarking } from '../../src/model';
import { selectItems } from '../../src/store/ui';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Etapa #1425: depois do Envolver (⋯ da Árvore) e do Mover para a frente, o foco nunca vai ao
// `body`: volta ao controle de origem ou, se ele sumiu, ao contêiner mais próximo da app.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function renderTree(harness: Harness) {
  renderLive(harness, (p) => (
    // Como na app: a Árvore mora numa janela de ferramenta (`section[data-window]`).
    <section data-window="tree" tabIndex={-1}>
      <MarkingTree project={p} selection={null} onSelect={() => undefined} />
    </section>
  ));
}

describe('foco depois do Envolver pelo ⋯ da Árvore', () => {
  it('o foco não vai ao body', async () => {
    const harness = createHarness(sampleProject());
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    renderTree(harness);
    const name = t('copy.itemActions', { name: 'Fechadura' });
    await userEvent.click(screen.getByRole('button', { name }));
    const menu = screen.getByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    await Promise.resolve();
    const section = document.querySelector('[data-window="tree"]');
    expect(document.activeElement).toBe(section);
  });
});

describe('foco depois do Mover para a frente (Detalhes)', () => {
  it('chegando ao fim da ordem, o foco fica no botão vizinho, não no body', async () => {
    // M1 e a irmã M5: a `M1` é `1 de 2` e, depois do clique, o botão fica desabilitado.
    const harness = createHarness(
      createMarking(sampleProject(), {
        id: 'M5',
        containerId: 'I1',
        rect: { x: 2500, y: 100, width: 100, height: 100 },
      }),
    );
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === 'M1');
      const image = p.containers.find((i) => i.id === marking?.containerId);
      if (!marking || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    const front = screen.getByRole('button', { name: t('marking.orderFront') });
    await userEvent.click(front);
    await Promise.resolve();
    expect((front as HTMLButtonElement).disabled).toBe(true);
    const back = screen.getByRole('button', { name: t('marking.orderBack') });
    expect(document.activeElement).toBe(back);
  });
});
