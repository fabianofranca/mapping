// @vitest-environment node
// Fase 8.6: o guia do testador (`docs/TESTING.md`) fala com quem testa à mão; o que é só
// do agente testador fica no apêndice A, e o prompt vivo do Cowork é `docs/TESTING-COWORK.md`.
// Estes testes leem os documentos e falham se o padrão antigo voltar (achados G1 a G16 da
// revisão técnica de 2026-10-12, seção 6).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../mcp/args';

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

/** Códigos de passo cuja linha da tabela (células sem o código) passa de `max` caracteres (o limite subiu de 1.200 para 1.300 com as anotações "ou `ferramenta`" nos passos [pessoa]). */
function longSteps(md: string, max = 1300): string[] {
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

/** Ação (primeira célula depois do código) de cada passo da tabela, por código. */
function stepActions(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?((?:R\d+\.\d+|A\d+)[a-z]?)(?:\*\*)?\s*\|([^|]*)\|/.exec(
      line,
    );
    if (m && !out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/**
 * Passos cuja Ação pede algo ao Claude Code sem a marca [pessoa] na mesma frase (M4 da segunda
 * leitura): a marca de outra ação do passo, como o Abrir pasta do R5.2, não conta.
 */
function claudeCodeWithoutPerson(md: string): string[] {
  return [...stepActions(md)]
    .filter(([, action]) => {
      const ask = action.split(/(?<=\.["”]?)\s+/).find((s) => s.includes('Claude Code'));
      return ask !== undefined && !ask.includes('[pessoa]');
    })
    .map(([code]) => code);
}

/**
 * Passos dos roteiros principais (códigos R<n>.<m>; o RP e os roteiros sob demanda não entram)
 * cuja linha da tabela diz "sem substituto" (a marca de passo que o agente não faz sozinho).
 */
function stepsWithoutSubstitute(md: string, allowed: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of stripFences(md).split('\n')) {
    const m = /^\|\s*(?:\*\*)?(R\d+\.\d+[a-z]?)(?:\*\*)?\s*\|/.exec(line);
    if (m && /sem substituto/i.test(line) && !allowed.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

/**
 * Exceções aceitas pelo dono: passos dos roteiros principais que continuam sem substituto para
 * o agente. Vazia: o R0.5 e o R6.2 saíram dos roteiros principais (RF e RA, sob demanda).
 * Para acrescentar um, escreva aqui o porquê e leve a decisão ao dono (CLAUDE.md, Fluxo de trabalho).
 */
const NO_SUBSTITUTE_EXCEPTIONS: readonly string[] = [];

/** Texto de uma seção "## <prefixo>…" até o próximo "## ". */
function section(md: string, prefix: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${prefix}`));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
}

/** Primeiro bloco ```json de um trecho, sem as cercas. */
function firstJsonBlock(md: string): string {
  const m = /```json\n([\s\S]*?)\n\s*```/.exec(md);
  return m ? m[1]! : '';
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

  it('pega o "Peça ao Claude Code" sem [pessoa] e deixa passar o marcado', () => {
    const md = [
      '| R5.1 | **[pessoa]** No Claude Code, peça a lista. | ok |',
      '| R5.2 | Peça ao Claude Code: "Crie". Abra a pasta (**[pessoa]**). | ok |',
      '| R3.6 | **Com o Claude Code** (seção 6) **[pessoa]**. Peça: a planta. | ok |',
      '| R5.3 | Na Árvore, aceite. | **Claude Code:** nada. |',
      '| R5.4a | Peça ao Claude Code: "Leia…" | ok |',
    ].join('\n');
    expect(claudeCodeWithoutPerson(md)).toEqual(['R5.2', 'R5.4a']);
  });

  it('pega "sem substituto" num passo principal e deixa passar a exceção listada e o roteiro sob demanda', () => {
    const md = [
      '| R0.5 | Baixe (**[pessoa]**, sem substituto). | ok |',
      '| R6.2 | **[pessoa]**, o passo inteiro, sem substituto. | ok |',
      '| R1.1 | Abra a pasta (**[pessoa]** ou `select_folder`). | ok |',
      '| RP.1 | Instale (sem substituto). | ok |',
    ].join('\n');
    expect(stepsWithoutSubstitute(md, [])).toEqual(['R0.5', 'R6.2']);
    expect(stepsWithoutSubstitute(md, ['R6.2'])).toEqual(['R0.5']);
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

  it('sem bullet acima de 600 caracteres nem passo acima de 1.300 (G2, G7)', () => {
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

  it('nenhum passo dos roteiros principais fica sem substituto, fora das exceções (R0 a R10)', () => {
    expect(stepsWithoutSubstitute(guide, NO_SUBSTITUTE_EXCEPTIONS)).toEqual([]);
  });

  it('o RP está nos roteiros sob demanda, com critério de entrada, e o R0.5 e o R6.2 migraram para o RF e o RA', () => {
    const onDemand = guide.indexOf('### Roteiros sob demanda (manuais)');
    expect(onDemand).toBeGreaterThan(guide.indexOf('### R9 '));
    expect(guide.indexOf('#### RP — App instalado (PWA)')).toBeGreaterThan(onDemand);
    expect(guide).toContain('Critério de entrada');
    const actions = stepActions(guide);
    expect(actions.has('R0.5')).toBe(false);
    expect(actions.has('R6.2')).toBe(false);
    expect(guide.indexOf('#### RF — ')).toBeGreaterThan(onDemand);
    expect(guide.indexOf('#### RA — ')).toBeGreaterThan(onDemand);
  });

  it('todo passo que pede algo ao Claude Code tem [pessoa] na Ação (M4)', () => {
    expect(stepActions(guide).get('R3.6')).toContain('[pessoa]');
    expect(claudeCodeWithoutPerson(guide)).toEqual([]);
  });

  it('seção 6: o .mcp.json tem as raízes design/mapeamentos e assets, no formato do servidor (M3)', () => {
    const six = section(guide, '6. ');
    expect(six).toContain('assets/');
    const config = JSON.parse(firstJsonBlock(six)) as {
      mcpServers: { mapping: { command: string; args: string[] } };
    };
    const [script, ...args] = config.mcpServers.mapping.args;
    expect(script).toBe('tools/mapping-mcp.js');
    expect(parseArgs(args).roots).toEqual(['design/mapeamentos', 'assets']);
  });

  it('R5: os prints vão para assets/ e o create_project indica a raiz (M3)', () => {
    const r5 = guide.slice(guide.indexOf('### R5 '), guide.indexOf('### R8 '));
    expect(r5).toMatch(/`login\.png`[^\n]*`assets\/`/);
    expect(stepActions(guide).get('R5.2')).toMatch(
      /create_project[^"]*design\/mapeamentos|design\/mapeamentos[^"]*create_project/,
    );
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
      '## Sessões',
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

  it('pede o build id esperado na pergunta única e na mensagem da rodada completa (M6)', () => {
    expect(prompt).toMatch(/^\s*- \(g\)[^\n]*build id esperado/m);
    expect(prompt).toMatch(/\*\*Rodada completa:\*\*[^\n]*Build id esperado/);
  });

  it('rodada sem interação: dialog-pilot, cliente por stdio e passos que só o dono faz', () => {
    const guide = read('docs/TESTING.md');
    expect(existsSync('scripts/testing/mcp-stdio-client.mjs')).toBe(true);
    for (const text of [prompt, guide]) {
      expect(text).toContain('dialog-pilot');
      expect(text).toContain('scripts/testing/mcp-stdio-client.mjs');
    }
    expect(prompt).toContain('sem interação');
    expect(prompt).toContain('não executado (precisa do dono)');
    expect(guide).toContain('Diálogos nativos com o dialog-pilot');
    expect(guide).toMatch(/^- Ferramenta:[^\n]*dialog-pilot[^\n]*stdio/m);
  });

  it('tem a sessão sob demanda e o resultado da validação da automação do R0.5 e do R6.2', () => {
    expect(prompt).toContain('Sessão sob demanda');
    expect(prompt).toContain('Validação da automação (resultado da rodada');
    expect(read('CLAUDE.md')).toContain('pendente de decisão');
  });

  it('README.md e CLAUDE.md apontam para ele, não para o prompt em history/ (G16)', () => {
    for (const path of ['README.md', 'CLAUDE.md']) {
      const text = read(path);
      expect(text, path).toContain('docs/TESTING-COWORK.md');
      expect(text, path).not.toContain('etapa-6-testes-cowork.md');
    }
  });
  // Etapa Imagens remotas (RI4): o R14 roda sozinho, com um servidor local que a shell sobe.
  describe('R14 — Imagens remotas', () => {
    const guide = read('docs/TESTING.md');
    const r14 = guide.slice(
      guide.indexOf('### R14 '),
      guide.indexOf('### Roteiros sob demanda (manuais)'),
    );

    it('está no quadro "Comece aqui", entre os roteiros principais, depois do R13', () => {
      expect(guide).toMatch(/^\| 16 +\| R14 — Imagens remotas/m);
      expect(guide.indexOf('### R14 ')).toBeGreaterThan(guide.indexOf('### R13 '));
      expect(guide.indexOf('### R14 ')).toBeLessThan(
        guide.indexOf('### Roteiros sob demanda (manuais)'),
      );
      expect(guide).toMatch(/^- R14 usa a pasta própria `remotas`/m);
    });

    it('tem os passos R14.1 a R14.12, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r14).keys()];
      expect(codes).toEqual(Array.from({ length: 12 }, (_, i) => `R14.${i + 1}`));
      expect(/sem substituto/i.test(r14)).toBe(false);
    });

    it('a rede local e o sem CORS usam um servidor local que a shell sobe, sem cabeçalho de CORS', () => {
      expect(r14).toContain('python3 -m http.server 8765 --bind 127.0.0.1');
      expect(r14).toContain('servidor.log');
      expect(r14).toMatch(/não\*\* traz `Access-Control-Allow-Origin`/);
      expect(r14).toContain('**Mostrar imagens de servidores sem CORS**');
      expect(r14).toContain('**Permitir imagens da rede local**');
    });

    it('o http: passa pelo mesmo servidor local, com os interruptores de http e de rede local', () => {
      expect(r14).toContain('http://127.0.0.1:8765/foto.png');
      expect(r14).toContain('**Permitir imagens sem criptografia (http)**');
      expect(r14).toContain('**Permitir imagens de qualquer origem**');
    });

    it('usa a imagem de teste de public/, servida pelo Pages, e ela existe', () => {
      expect(r14).toContain('imagens-teste/foto.png');
      const png = readFileSync('public/imagens-teste/foto.png');
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(96);
      expect(png.readUInt32BE(20)).toBe(96);
    });

    it('os textos citados são os da interface (pt-BR)', () => {
      const i18n = read('src/i18n/pt-BR.ts');
      for (const text of [
        'Permitir estas',
        'Agora não',
        'Permitir imagens sem criptografia (http)',
        'Permitir imagens da rede local',
        'Mostrar imagens de servidores sem CORS',
        'Permitir imagens de qualquer origem',
        'endereço não aceito',
        'origem sem permissão',
        'não carregou',
      ]) {
        expect(i18n, text).toContain(text);
        expect(r14, text).toContain(text);
      }
    });

    it('o prompt do Cowork tem a rodada dirigida das imagens remotas, com o R14', () => {
      expect(prompt).toContain('## 12. Rodada dirigida da etapa Imagens remotas');
      expect(prompt).toContain('R14.12');
      expect(prompt).toContain('R0 a R14');
    });
  });
});
