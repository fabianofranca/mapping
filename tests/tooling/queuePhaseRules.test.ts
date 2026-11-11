// @vitest-environment node
// Fase FM6 (etapa #1532, decisões 15 e 16): o reteste pede só os passos dos achados, a correção
// reproduz cada achado antes de mudar o código e o confere depois, e os subagentes que editam rodam
// em `medium`. Teste só de texto (leitura dos arquivos); o `docs/TESTING-NUVEM.md` não entra.
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('FM6 — reteste restrito, correção que reproduz o achado, subagentes em medium', () => {
  it('o passo a passo do orquestrador retesta só os passos, não os roteiros que falharam', () => {
    const s = section(flow, '## Orquestrador — passo a passo');
    expect(s).not.toContain('retesta só os roteiros que falharam');
    expect(s).toContain('retesta só os passos');
  });

  it('a fase de correção reproduz o achado antes do código e o confere depois', () => {
    const s = section(flow, '## Fase de correção');
    expect(s).toContain('reproduz cada achado antes de mexer no código');
    expect(s).toContain('confere de novo depois');
    expect(s).toMatch(/"antes" e "depois"/);
    expect(s).toContain('conferido depois');
    expect(s).toContain('não reproduzido não é dado como corrigido');
  });

  it('o item 3 da mensagem da fase põe os subagentes de edição em medium e troca acima de ~200k', () => {
    const s = between(
      section(flow, '## Para a sessão da fase'),
      '3. Subagentes e esforço',
      '4. Todo briefing',
    );
    expect(s).toMatch(/edição[^.]*`medium`/);
    expect(s).toMatch(/`high` só[^.]*revisão ou conferência/);
    expect(s).toContain('~200k');
  });

  it('o docs/PROCESS.md diz "passos que falharam" e cabe em 25.000 bytes', () => {
    const p = readFileSync('docs/PROCESS.md', 'utf8');
    expect(p).toContain('retesta só os passos que falharam');
    expect(p).not.toContain('retesta só os roteiros que falharam');
    expect(statSync('docs/PROCESS.md').size).toBeLessThanOrEqual(25000);
  });

  it('o passo 4 do SKILL.md pede a reprodução de cada achado no briefing da correção', () => {
    const s = between(
      section(skill, '## 3. Por etapa'),
      '4. **Correção**',
      '5. **Fechamento**',
    );
    expect(s).toContain('reprodução de cada achado');
    expect(s).toContain('**passos**, não roteiros');
    expect(s).toContain('conferência depois');
    expect(s).not.toContain('os roteiros que falharam');
  });
});
