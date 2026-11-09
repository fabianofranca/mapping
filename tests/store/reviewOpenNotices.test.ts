import { afterEach, beforeEach, expect, it } from 'vitest';
import type { OpenProject } from '../../src/app/controller';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { openHarness, richScenario, writeOutside } from './proposalHarness';

// Abrir a revisão de uma proposta tira da fila todos os avisos dela (nova, revisada ou
// alterada por fora): a revisão já mostra o selo e o cabeçalho "Revisada pelo agente".

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

it('review.open limpa o aviso da proposta aberta', async () => {
  const { proposal } = richScenario();
  const { session, root } = await openHarness({ proposals: [proposal] });
  const editor = createEditorContextValue({ session } as unknown as OpenProject);
  writeOutside(root, { ...proposal, title: 'Outro título', revision: 5 });
  await session.proposals.scan();
  expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);
  expect(editor.review.open('P1').ok).toBe(true);
  expect(session.proposals.notices.value).toEqual([]);
  editor.review.dispose();
});
