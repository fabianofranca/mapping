import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTypedAnnotation,
  setFieldValue,
  specFiles,
  type Project,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { propose } from '../../model/proposalFixtures';
import { layerOf } from '../../model/specFixtures';
import { noticeProject } from '../noticeFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';

// Avisos da especialização na revisão de propostas (etapa #486, AV3, decisão 10): a mudança
// que cria uma anotação de tipo com aviso, troca o tipo ou grava valor num campo com aviso
// mostra o aviso no popover dela, sem tirar o Aceitar nem o Aplicar.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function openPanel(base: Project, after: Project) {
  const proposal = propose(base, after, { id: 'P1' });
  // As cópias de `specs/` vão junto: sem elas a pasta abre sem a especialização.
  const files = Object.fromEntries(specFiles(base));
  const h = await openReviewHarness({ project: base, proposals: [proposal], files });
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select({ level: 'item', id: 'M1' }));
  renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
  return h;
}

function openMark(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog');
}

describe('aviso no popover da mudança', () => {
  it('gravar valor num campo com aviso mostra o aviso e mantém Aceitar habilitado', async () => {
    const base = noticeProject();
    await openPanel(base, setFieldValue(base, 'AA', 'legacyStyle', 'novo'));
    const pop = openMark(/^legacyStyle · Alert: alterado/);
    expect(
      within(pop).getByRole('note', { name: 'Aviso Obsoleto: Use variant.' }),
    ).toBeTruthy();
    const accept = within(pop).getByRole('button', { name: /^Aceitar/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });

  it('criar anotação de tipo com aviso mostra o aviso', async () => {
    const base = noticeProject();
    const after = addTypedAnnotation(base, {
      id: 'AN',
      markingId: 'M1',
      layerId: layerOf(base, 'avisos', 'componentes'),
      type: { specId: 'avisos', typeId: 'gone' },
      parentAnnotationId: null,
    });
    await openPanel(base, after);
    const pop = openMark(/^Anotação Gone criada/);
    expect(
      within(pop).getByRole('note', { name: 'Aviso Removido: Saiu do contrato.' }),
    ).toBeTruthy();
  });

  it('trocar o tipo para um com aviso mostra o aviso', async () => {
    const base = noticeProject();
    const after: Project = {
      ...base,
      annotations: base.annotations.map((a) =>
        a.id === 'AP' ? { ...a, type: { specId: 'avisos', typeId: 'gone' } } : a,
      ),
    };
    await openPanel(base, after);
    const pop = openMark(/^Tipo · Gone: alterado/);
    expect(
      within(pop).getByRole('note', { name: 'Aviso Removido: Saiu do contrato.' }),
    ).toBeTruthy();
  });

  it('sem aviso no tipo ou no campo, o popover não traz aviso', async () => {
    const base = noticeProject();
    await openPanel(base, setFieldValue(base, 'AP', 'name', 'novo'));
    const pop = openMark(/^name · Plain: alterado/);
    expect(within(pop).queryByRole('note')).toBeNull();
  });
});
