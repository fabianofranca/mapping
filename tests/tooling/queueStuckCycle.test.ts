// @vitest-environment node
// Via rápida #1884: a conferência das atrasadas olha a fase que trabalha em ciclo de CI vermelho
// (R5 da #1096: 6 pushes em 80 min, sem aviso). Teste só de texto do `implementar-fila`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const porEtapa = section(skill, '## 3. Por etapa');
const trabalhando = between(
  porEtapa,
  '  - trabalhando:',
  '  - `review_ready` ou `idle` com o último turno terminado num `send_later`',
);

describe('#1884 — atrasada que está trabalhando em ciclo de CI vermelho', () => {
  it('sem suspeita segue como antes: row childAt=now', () => {
    expect(trabalhando).toContain("`row '#n' childAt=now`");
    expect(trabalhando).toMatch(/[Ss]em suspeita, só o `childAt=now`/);
  });

  it('o gatilho lê o PR aberto pelo GitHub MCP, em subagente Sonnet, pela Leitura do CI', () => {
    expect(trabalhando).toMatch(/PR da fase aberto/);
    expect(trabalhando).toMatch(/subagente do ciclo, Sonnet/);
    expect(trabalhando).toContain('**Leitura do CI**');
    expect(trabalhando).toMatch(/commits do PR depois da abertura/);
  });

  it('suspeita de ciclo: 3 commits vermelhos ou a mesma falha em 2 seguidos', () => {
    expect(trabalhando).toMatch(/3 ou mais commits com CI vermelho depois da abertura/);
    expect(trabalhando).toMatch(
      /mesmo job e a mesma mensagem de erro, mesmo em testes diferentes\) em 2 commits seguidos/,
    );
  });

  it('o diagnóstico: fatos do Sonnet em até 10 linhas, Opus só pelo resumo em até 6', () => {
    expect(trabalhando).toMatch(/até 10 linhas/);
    expect(trabalhando).toMatch(
      /subagente \*\*Opus\*\* lê só esse resumo, nunca o transcript/,
    );
    expect(trabalhando).toMatch(/até 6 linhas/);
    expect(trabalhando).toMatch(/é ciclo ou não, a causa provável e a direção/);
  });

  it('um diagnóstico por fase a cada 60 min, registrado no log', () => {
    expect(trabalhando).toMatch(/[Nn]o máximo um diagnóstico por fase a cada 60 min/);
    expect(trabalhando).toContain('<código>: diagnóstico de ciclo');
  });

  it('sendo ciclo: send_message com priority now, childAt=now e o log da direção enviada', () => {
    expect(trabalhando).toContain('`send_message`');
    expect(trabalhando).toContain('`priority: "now"`');
    expect(trabalhando).toContain(
      '<código>: ciclo de CI (<n> commits vermelhos) → direção enviada',
    );
  });

  it('direção fora do "Toca em:" não é enviada: pergunta ao dono com opção recomendada', () => {
    expect(trabalhando).toMatch(/fora do "Toca em:" da sub-issue, não manda/);
    expect(trabalhando).toContain('`AskUserQuestion`');
    expect(trabalhando).toMatch(/opção recomendada/);
  });

  it('os outros casos da atrasada ficam como estavam', () => {
    const casos = between(
      porEtapa,
      '- Para cada atrasada,',
      '- **Pior caso de detecção:**',
    );
    expect(casos).toContain('  - `blocked` (o `status` em REQUIRES_ACTION');
    expect(casos).toContain('  - se acontecer de novo, a etapa vira `falhou`');
  });
});
