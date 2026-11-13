import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { deleteImpact } from '../../src/model';
import { impactText } from '../../src/ui/comments/deleteText';
import {
  AGENT,
  HUMAN,
  T0,
  T1,
  T2,
  T3,
  message,
  sampleThread,
} from '../model/threadFixtures';

// Trava o que o roteiro (docs/TESTING.md, R22.18 e R3.10) afirma sobre os textos da app.
describe('textos citados no roteiro', () => {
  beforeEach(() => {
    locale.value = 'pt-BR';
  });

  it('R22.18: "Vão embora 5 mensagens" por autor, do que mais escreveu ao que menos, empate alfabético', () => {
    const teste = {
      kind: 'human' as const,
      name: 'Teste Nuvem',
      email: 'teste@exemplo.com',
    };
    const testador = { kind: 'agent' as const, name: 'agente-testador', email: null };
    const thread = sampleThread({
      messages: [
        message('m1', T0, HUMAN),
        message('m2', T1, teste),
        message('m3', T2, AGENT),
        message('m4', T3, testador),
        message('m5', T3, teste),
      ],
    });
    expect(impactText(deleteImpact(thread, null))).toBe(
      'Vão embora 5 mensagens: 2 de Teste Nuvem, 1 de agente-testador (agente), 1 de Claude Code (agente), 1 de Marina Alves.',
    );
  });

  it('R3.10: a aplicação traz o nome entre aspas', () => {
    expect(t('spec.appliedMessage', { name: 'Material 3 (Compose)', layers: 3 })).toBe(
      '"Material 3 (Compose)" aplicada: 3 camada(s) criada(s).',
    );
  });
});
