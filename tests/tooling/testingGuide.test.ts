// @vitest-environment node
// Fase 8.6: o guia do testador (`docs/TESTING.md`) fala com quem testa à mão; o que é só
// do agente testador fica no apêndice A, e o prompt vivo do Cowork é `docs/TESTING-COWORK.md`.
// Estes testes leem os documentos e falham se o padrão antigo voltar (achados G1 a G16 da
// revisão técnica de 2026-10-12, seção 6).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : '';

/** Troca o conteúdo dos blocos de código cercados por linhas vazias (mantém a numeração). */
function stripFences(md: string): string {
  let inFence = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

/** Separa o apêndice A (do título "## Apêndice A" até o próximo título "## ") do resto. */
function splitAppendixA(md: string): { body: string; appendixA: string } {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^## Apêndice A\b/.test(l));
  if (start < 0) return { body: md, appendixA: '' };
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return {
    body: [...lines.slice(0, start), ...lines.slice(end)].join('\n'),
    appendixA: lines.slice(start, end).join('\n'),
  };
}

/** Padrões que só cabem no apêndice A: rótulos do agente testador e termos de DOM/automação. */
const AGENT_ONLY: readonly RegExp[] = [
  /\bAgente\b/,
  /agente testador/i,
  /\bCowork\b/,
  /aria-label/,
  /`title`/,
  /keydown/,
  /localStorage/,
  /<select\b/,
  /<input\b/,
  /querySelector/,
  /DataTransfer/,
  /headless/i,
  /Set-Clipboard/,
];

/** Linhas (fora de blocos de código) com algo que só o agente testador usa. */
function agentLeaks(text: string): string[] {
  return stripFences(text)
    .split('\n')
    .filter((line) => AGENT_ONLY.some((re) => re.test(line)));
}

/** Itens de lista (fora de blocos de código) mais longos que `max` caracteres. */
function longBullets(md: string, max = 600): string[] {
  return stripFences(md)
    .split('\n')
    .filter((line) => /^\s*(?:[-*]|\d+\.)\s/.test(line) && line.trim().length > max);
}

/** Códigos de passo cuja linha da tabela (células sem o código) passa de `max` caracteres. */
function longSteps(md: string, max = 1200): string[] {
  const out: string[] = [];
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?((?:R\d+\.\d+|A\d+)[a-z]?)(?:\*\*)?[^|]*\|(.*)$/.exec(line);
    if (!m) continue;
    const size = m[2]!
      .split('|')
      .map((c) => c.trim())
      .join('').length;
    if (size > max) out.push(`${m[1]!} (${size})`);
  }
  return out;
}

describe('regras do guia: as funções pegam o padrão antigo e deixam passar a prosa certa', () => {
  it('pega "Agente:" e termos de DOM fora do apêndice A', () => {
    const old = [
      '- **Dicas (tooltips):** Agente: confira o atributo `title` do elemento (ou o `aria-label`).',
      '- **Agente: espere o campo aparecer antes de digitar.** Dispare o mesmo `keydown` por script.',
      '| R1.20 | … Agente sem `Ctrl+=`: veja as convenções. | … |',
      'Agente do Cowork: o prompt inicial da sua sessão está em …',
    ].join('\n');
    expect(agentLeaks(splitAppendixA(old).body)).toHaveLength(4);
  });

  it('deixa passar "Claude Code:", o ponteiro do prompt e o HTML do print em bloco de código', () => {
    const fine = [
      'Quem testa por um agente com controle do computador começa por `docs/TESTING-COWORK.md` e pelo apêndice A.',
      '| R5.7 | Peça ao Claude Code: "Reexporte…" | **Claude Code:** diz que nada mudou. |',
      '- Uma proposta de agente aparece em **Propostas**; "Nova nota para o agente".',
      '```html',
      '<p>Nome<br /><input style="width: 340px" /></p>',
      '```',
      '## Apêndice A — Para o agente testador',
      '- Confira a dica pelo atributo `title` (ou o `aria-label`); `keydown` sintético para o zoom.',
      '## Apêndice B — Operações de disco por sistema',
    ].join('\n');
    const { body, appendixA } = splitAppendixA(fine);
    expect(agentLeaks(body)).toEqual([]);
    expect(agentLeaks(appendixA).length).toBeGreaterThan(0);
  });

  it('pega o bullet gigante do [pessoa] e o passo R5.4 de 2.200 caracteres', () => {
    expect(longBullets(`- **[pessoa]**: ${'x'.repeat(1400)}`)).toHaveLength(1);
    expect(longBullets(`- curto\n1. também curto`)).toEqual([]);
    expect(longSteps(`| R5.4 | ${'a'.repeat(1100)} | ${'b'.repeat(1100)} |`)).toEqual([
      'R5.4 (2200)',
    ]);
    expect(longSteps(`| R5.4a | ${'a'.repeat(500)} | ${'b'.repeat(500)} |`)).toEqual([]);
  });
});

describe('docs/TESTING.md (guia de quem testa à mão)', () => {
  const guide = read('docs/TESTING.md');
  const { body, appendixA } = splitAppendixA(guide);

  it('nada do agente testador fora do apêndice A (G1, G4)', () => {
    expect(appendixA).not.toBe('');
    expect(agentLeaks(body)).toEqual([]);
  });

  it('sem bullet acima de 600 caracteres nem passo acima de 1.200 (G2, G7)', () => {
    expect(longBullets(guide)).toEqual([]);
    expect(longSteps(guide)).toEqual([]);
  });

  it('tem Comece aqui, Mapa da interface, Teste manual avançado e os dois apêndices (G3, G8)', () => {
    const headings = guide.split('\n').filter((l) => l.startsWith('## '));
    for (const h of [
      /^## Comece aqui/,
      /^## 5\. Mapa da interface/,
      /^## 9\. Teste manual avançado/,
      /^## Apêndice A\b/,
      /^## Apêndice B\b/,
    ]) {
      expect(
        headings.some((l) => h.test(l)),
        String(h),
      ).toBe(true);
    }
    expect(guide.indexOf('## Comece aqui')).toBeLessThan(guide.indexOf('## 1. '));
  });

  it('o texto segue a ordem de execução: R5 depois do R7 e antes do R8 (G8)', () => {
    const at = (code: string): number => guide.indexOf(`### ${code} `);
    expect(at('R7')).toBeGreaterThan(at('R6'));
    expect(at('R5')).toBeGreaterThan(at('R7'));
    expect(at('R8')).toBeGreaterThan(at('R5'));
  });

  it('MCP: sha256, Verificar a pasta agora e nenhuma Release fixada (G10)', () => {
    expect(guide).toContain('sha256');
    expect(guide).toContain('**Verificar a pasta agora**');
    expect(guide).not.toMatch(/mcp-v0\.\d/);
  });

  it('templates com Resumo, Observações e a escala de severidade (G15)', () => {
    for (const s of [
      '## Resumo',
      '## Observações (sem severidade)',
      'Pasta de trabalho',
      'DPR',
      'Estado prévio do navegador',
      'Tempo por roteiro',
      'Impede o uso com pessoas?',
      '| Sessões',
    ]) {
      expect(guide, s).toContain(s);
    }
    for (const level of ['bloqueia', 'alta', 'média', 'baixa']) {
      expect(guide, level).toMatch(new RegExp(`^- \\*\\*${level}\\*\\*`, 'm'));
    }
  });
});

describe('docs/TESTING-COWORK.md (prompt vivo do testador do Cowork)', () => {
  const prompt = read('docs/TESTING-COWORK.md');

  it('existe e manda perguntar e dizer que está esperando em cada [pessoa] (G11)', () => {
    expect(prompt).not.toBe('');
    expect(prompt).toContain('Estou esperando');
    expect(prompt).toContain('30 s');
  });

  it('modo dirigido com os três alvos e passada visual com lista padrão (G12, G13)', () => {
    expect(prompt).toMatch(/achados de um relato/);
    expect(prompt).toMatch(/lista de passos/);
    expect(prompt).toMatch(/PLAN-etapa-/);
    expect(prompt).toContain('Sair da revisão?');
    expect(prompt).not.toMatch(/etapa 6/i);
    expect(prompt).not.toMatch(/mcp-v0\.\d/);
  });

  it('README.md e CLAUDE.md apontam para ele, não para o prompt em history/ (G16)', () => {
    for (const path of ['README.md', 'CLAUDE.md']) {
      const text = read(path);
      expect(text, path).toContain('docs/TESTING-COWORK.md');
      expect(text, path).not.toContain('etapa-6-testes-cowork.md');
    }
  });
});
