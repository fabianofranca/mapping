// @vitest-environment node
// Fase LS1 (etapa #1814, decisão 12): a rodada em que todos os achados são de severidade baixa vai
// da correção ao fechamento, sem reteste; a rodada mista retesta só os high e medium; o achado low
// que a correção não reproduz leva reteste só dele. Teste só de texto (leitura dos arquivos).
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const process = readFileSync('docs/PROCESS.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

describe('LS1 — achado só de severidade baixa vai da correção ao fechamento, sem reteste', () => {
  it('o passo a passo do orquestrador dispensa o reteste da rodada toda baixa', () => {
    const s = section(flow, '## Orquestrador — passo a passo');
    expect(s).toContain('todos de severidade baixa');
    expect(s).toContain('sem reteste');
  });

  it('a fase de correção grava a severidade, o reteste sim|não e trata o low não reproduzido', () => {
    const s = section(flow, '## Fase de correção');
    expect(s).toContain('todos de severidade baixa');
    expect(s).toContain('escala da seção 7');
    expect(s).toContain('na dúvida, a maior');
    expect(s).toContain('`reteste: não`');
    expect(s).toContain('reteste dirigido só dos passos dele');
  });

  it('o reteste deixa de fora os achados de severidade baixa, em "Para o testador" e "Reteste junto"', () => {
    const t = between(
      flow,
      'Reteste, depois da correção',
      '## Rodada dirigida em grupos',
    );
    expect(t).toContain('os achados de severidade baixa ficam fora do reteste');
    expect(section(flow, '## Reteste junto')).toContain(
      'os achados de severidade baixa ficam fora do reteste',
    );
  });

  it('o docs/PROCESS.md diz a regra no bullet "Com ❌ ou defeito pendente" e cabe em 25.000 bytes', () => {
    const bullet = between(process, '**Com ❌ ou defeito pendente**', '\n  - **Sem ❌');
    expect(bullet).toContain('todos de severidade baixa');
    expect(bullet).toContain('sem reteste');
    expect(statSync('docs/PROCESS.md').size).toBeLessThanOrEqual(25000);
  });

  it('o implementar-fila repete a regra nas "Regras desta fila" e no passo 4 de "Por etapa"', () => {
    expect(section(skill, '## Regras desta fila')).toContain('todos de severidade baixa');
    const p4 = between(
      section(skill, '## 3. Por etapa'),
      '4. **Correção**',
      '5. **Fechamento**',
    );
    expect(p4).toContain('`reteste: não`');
    expect(p4).toContain('escala da seção 7');
    expect(p4).toContain('reteste dirigido só dos passos dele');
  });
});
