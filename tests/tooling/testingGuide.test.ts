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
  // Etapa Imagens remotas (RI4): o R15 roda sozinho, com um servidor local que a shell sobe.
  describe('R15 — Imagens remotas', () => {
    const guide = read('docs/TESTING.md');
    const r15 = guide.slice(guide.indexOf('### R15 '), guide.indexOf('### R16 '));

    it('está no quadro "Comece aqui", entre os roteiros principais, depois do R14', () => {
      expect(guide).toMatch(/^\| 17 +\| R15 — Imagens remotas/m);
      expect(guide.indexOf('### R15 ')).toBeGreaterThan(guide.indexOf('### R14 '));
      expect(guide.indexOf('### R15 ')).toBeLessThan(guide.indexOf('### R16 '));
      expect(guide).toMatch(/^- R15 usa a pasta própria `remotas`/m);
    });

    it('tem os passos R15.1 a R15.12, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r15).keys()];
      expect(codes).toEqual(Array.from({ length: 12 }, (_, i) => `R15.${i + 1}`));
      expect(/sem substituto/i.test(r15)).toBe(false);
    });

    it('a rede local e o sem CORS usam um servidor Node no computador do Chrome, sem cabeçalho de CORS', () => {
      expect(r15).toContain('scripts/servidor-imagens.mjs');
      expect(r15).toContain('iniciar-servidor.cmd');
      expect(r15).toContain('**no mesmo computador do Chrome**');
      expect(r15).toMatch(/GET \/foto\.png origin=none/);
      expect(r15).toContain('http://127.0.0.1:8765/parar');
      expect(r15).toContain('servidor.log');
      expect(r15).toContain('não manda `Access-Control-Allow-Origin`');
      expect(r15).toContain('**Mostrar imagens de servidores sem CORS**');
      expect(r15).toContain('**Permitir imagens da rede local**');
    });

    it('o http: passa pelo mesmo servidor local, com os interruptores de http e de rede local', () => {
      expect(r15).toContain('http://127.0.0.1:8765/foto.png');
      expect(r15).toContain('**Permitir imagens sem criptografia (http)**');
      expect(r15).toContain('**Permitir imagens de qualquer origem**');
    });

    it('usa a imagem de teste de public/, servida pelo Pages, e ela existe', () => {
      expect(r15).toContain('imagens-teste/foto.png');
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
        expect(r15, text).toContain(text);
      }
    });

    it('o prompt do Cowork tem a rodada dirigida das imagens remotas, com o R15', () => {
      expect(prompt).toContain('## 12. Rodada dirigida da etapa Imagens remotas');
      expect(prompt).toContain('R15.12');
      expect(prompt).toContain('R0 a R17');
    });
  });
  // Etapa Biblioteca Material 3 (MD1): o R16 roda sozinho, pelo cliente MCP por stdio e pela extensão.
  describe('R16 — Variantes no código', () => {
    const guide = read('docs/TESTING.md');
    const r16 = guide.slice(guide.indexOf('### R16 '), guide.indexOf('### R17 '));

    it('está no quadro "Comece aqui", depois do R15 e antes do R17', () => {
      expect(guide).toMatch(/^\| 18 +\| R16 — Variantes no código/m);
      expect(guide.indexOf('### R16 ')).toBeGreaterThan(guide.indexOf('### R15 '));
      expect(guide.indexOf('### R16 ')).toBeLessThan(guide.indexOf('### R17 '));
      expect(guide).toMatch(/^- R16 usa a pasta própria `variantes`/m);
    });

    it('tem os passos R16.1 a R16.10, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r16).keys()];
      expect(codes).toEqual(Array.from({ length: 10 }, (_, i) => `R16.${i + 1}`));
      expect(/sem substituto/i.test(r16)).toBe(false);
      expect(r16).not.toContain('[pessoa]');
    });

    it('a especialização do roteiro é uma v9 válida, com variants', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r16)?.[1];
      expect(block).toBeDefined();
      const { parseSpecText } = await import('../../src/model/spec');
      const parsed = parseSpecText(block ?? '');
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.spec.formatVersion).toBe(9);
    });

    it('usa o cliente stdio e as tools que o roteiro confere', () => {
      for (const tool of [
        'validate_specialization',
        'propose_changes',
        'get_code_hints',
        'get_annotation',
        'get_marking',
        'find_by_code',
        'get_specialization',
      ]) {
        expect(r16, tool).toContain(tool);
      }
      expect(r16).toContain('OutlinedButton');
    });

    it('o prompt do Cowork lista os roteiros até o R17', () => {
      expect(prompt).toContain('R0 a R17');
    });
  });

  // Etapa Biblioteca Material 3 (MD5): o R17 roda sozinho, pelo cliente MCP por stdio, a shell e a extensão.
  describe('R17 — Biblioteca Material 3 (Compose)', () => {
    const guide = read('docs/TESTING.md');
    const r17 = guide.slice(
      guide.indexOf('### R17 '),
      guide.indexOf('### Roteiros sob demanda (manuais)'),
    );

    it('está no quadro "Comece aqui", depois do R16 e antes dos roteiros sob demanda', () => {
      expect(guide).toMatch(/^\| 19 +\| R17 — Biblioteca Material 3 \(Compose\)/m);
      expect(guide.indexOf('### R17 ')).toBeGreaterThan(guide.indexOf('### R16 '));
      expect(guide.indexOf('### R17 ')).toBeLessThan(
        guide.indexOf('### Roteiros sob demanda (manuais)'),
      );
      expect(guide).toMatch(/^- R17 usa a pasta própria `tela-m3`/m);
      expect(guide).toContain('`material3-compose.zip` (R17)');
    });

    it('tem os passos R17.1 a R17.9, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r17).keys()];
      expect(codes).toEqual(Array.from({ length: 9 }, (_, i) => `R17.${i + 1}`));
      expect(/sem substituto/i.test(r17)).toBe(false);
      expect(r17).not.toContain('[pessoa]');
    });

    it('o lote do roteiro é JSON válido, só com tipos que a biblioteca tem', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r17)?.[1];
      expect(block).toBeDefined();
      const ops = JSON.parse(block ?? '[]') as { op: string; type?: string }[];
      expect(ops.filter((o) => o.op === 'add_container')).toHaveLength(1);
      expect(ops.filter((o) => o.op === 'create_marking')).toHaveLength(7);
      expect(ops.some((o) => o.op === 'apply_specialization')).toBe(false);
      const spec = JSON.parse(
        read('libraries/material3-compose/material3-compose.spec.json'),
      ) as { layers: { annotationTypes: { id: string }[] }[] };
      const types = new Set(
        spec.layers.flatMap((l) =>
          l.annotationTypes.map((t) => `material3-compose/${t.id}`),
        ),
      );
      const used = ops
        .filter((o) => o.op === 'create_annotation')
        .map((o) => o.type ?? '');
      expect(used).toHaveLength(7);
      for (const type of used) expect(types.has(type), type).toBe(true);
    });

    it('usa o cliente stdio e as tools que o roteiro confere', () => {
      for (const tool of [
        'validate_library',
        'create_project',
        'propose_changes',
        'list_markings',
        'get_code_hints',
        'get_annotation',
        'find_by_code',
      ]) {
        expect(r17, tool).toContain(tool);
      }
      for (const composable of ['Scaffold', 'TopAppBar', 'LazyColumn', 'ListItem']) {
        expect(r17, composable).toContain(composable);
      }
      expect(r17).toContain('OutlinedButton');
      expect(r17).toContain('FloatingActionButton');
      expect(r17).toContain('Aplicar zip…');
    });

    it('o prompt do Cowork lista os roteiros até o R17', () => {
      expect(prompt).toContain('R0 a R17');
    });
  });
});
