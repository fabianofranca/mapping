import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { annotationOf, createHarness, renderLive } from './harness';
import { noticeProject } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(annotationId: string, readOnly = false) {
  const harness = createHarness(noticeProject());
  if (readOnly) harness.store.load(harness.project(), { readOnly: true });
  renderLive(harness, (p: Project) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, annotationId)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={vi.fn()}
      onShowLayer={vi.fn()}
      readOnly={harness.store.readOnly.value}
    />
  ));
}

describe('Detalhes — avisos da especialização', () => {
  it('o aviso do tipo fica no topo, com since e ref (ref em mono)', () => {
    setup('AA');
    const block = document.querySelector('.notice-block.notice-pending');
    if (!block) throw new Error('sem o bloco do tipo');
    expect(block.textContent).toContain('Pendente');
    expect(block.textContent).toContain('O contrato aceita avatarVariant');
    expect(block.textContent).toContain('2026-11-04');
    expect(block.querySelector('.notice-ref')?.textContent).toBe('cross/sdui/alert.md');
    // O bloco vem antes dos campos.
    const grid = document.querySelector('.props');
    expect(
      block.compareDocumentPosition(grid as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('o cabeçalho traz o selo do tipo (maior gravidade)', () => {
    setup('AA');
    const header = document.querySelector('.annotation-header') as HTMLElement;
    expect(
      within(header).getByRole('img', { name: /^Aviso Obsoleto: Use variant\./ }),
    ).toBeTruthy();
  });

  it('o aviso do campo fica abaixo do controle e o rótulo ganha o ícone do kind', () => {
    setup('AA');
    const line = document.querySelector('.notice-line.notice-deprecated');
    if (!line) throw new Error('sem a linha do campo');
    expect(line.textContent).toContain('Use variant.');
    const value = line.closest('.props-value') as HTMLElement;
    expect(value.querySelector('input, textarea')).not.toBeNull();
    const label = screen.getByText('legacyStyle', { selector: 'label' });
    expect(
      label.closest('.props-label-cell')?.querySelector('.notice-label-icon'),
    ).not.toBeNull();
    // Campo sem aviso: nem a célula do rótulo ganha ícone.
    const plain = screen.getByText('variant', { selector: 'label' });
    expect(
      plain.closest('.props-label-cell')?.querySelector('.notice-label-icon') ?? null,
    ).toBeNull();
  });

  it('o aviso da coluna fica abaixo da tabela e cita a coluna', () => {
    setup('AA');
    const line = document.querySelector('.notice-line.notice-diverges');
    if (!line) throw new Error('sem a linha da coluna');
    expect(line.textContent).toContain('handler');
    expect(line.textContent).toContain('Nome diferente no contrato.');
    const table = screen.getByRole('table', { name: 'events' });
    expect(
      table.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('os avisos aparecem também em só leitura', () => {
    setup('AA', true);
    expect(document.querySelector('.notice-block.notice-pending')).not.toBeNull();
    expect(document.querySelector('.notice-line.notice-deprecated')).not.toBeNull();
    expect(document.querySelector('.notice-line.notice-diverges')).not.toBeNull();
  });

  it('o tipo removido mostra o bloco e a anotação não ganha o selo Incompleta', () => {
    setup('AG');
    expect(document.querySelector('.notice-block.notice-removed')).not.toBeNull();
    expect(screen.queryByText('Incompleta')).toBeNull();
    expect(document.querySelector('.issue-badge')).toBeNull();
  });

  it('o tipo sem aviso não mostra nada', () => {
    setup('AP');
    expect(
      document.querySelector('.notice-block, .notice-line, .notice-badge'),
    ).toBeNull();
  });
});
