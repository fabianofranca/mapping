import { cleanup, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Texto que corta com reticências na janela estreita leva o texto inteiro no `title`
// (relato da rodada dirigida da etapa Marcação pai, achado 1).

afterEach(cleanup);

describe('texto cortado com dica', () => {
  it('a linha da camada sem anotação tem o resumo inteiro no title', () => {
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const m = p.markings.find((x) => x.id === 'M2');
      const image = p.containers.find((i) => i.id === m?.containerId);
      if (!m || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={m}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    // M2 só tem anotação na L1: a L2 mostra o resumo de camada vazia.
    const summary = screen.getByText(t('annotation.emptySection'));
    expect(summary.getAttribute('title')).toBe(t('annotation.emptySection'));
  });

  it('cada nível do caminho tem o nome inteiro no title', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    renderLive(harness, () => <Breadcrumbs onSelect={() => undefined} />);
    const names = document.querySelectorAll('.crumb-name');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.getAttribute('title')).toBe(name.textContent);
  });
});
