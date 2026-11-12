// @vitest-environment node
// Fase 8.6: o guia do testador (`docs/TESTING.md`) fala com quem testa à mão; o que é só
// do agente testador fica no apêndice A, e o prompt vivo do testador é `docs/TESTING-NUVEM.md`.
// Estes testes leem os documentos e falham se o padrão antigo voltar (achados G1 a G16 da
// revisão técnica de 2026-10-12, seção 6).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../mcp/args';
import { ptBR } from '../../src/i18n/pt-BR';

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
/** O nome do agente antigo, montado em partes para o próprio teste não o citar. */
const OLD_AGENT = new RegExp(`\\b${'Cow'}${'ork'}\\b`);

const AGENT_ONLY: readonly RegExp[] = [
  /\bAgente\b/,
  /agente testador/i,
  OLD_AGENT,
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

/** Códigos de passo cuja linha da tabela (células sem o código) passa de `max` caracteres (o limite subiu de 1.200 para 1.300 com as anotações "ou `ferramenta`" nos passos [pessoa], e para 1.700 com o tema escuro no R23.12). Com as tabelas compactas (`proseWrap: "never"` no `.prettierrc.json`) a medida é só de conteúdo; antes contava também os espaços do alinhamento. */
function longSteps(md: string, max = 1700): string[] {
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
 * Para acrescentar um, escreva aqui o porquê e leve a decisão ao dono (docs/PROCESS.md, Fluxo de trabalho).
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
      'Agente testador: o prompt inicial da sua sessão está em …',
    ].join('\n');
    expect(agentLeaks(splitAppendixA(old).body)).toHaveLength(4);
  });

  it('deixa passar "Claude Code:", o ponteiro do prompt e o HTML do print em bloco de código', () => {
    const fine = [
      'Quem testa por um agente com controle do computador começa por `docs/TESTING-NUVEM.md` e pelo apêndice A.',
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

  it('sem bullet acima de 600 caracteres nem passo acima de 1.700 (G2, G7)', () => {
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

describe('docs/TESTING-NUVEM.md (modos, roteiros e fluxo do relato)', () => {
  const prompt = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');

  it('modo dirigido com os três alvos, a mensagem com sub-issue e a passada visual padrão (G12, G13)', () => {
    expect(prompt).toMatch(/achados de um relato/);
    expect(prompt).toMatch(/lista de roteiros/);
    expect(prompt).toMatch(/fases de uma etapa/);
    expect(prompt).toContain('Relato na sub-issue #');
    expect(`${prompt}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`).toContain(
      'Sair da revisão?',
    );
    expect(prompt).not.toMatch(/mcp-v0\.\d/);
  });

  it('é sem interação, usa o cliente por stdio e marca o que só o dono faz', () => {
    expect(existsSync('scripts/testing/mcp-stdio-client.mjs')).toBe(true);
    for (const text of [prompt, guide]) {
      expect(text).toContain('scripts/testing/mcp-stdio-client.mjs');
    }
    expect(prompt).toContain('não executado (precisa do dono)');
    expect(`${prompt}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`).toContain(
      'pendente de decisão',
    );
    expect(read('docs/PROCESS.md')).toContain('pendente de decisão');
  });

  it('o relato é um comentário na sub-issue, em partes acima de 65 mil caracteres, sem branch nem PR', () => {
    expect(prompt).toContain('add_issue_comment');
    expect(prompt).toContain('comentário na sub-issue');
    expect(prompt).toContain('65 mil');
    expect(prompt).toContain('Parte i de n');
    expect(prompt).toContain('send_message');
    expect(prompt).toContain('não edita nada no repositório');
    expect(prompt).not.toContain('docs/history');
    expect(prompt).not.toContain('teste/<alvo>');
  });

  it('o guia não cita o prompt antigo, o dialog-pilot nem relatos em docs/history', () => {
    for (const text of [prompt, guide]) {
      expect(text).not.toMatch(/dialog-pilot/);
      expect(text).not.toContain('docs/history');
      expect(text).not.toMatch(/relato-20\d\d/);
      expect(text).not.toMatch(/extensão do navegador/);
    }
    expect(existsSync(`docs/TESTING-${'COW'}${'ORK'}.md`)).toBe(false);
  });

  it('nenhum doc vivo de teste, README ou CLAUDE.md fala do agente antigo', () => {
    for (const path of [
      'docs/TESTING.md',
      'docs/TESTING-NUVEM.md',
      'README.md',
      'CLAUDE.md',
    ]) {
      expect(read(path), path).not.toMatch(OLD_AGENT);
    }
  });

  it('README.md e CLAUDE.md apontam para o guia e para o prompt da nuvem (G16)', () => {
    for (const path of ['README.md', 'CLAUDE.md']) {
      const text = read(path);
      expect(text, path).toContain('docs/TESTING.md');
      expect(text, path).toContain('docs/TESTING-NUVEM.md');
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
  });
  // Etapa Biblioteca Material 3 (MD1): o R16 roda sozinho, pelo cliente MCP por stdio e pelo Playwright.
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

    it('o prompt da nuvem lista os roteiros até o R25', () => {
      expect(prompt).toContain('R0 a R25');
    });
  });

  // Etapa Biblioteca Material 3 (MD5): o R17 roda sozinho, pelo cliente MCP por stdio, a shell e o Playwright.
  describe('R17 — Biblioteca Material 3 (Compose)', () => {
    const guide = read('docs/TESTING.md');
    const r17 = guide.slice(guide.indexOf('### R17 '), guide.indexOf('### R18 '));

    it('está no quadro "Comece aqui", depois do R16 e antes dos roteiros sob demanda', () => {
      expect(guide).toMatch(/^\| 19 +\| R17 — Biblioteca Material 3 \(Compose\)/m);
      expect(guide.indexOf('### R17 ')).toBeGreaterThan(guide.indexOf('### R16 '));
      expect(guide.indexOf('### R17 ')).toBeLessThan(
        guide.indexOf('### Roteiros sob demanda (manuais)'),
      );
      expect(guide).toMatch(/^- R17 usa a pasta própria `tela-m3`/m);
      expect(guide).toContain('`material3-compose.zip` (R17)');
    });

    it('tem os passos R17.1 a R17.42, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r17).keys()];
      expect(codes).toEqual(Array.from({ length: 42 }, (_, i) => `R17.${i + 1}`));
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

    it('o prompt da nuvem lista os roteiros até o R25', () => {
      expect(prompt).toContain('R0 a R25');
    });
  });

  // CL2 (etapa #899): o reteste achou dois erros de texto de roteiro, não da app.
  describe('CL2 — correções de texto do reteste da etapa #899', () => {
    const guide = read('docs/TESTING.md');
    const row = (code: string): string => {
      const line = guide.split('\n').find((l) => l.startsWith(`| ${code} |`));
      expect(line, code).toBeDefined();
      return line ?? '';
    };

    it('R17.30: o ponto do fundo cai dentro do arco do canto, não em (5, 5)', () => {
      const line = row('R17.30');
      // (5, 5) fica fora do raio 12·s do `surface` e dá o branco do container (FFFFFF).
      expect(line).not.toMatch(/px su-app\.png 5 5/);
      expect(line).not.toMatch(/\(5, 5\) `D0BCFF`/);
      expect(line).toMatch(/px su-app\.png 30 30/);
      expect(line).toContain('(30, 30)');
    });

    it('R25.26: o `unid` dos dois `i` (com e sem `family`) usa AREA=20', () => {
      const line = row('R25.26');
      // cada `i` fino é uma mancha pequena: com o AREA padrão (300) o `unid` volta vazio.
      const aside = (color: string): string =>
        new RegExp("'" + color + "'[`]?\\s*\\(([^)]*)\\)").exec(line)?.[1] ?? '';
      expect(aside('#00E5FF')).toContain('AREA=20');
      expect(aside('#FF4081')).toContain('AREA=20');
      // o `W` é uma mancha grande: fica no AREA padrão.
      expect(aside('#76FF03')).not.toContain('AREA');
      expect(aside('#FFAB40')).not.toContain('AREA');
    });
  });

  // Etapa Avisos na especialização (AV4): o R18 roda sozinho, pelo cliente MCP por stdio, a shell e a app.
  describe('R18 — Avisos na especialização', () => {
    const guide = read('docs/TESTING.md');
    const r18 = guide.slice(guide.indexOf('### R18 '), guide.indexOf('### R19 '));

    it('está no quadro "Comece aqui", depois do R17 e antes dos roteiros sob demanda', () => {
      expect(guide).toMatch(/^\| 20 +\| R18 — Avisos na especialização/m);
      expect(guide.indexOf('### R18 ')).toBeGreaterThan(guide.indexOf('### R17 '));
      expect(guide.indexOf('### R18 ')).toBeLessThan(
        guide.indexOf('### Roteiros sob demanda (manuais)'),
      );
      expect(guide).toMatch(/^- R18 usa a pasta própria `avisos`/m);
    });

    it('tem os passos R18.1 a R18.13, em ordem, e nenhum depende do dono', () => {
      const codes = [...stepActions(r18).keys()];
      expect(codes).toEqual(Array.from({ length: 13 }, (_, i) => `R18.${i + 1}`));
      expect(/sem substituto/i.test(r18)).toBe(false);
      expect(r18).not.toContain('[pessoa]');
    });

    it('a especialização do roteiro é uma v10 válida com os quatro kind', async () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r18)?.[1];
      expect(block).toBeDefined();
      const { parseSpecText } = await import('../../src/model');
      const result = parseSpecText(block ?? '');
      expect(result.ok).toBe(true);
      const kinds = new Set(
        [...(block ?? '').matchAll(/"kind": "(\w+)"/g)].map((m) => m[1]),
      );
      expect(kinds).toEqual(new Set(['removed', 'deprecated', 'diverges', 'pending']));
    });

    it('o JSON do roteiro é o mesmo do fixture e2e avisos-demo', () => {
      const block = /```json\n([\s\S]*?)\n```/.exec(r18)?.[1] ?? '';
      const fixture = read('tests/e2e/fixtures/avisos-demo.spec.json');
      expect(JSON.parse(block)).toEqual(JSON.parse(fixture));
    });

    it('o prompt da nuvem lista os roteiros até o R25', () => {
      expect(prompt).toContain('R0 a R25');
    });
  });
});

// Etapa Testes na nuvem (TN1): o prompt do testador da nuvem e as receitas do apêndice A.
describe('docs/TESTING-NUVEM.md (prompt do testador da nuvem)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const { appendixA } = splitAppendixA(read('docs/TESTING.md'));
  const cloudRecipes = appendixA.slice(appendixA.indexOf('**Diálogos nativos na nuvem'));

  it('existe e tem a mensagem de início com branch e commit, nos modos dirigido e completo', () => {
    expect(cloud).not.toBe('');
    expect(cloud).toMatch(
      /Leia `docs\/TESTING-NUVEM\.md` e execute no modo dirigido: R0 e R2\. Branch `[^`]+`, commit `[^`]+`/,
    );
    expect(cloud).toMatch(/modo completo\. Branch `[^`]+`, commit `[^`]+`/);
    expect(cloud).toContain('sempre sem interação');
    expect(cloud).toMatch(/RP[^\n]*RF[^\n]*RA[^\n]*nunca rodam na nuvem/);
  });

  it('manda o testador avisar o coordenador do relato, sem PR', () => {
    expect(cloud).toContain('Coordenador: `session_');
    expect(cloud).toContain('Avise o coordenador');
    expect(cloud).not.toContain('quem mescla é o coordenador');
  });

  it('tem o "Nunca": Enter, filechooser, uma aba e o preview', () => {
    const never = cloud.slice(cloud.indexOf('## Nunca'));
    expect(never).toContain('**Enter**');
    expect(never).toContain('`filechooser`');
    expect(never).toContain('setInputFiles');
    expect(never).toMatch(/Mais de uma aba/);
    expect(never).toMatch(/\*\*preview\*\*/);
    expect(never).toContain('pkill -f chrome');
  });

  it('manda compilar a app e o MCP do commit e servir em localhost:8080', () => {
    expect(cloud).toContain('npm ci && npm run build');
    expect(cloud).toContain('http://localhost:8080');
    expect(cloud).toContain('npm run build:mcp');
    expect(cloud).toContain('--version');
    expect(cloud).toContain('git log -1');
    expect(cloud).toContain('~/mapping-testes/<AAAA-MM-DD>-<alvo>/');
  });

  it('cita o ambiente "Mapping - testes", o script de configuração e o relato como comentário', () => {
    expect(cloud).toContain('Mapping - testes');
    expect(cloud).toContain(
      'for i in 1 2 3 4 5; do apt-get update -q && apt-get install -y -q xdotool at-spi2-core python3-pyatspi openbox imagemagick && break; sleep $((i * 15)); done; true',
    );
    expect(cloud).toMatch(/código `14`/);
    expect(cloud).toContain('LANGUAGE=pt_BR:pt');
    expect(cloud).toContain(
      'Claude Code na nuvem (Xvfb, Playwright por CDP, xdotool, AT-SPI)',
    );
  });

  it('o apêndice A tem as receitas da nuvem e a tabela das cinco ações dos roteiros', () => {
    expect(appendixA).toContain('**Diálogos nativos na nuvem (Xvfb).**');
    expect(appendixA).toContain('docs/TESTING-NUVEM.md');
    for (const tool of [
      'select_folder',
      'open_file',
      'save_file',
      'accept_permission_prompt',
      'cancel_dialog',
    ]) {
      expect(cloudRecipes, tool).toMatch(new RegExp(`^\\| \`${tool}\``, 'm'));
    }
    expect(cloudRecipes).toContain('alt+o');
    expect(cloudRecipes).toContain('alt+s');
    expect(cloudRecipes).toContain('alt+c');
    expect(cloudRecipes).toContain('/usr/bin/python3.12');
    expect(cloudRecipes).toContain('Atspi');
  });

  it('a convenção [pessoa] da seção 8 cita a receita da nuvem', () => {
    expect(read('docs/TESTING.md')).toMatch(
      /^- \*\*\[pessoa\]\*\*[^\n]*Diálogos nativos na nuvem \(Xvfb\)/m,
    );
  });

  it('README.md, CLAUDE.md e docs/TESTING.md apontam para ele', () => {
    for (const path of ['README.md', 'CLAUDE.md', 'docs/TESTING.md']) {
      expect(read(path), path).toContain('TESTING-NUVEM.md');
    }
    expect(read('docs/PROCESS.md')).toContain('Fluxo automatizado');
    expect(read('CLAUDE.md')).toContain('docs/FLOW.md');
  });
});

describe('docs/FLOW.md (mensagens do fluxo automatizado)', () => {
  const flow = read('docs/FLOW.md');

  it('o arquivo existe', () => {
    expect(existsSync('docs/FLOW.md')).toBe(true);
  });

  it('tem as três mensagens do dono e o "pode mesclar"', () => {
    expect(flow).toContain('Crie uma issue roadmap (ou bug, se for defeito):');
    expect(flow).toContain('Detalhe a issue #<roadmap ou bug> como etapa');
    expect(flow).toContain('Implemente a etapa #<etapa> no fluxo automatizado');
    expect(flow).toContain('pode mesclar');
  });

  it('a mensagem da fase aponta o coordenador e o acompanhamento do PR', () => {
    expect(flow).toContain('Coordenador: `<id da sessão do orquestrador>`');
    expect(flow).toContain('subscribe_pr_activity');
    expect(flow).toContain('send_message');
    expect(flow).toContain('Parte de #');
  });

  it('a regra "teste primeiro" está no docs/PROCESS.md e a mensagem da fase aponta para ela', () => {
    expect(read('docs/PROCESS.md')).toContain('**teste primeiro**');
    expect(flow).toContain('"teste primeiro" do `docs/PROCESS.md`');
  });

  it('a mensagem do testador segue o formato do TESTING-NUVEM e a notificação cita PushNotification', () => {
    expect(flow).toMatch(
      /Leia `docs\/TESTING-NUVEM\.md` e execute no modo dirigido: [^\n]+\. Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+\. Coordenador: `/,
    );
    expect(flow).toContain('PushNotification');
  });

  it('o docs/PROCESS.md descreve o fluxo e não tem mais a seção antiga', () => {
    const claude = read('docs/PROCESS.md');
    for (const term of [
      'Orquestrador',
      'PushNotification',
      'pode mesclar',
      'send_later',
    ]) {
      expect(claude, term).toContain(term);
    }
    expect(claude).not.toContain('Rodada dirigida na nuvem');
  });
});

// Etapa Testador mais rápido (TR2): reteste com o R0 reduzido, passada visual pelo que a
// etapa toca e tempo real medido por `mark()` em vez de estimado.
describe('TR2 — R0 reduzido no reteste, passada visual e tempo real', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');

  it('o reteste por achados roda só o R0.1 e os passos de que os achados dependem, não o R0 inteiro', () => {
    const directed = cloud.slice(cloud.indexOf('**Rodada dirigida.**'));
    expect(directed).toMatch(/R0\.1/);
    expect(directed).toMatch(/s[óo] (o )?\*{0,2}R0\.1/i);
    expect(directed).toMatch(/n[ãa]o repita o R0 inteiro/i);
  });

  it('a passada visual vem da linha da mensagem, "nenhuma" vira "não pedida" e o reteste usa só os achados', () => {
    const section = cloud.slice(cloud.indexOf('## O que executar'));
    expect(section).toMatch(/passada visual: `?<lista>`?/i);
    expect(section).toContain('não pedida');
    expect(section).toMatch(/[Rr]eteste[\s\S]{0,200}s[óo] as janelas e os di[áa]logos/);
  });

  it('o tempo real vem de apoio/tempos.log, por mark(), e nunca é estimado', () => {
    expect(cloud).toMatch(/\bmark\(/);
    expect(cloud).toContain('tempos.log');
    expect(cloud).toContain('tempo não medido');
    expect(cloud).toMatch(/nunca estime/i);
  });

  it('o template da seção 10 não pede tempo estimado e aponta para o tempos.log', () => {
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).not.toMatch(/ex\.:\s*R0 25 min/);
    expect(templates).toContain('tempos.log');
  });

  it('a seção 6 marca o tempo (secao6) e o relato copia a saída do `cloud.mjs tempos` (etapa #482, GT3)', () => {
    const start = guide.indexOf('## 6. Instalar o servidor MCP');
    const section6 = guide.slice(start, guide.indexOf('## 7. ', start));
    expect(section6).toContain("mark(apoioDir, 'secao6', 'start')");
    expect(section6).toContain("mark(apoioDir, 'secao6', 'end')");
    expect(cloud).toMatch(/cloud\.mjs tempos/);
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).toMatch(/cloud\.mjs tempos/);
  });

  it('as duas mensagens do testador no docs/FLOW.md têm a linha da passada visual', () => {
    const testerSection = flow.slice(flow.indexOf('## Para o testador'));
    const occurrences = testerSection.split(/[Pp]assada visual/).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('a mensagem de reteste do FLOW.md cita o R0 reduzido ao R0.1', () => {
    const retest = flow.slice(
      flow.indexOf('Reteste, depois da correção'),
      flow.indexOf('## Rodada completa em 5 blocos'),
    );
    expect(retest).toMatch(/R0\.1/);
    // TR3 (decisão 13): a mensagem diz o R0 por extenso, para não divergir do guia.
    expect(retest).toContain('R0 só o R0.1 e os passos de que os achados dependem');
  });

  it('o docs/PROCESS.md manda o orquestrador passar a passada visual ao testador e a sub-issue da última fase trazer a linha', () => {
    expect(claude).toMatch(/os roteiros e a passada visual/);
    expect(claude).toContain('Passada visual:');
  });
});

// Etapa Testador mais rápido (TR3): preparos que não sobrescrevem e mensagens alinhadas.
describe('TR3 — preparos que não sobrescrevem e mensagens alinhadas', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const flow = read('docs/FLOW.md');

  /** Os blocos de código cercados da seção 8 (do "## 8." ao "## 9."). */
  function section8Blocks(): string[] {
    const start = guide.indexOf('## 8. Roteiros');
    const end = guide.indexOf('## 9. ', start);
    const blocks: string[] = [];
    let current: string[] | null = null;
    for (const line of guide.slice(start, end).split('\n')) {
      if (/^\s*```/.test(line)) {
        if (current) blocks.push(current.join('\n'));
        current = current ? null : [];
      } else if (current) current.push(line);
    }
    return blocks;
  }

  // Cria a pasta do projeto ou grava o `mapping.json` dela.
  const CREATES_PROJECT =
    /mkdir -p "\$PROJ"|> "\$PROJ\/mapping\.json"|v15\.py"? "\$PROJ"|unzip [^\n]*-d "\$PROJ"|cat > \w+\/mapping\.json/;

  it('todo bloco de preparo que cria a pasta do projeto ou grava o mapping.json tem a guarda, sem rm (decisão 12)', () => {
    const creators = section8Blocks().filter((b) => CREATES_PROJECT.test(b));
    expect(creators.length).toBeGreaterThanOrEqual(3);
    for (const block of creators) {
      expect(block).toContain('já existe: o preparo já rodou; não rode de novo');
      expect(block).toMatch(/if \[ -e [^\]]+\]; then/);
      expect(block).not.toMatch(/\brm\b.*(\$PROJ|migracao13)/);
    }
  });

  it('a mensagem da dirigida diz "R0 inteiro primeiro" e a do TESTING-NUVEM vale quando divergir do guia (decisão 13)', () => {
    const tester = flow.slice(
      flow.indexOf('## Para o testador'),
      flow.indexOf('Reteste, depois da correção'),
    );
    expect(tester).toContain('R0 inteiro primeiro');
    expect(cloud).toMatch(/mensagem[^\n]*vale[^\n]*diverg/i);
  });

  it('toda mensagem de dirigida, de grupo e de bloco traz a lacuna da tag da release, e o prompt diz o que fazer com "sem R21" (decisão 14)', () => {
    const tester = flow.slice(
      flow.indexOf('## Para o testador'),
      flow.indexOf('### Rodada avulsa'),
    );
    const messages = tester.match(/```text\n[\s\S]*?```/g) ?? [];
    expect(messages.length).toBe(4);
    for (const m of messages) {
      expect(m).toContain('Tag da release: <mcp-v…-rc.n, ou "sem R21">');
    }
    // A regra moveu-se para o `consulta.regras` (TE1); o prompt aponta para ela e diz o essencial.
    expect(cloud).toContain('cloud.mjs secao consulta.regras');
    const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');
    const r21 = consulta.slice(
      consulta.indexOf('**R21 e a tag da release.**'),
      consulta.indexOf('## Histórico dos blocos'),
    );
    expect(r21).toContain('sem R21');
    expect(r21).toMatch(/sem R21[^\n]*(não execute|pule|fora)/i);
  });
});

describe('TS2 — prompt com o guia da rodada, primeiro plano, state() e relato agrupado', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const guide = read('docs/TESTING.md');
  const { appendixA } = splitAppendixA(guide);
  const first10 = cloud.slice(
    cloud.indexOf('## Primeiros 10 minutos'),
    cloud.indexOf('## Ambiente'),
  );
  const howTo = cloud.slice(
    cloud.indexOf('## Como agir'),
    cloud.indexOf('## O que executar'),
  );

  it('manda gerar o guia da rodada e não ler o docs/TESTING.md inteiro', () => {
    expect(first10).toContain('node scripts/testing/round-guide.mjs');
    expect(first10).toContain('apoio/guia.md');
    expect(first10).toMatch(/`all`/);
    expect(first10).toMatch(/Grep/);
    expect(first10).not.toMatch(/docs\/TESTING\.md` inteiro/);
    expect(cloud).not.toMatch(/leia os dois inteiros/);
  });

  it('GL2 — lê a base do guia no começo e os roteiros sob demanda, pelo cloud.mjs passo (#1232, decisão 10)', () => {
    const item3 = first10.slice(first10.indexOf('\n3. '), first10.indexOf('\n4. '));
    expect(first10).toContain('apoio/guia-base.md');
    expect(first10).toContain('guia-indice.tsv');
    expect(first10).toContain('cloud.mjs passo');
    expect(first10).not.toMatch(/Leia o `apoio\/guia\.md` inteiro/);
    expect(cloud.slice(0, cloud.indexOf('## Papel e limites'))).toMatch(
      /guia-base da rodada[^\n]*roteiros e as seções sob demanda/,
    );
    expect(item3).toMatch(
      /guia-base\.md` inteiro\*\*, em pedaços abaixo de 25 mil tokens/,
    );
    expect(item3).toMatch(
      /cloud\.mjs secao <chave…>` \*\*na hora que a linha dela indica/,
    );
    expect(item3).toMatch(/cloud\.mjs passo <Rn>` antes de começá-lo/);
    expect(item3).toMatch(/lotes de até 8 \(`cloud\.mjs passo <Rn\.a>-<Rn\.b>`\)/);
    expect(item3).toMatch(/`guia\.md` serve só para `Grep`/);
    expect(item3).toMatch(/`guia\.md`, `guia-base\.md` e `guia-indice\.tsv`/);
    expect(first10).toMatch(/item 3 gera o \*\*guia da rodada\*\* e a base/);
  });

  it('GL2 — o "Como agir" lista o passo e manda o esperado vir do passo impresso na hora', () => {
    expect(howTo).toMatch(/`run`, `help`, `passo`, `connect`/);
    expect(howTo).toMatch(
      /esperado de um passo vem do `cloud\.mjs passo` impresso na hora, não da memória/,
    );
  });

  it('GL2 — os itens 1 dos modos de bloco e de grupo citam o guia-base e o passo, e o relato registra o que o passo não deu', () => {
    const withConsulta = `${cloud}\n${read('docs/TESTING-NUVEM-CONSULTA.md')}`;
    for (const heading of [
      '**Modo "completo, bloco k de 5".**',
      '**Modo "dirigido, grupo k de n".**',
    ]) {
      const from = withConsulta.indexOf(heading);
      const item1 = withConsulta.slice(
        withConsulta.indexOf('1. ', from),
        withConsulta.indexOf('\n2. ', from),
      );
      expect(item1).toMatch(
        /leia o `guia-base\.md` inteiro e peça os roteiros pelo `passo` e as seções sob demanda pelo `secao` \(item 3\)/,
      );
    }
    const relato = cloud.slice(cloud.indexOf('## Relato'));
    expect(relato).toMatch(/`passo` não deu o que o passo precisava/);
    expect(relato).toMatch(/quantas chamadas ao `passo` e quantas ao `secao`/);
  });

  it('o cloud-up.sh roda em primeiro plano, com timeout de 600000 ms e sem run_in_background', () => {
    expect(first10).toMatch(/primeiro plano/);
    expect(first10).toContain('run_in_background');
    expect(first10).toContain('600000');
  });

  it('todo script de passo termina com state(), e a captura fica para o canvas, os ❌ e a passada visual', () => {
    expect(howTo).toContain('formatState(await state(page, apoioDir, { projectDir }))');
    expect(howTo).toContain('connect()');
    expect(howTo).toMatch(/canvas/);
    expect(howTo).toContain('60000');
    expect(howTo).toContain('{ timeout }');
  });

  it('todo script de passo vai pelo cloud.mjs run, com exemplo de heredoc, e a lista inclui run e help (#1148, decisão 6)', () => {
    expect(howTo).toContain('cloud.mjs run');
    expect(howTo).toContain("<<'JS'");
    expect(howTo).toMatch(/`run`, `help`, `passo`, `connect`/);
    expect(howTo).toMatch(/O que atrapalhou/);
    expect(guide).toContain("<<'JS'");
    expect(cloud).toContain('apoio/env.sh');
    expect(`${cloud}${guide}`).not.toMatch(/apoio\/env\b(?!\.sh)/);
  });

  it('TE2 — o "Como agir", o "Conferir e registrar" e o "Relato" descrevem o servidor, o check, o ctx e a Reprodução (#1533, decisões 6 a 8)', () => {
    expect(howTo).toContain('um `run` por lote de até 8 passos');
    for (const text of [
      'cloud.mjs serve',
      '`ctx`',
      '`check(rótulo, condição, detalhe?)`',
      'run --novo',
      'paletteDrag(page, tipo, para, { capture, grupo })',
    ]) {
      expect(howTo, text).toContain(text);
    }
    const conferir = cloud.slice(
      cloud.indexOf('## Conferir e registrar'),
      cloud.indexOf('## Relato'),
    );
    expect(conferir).toContain('**Reprodução**');
    expect(conferir).toContain('apoio/runs/<n>.js');
    expect(conferir).toContain('apoio/runs.log');
    const relato = cloud.slice(cloud.indexOf('## Relato'));
    expect(relato).toContain('**Reprodução**');
    expect(relato).toMatch(/total de `run` e de checks/);
  });

  it('o aviso ao coordenador usa o send_message do claude-code-remote, não o SendMessage', () => {
    expect(cloud).toMatch(/`send_message`[^\n]*claude-code-remote/);
    expect(cloud).toMatch(/n[ãa]o o `SendMessage`/);
  });

  it('o relato agrupa os ✅ e o template tem a regra da faixa', () => {
    expect(cloud.slice(cloud.indexOf('## Relato'))).toMatch(
      /ao? mesm[oa] roteiro[^\n]*✅|faixa/i,
    );
    const templates = guide.slice(guide.indexOf('## 10. Templates'));
    expect(templates).toContain('R11.1 a R11.10');
    expect(templates).toMatch(/faixa/);
    expect(templates).toMatch(/mesmo achado de origem/);
    expect(templates).toMatch(/Resumo[^\n]*por passo/);
  });

  it('o apêndice A: receita 4 descreve o connect() e o state(); receita 2 limita o source à shell', () => {
    const recipe4 = appendixA.slice(
      appendixA.indexOf('**Receita 4 (nuvem), a página'),
      appendixA.indexOf('**Receita 5 (nuvem), seletor'),
    );
    expect(recipe4).toContain('apoio/env.sh');
    expect(recipe4).toMatch(/5 s/);
    expect(recipe4).toContain('state(');
    const recipe2 = appendixA.slice(
      appendixA.indexOf('**Receita 2 (nuvem)'),
      appendixA.indexOf('**Receita 3 (nuvem)'),
    );
    expect(recipe2).toMatch(/source "\$S\/env\.sh"[^\n]*(xdotool|shell)/);
    expect(recipe2).toMatch(/auxiliares/);
  });

  it('o prompt manda gerar o guia da rodada com os roteiros do recorte (R0 R2 R4 R11 gera mesmo)', () => {
    const out = `${process.env.TMPDIR ?? '/tmp'}/guia-ts2-test.md`;
    execFileSync('node', [
      'scripts/testing/round-guide.mjs',
      'R0',
      'R2',
      'R4',
      'R11',
      '--out',
      out,
    ]);
    const generated = read(out);
    expect(generated).toContain('## Apêndice A');
    expect(generated).toContain('Relato de uma rodada de teste');
    expect(generated.length).toBeLessThan(guide.length / 2);
    expect(read(out.replace(/\.md$/, '-base.md'))).toContain('cloud.mjs passo R4');
    expect(read(out.replace(/\.md$/, '-indice.tsv'))).toMatch(
      /^tipo\tchave\tini\tfim\ttítulo/,
    );
  });
});

describe('rodada completa em 5 blocos (etapas #424 e #841)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');
  const guide = read('docs/TESTING.md');

  it('o prompt tem o modo "completo, bloco k de 5", o R0 inteiro primeiro e o guia da rodada do bloco', () => {
    expect(cloud).toContain('execute o modo completo, bloco k de 5');
    expect(cloud).toMatch(/## Rodada completa em blocos/);
    expect(cloud).toMatch(/R0 inteiro/);
    expect(cloud).toMatch(/guia da rodada[^\n]*roteiros do bloco/);
    expect(cloud).toMatch(/o "modo completo" sem bloco continua/i);
  });

  it('o relato do bloco: Modo, primeira linha, achados k.n e aviso ao coordenador com o bloco', () => {
    expect(cloud).toContain('Modo: completo, bloco k de 5 (<roteiros>)');
    expect(cloud).toContain('Rodada completa — bloco k de 5');
    expect(cloud).toMatch(/`k\.1`, `k\.2`/);
    expect(cloud).toMatch(/aviso ao coordenador[^\n]*bloco/i);
    expect(cloud).toMatch(/Parte i de n/);
  });

  it('o template do relato (seção 10) aceita o modo de bloco e a numeração k.n', () => {
    expect(guide).toContain('completo, bloco k de 5');
    expect(guide).toMatch(/k\.n/);
    expect(guide).toMatch(/TESTING-NUVEM\.md`, "Rodada completa em blocos"/);
  });

  it('o FLOW.md tem a mensagem do testador por bloco, a avulsa e o template do resumo', () => {
    expect(flow).toMatch(
      /execute o modo completo, bloco <k> de 5\.[^\n]*Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+\. Coordenador: `/,
    );
    expect(flow).toContain('Testador — <alvo>, bloco <k> de 5');
    expect(flow).toContain(
      'Rode a rodada completa do testador em blocos no branch `<branch>`, commit `<hash>`. Resumo e relatos na issue #<N>.',
    );
    expect(flow).toMatch(/## Resumo da rodada em blocos/);
    for (const parte of [
      'Rodada completa em blocos — resumo',
      'não executado',
      'tempo de parede',
      'Achados por severidade',
      'Relatos:',
    ]) {
      expect(flow, parte).toContain(parte);
    }
    expect(flow).toMatch(/não reescreve os relatos/i);
  });

  it('o FLOW.md: conferência de reserva de 60 min, 5 avisos, reteste numa sessão só e a avulsa abre bug por ❌', () => {
    expect(flow).toMatch(/60 min/);
    expect(flow).toMatch(/cinco avisos/i);
    expect(flow).toMatch(/uma sessão só/i);
    expect(flow).toMatch(/issue `bug`[^\n]*duplicadas/i);
  });

  it('o docs/PROCESS.md: o orquestrador cria as 5 sessões quando a sub-issue pede a rodada completa', () => {
    expect(claude).toMatch(/rodada completa[^\n]*5 sessões/);
    expect(claude).toContain('bloco k de 5');
    expect(claude).toMatch(/\bk\.n\b/);
  });
});

describe('.prettierrc.json (tabelas compactas, etapa #478)', () => {
  it('tem um override com proseWrap "never" só para o guia de teste e o registro do DS', () => {
    const config = JSON.parse(read('.prettierrc.json')) as {
      proseWrap?: string;
      overrides?: { files: string | string[]; options: { proseWrap?: string } }[];
    };
    expect(config.proseWrap).toBeUndefined();
    expect(config.overrides).toHaveLength(1);
    const [override] = config.overrides!;
    expect([override!.files].flat().sort()).toEqual([
      'docs/DESIGN-SYSTEM.md',
      'docs/TESTING.md',
    ]);
    expect(override!.options.proseWrap).toBe('never');
  });
});

describe('GT2 — guia acertado com a app (etapa #482)', () => {
  const guide = read('docs/TESTING.md');

  /** Item numerado do "Preparo do R3.8…" que começa com `prefix`. */
  const prepStep = (prefix: string): string =>
    guide.split('\n').find((l) => l.startsWith(prefix)) ?? '';

  it('o preparo do R3.8 e do R3.8b troca containers/containerId por images/imageId, como o v8 e o v10 de verdade', () => {
    for (const prefix of [
      '3. Fora da app: em `migracao/mapping.json`',
      '5. Fora da app, em `migracao10/mapping.json`',
    ]) {
      const step = prepStep(prefix);
      expect(step, prefix).not.toBe('');
      expect(step, prefix).toContain('"containers"');
      expect(step, prefix).toContain('"images"');
      expect(step, prefix).toContain('imageId');
    }
  });

  it('R3.1: a versão da Notas é a do notas.spec.json', () => {
    const spec = JSON.parse(read('libraries/notas/notas.spec.json')) as {
      version: number;
    };
    const row = guide.split('\n').find((l) => /^\| R3\.1 \|/.test(l)) ?? '';
    expect(row).toContain(`**Notas** (versão ${spec.version})`);
  });

  it('apêndice A: "Seletores e nomes que enganam" lista só data-window que existem em src/', () => {
    const { appendixA } = splitAppendixA(guide);
    const block = /### Seletores e nomes que enganam([\s\S]*?)(?=\n### |\n## |$)/.exec(
      appendixA,
    )?.[1];
    expect(block).toBeDefined();
    const listed = /\[data-window=([a-z|]+)\]/.exec(block!)?.[1]?.split('|') ?? [];
    expect(listed.length).toBeGreaterThanOrEqual(7);
    const source = read('src/store/toolWindows.ts');
    for (const id of listed) expect(source, id).toContain(`'${id}'`);
    for (const word of [
      'alertdialog',
      'button.tree-item',
      'page.mouse',
      'Novo container',
      '/^Revisar/',
    ]) {
      expect(block, word).toContain(word);
    }
  });

  it('R11.9: cita todo atalho Ctrl+Shift+<n> das janelas (WINDOW_NUMBER de toolWindows.ts)', () => {
    const source = read('src/store/toolWindows.ts');
    const numbers = [
      ...(/WINDOW_NUMBER[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '').matchAll(
        /:\s*(\d+),/g,
      ),
    ].map((m) => m[1]);
    expect(numbers.length).toBeGreaterThanOrEqual(9);
    const row = guide.split('\n').find((l) => /^\| R11\.9 \|/.test(l)) ?? '';
    expect(row).not.toBe('');
    for (const n of numbers) {
      expect(row, `Ctrl+Shift+${n}`).toMatch(
        new RegExp(`Ctrl\\+Shift\\+${n}\\b|\`${n}\`(?![\\d])`),
      );
    }
  });
});

// Etapa #1148 (TR4, decisões 15 a 20): rodada dirigida em grupos e reteste junto.
describe('TR4 — rodada dirigida em grupos e reteste junto', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const flow = read('docs/FLOW.md');
  const claude = read('docs/PROCESS.md');
  const skill = read('.claude/skills/implementar-fila/SKILL.md');

  it('o prompt tem o limite (40 passos sem o R0, até 5 sessões) e o modo "grupo k de n"', () => {
    // O resumo fica no prompt; o corpo moveu-se para o `consulta.grupos` (TE1).
    const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');
    const summary = cloud.slice(
      cloud.indexOf('## Rodada dirigida em grupos'),
      cloud.indexOf('## Conferir e registrar'),
    );
    expect(summary).toMatch(/passa de \*\*40 passos\*\*/);
    expect(summary).toMatch(/no máximo \*\*5 sessões/);
    expect(summary).toContain('cloud.mjs secao consulta.grupos');
    const section = consulta.slice(
      consulta.indexOf('## Rodada dirigida em grupos'),
      consulta.indexOf('## Passada visual'),
    );
    expect(section).toMatch(/passa de \*\*40 passos\*\*/);
    expect(section).toMatch(/no máximo \*\*5 sessões/);
    expect(section).toContain('round-guide.mjs --grupos');
    expect(section).toContain('execute no modo dirigido, grupo k de n');
    expect(`${cloud}\n${consulta}`).toContain(
      'Modo: dirigido, grupo k de n (<roteiros>)',
    );
    expect(section).toContain('Rodada dirigida — grupo k de n');
    expect(section).toMatch(/aviso ao coordenador[^\n]*grupo/i);
    expect(section).toMatch(/grupo 1[^\n]*R0 inteiro/);
    expect(section).toMatch(/R0\.1/);
  });

  it('o FLOW.md tem a mensagem por grupo, o título, a reserva de 60 min e o resumo com "Grupo"', () => {
    expect(flow).toMatch(
      /execute no modo dirigido, grupo <k> de <n>:[^\n]*Branch `[^`]+`, commit `[^`]+`\. Relato na sub-issue #[^\n]+Tag da release:[^\n]+Coordenador: `/,
    );
    expect(flow).toContain('Testador — <alvo>, grupo <k> de <n>');
    const section = flow.slice(
      flow.indexOf('## Rodada dirigida em grupos'),
      flow.indexOf('## Reteste junto'),
    );
    expect(section).toMatch(/60 min/);
    expect(section).toMatch(/n avisos/);
    expect(section).toMatch(/"Grupo" no lugar de "Bloco"/);
  });

  it('o reteste é uma sessão só, com os achados de todos os grupos ou blocos, e a correção mesclada entra', () => {
    const section = flow.slice(flow.indexOf('## Reteste junto'));
    expect(section).toMatch(/uma sessão só/);
    expect(section).toMatch(/todos\*\* os grupos ou blocos/);
    expect(section).toMatch(/enquanto o reteste ainda não começou/);
  });

  it('o docs/PROCESS.md e a skill implementar-fila citam a rodada em grupos e o reteste junto', () => {
    expect(claude).toContain('round-guide.mjs --grupos');
    expect(claude).toMatch(
      /numa sessão só\*\* com os achados de todos os grupos ou blocos/,
    );
    expect(claude).toMatch(/grupo k de n/);
    expect(skill).toContain('round-guide.mjs --grupos');
    expect(skill).toMatch(
      /numa sessão só\*\* com os achados de todos os grupos ou blocos/,
    );
  });
});

describe('CL1 — roteiro do R9.24 a R9.28 (etapa #701)', () => {
  const rows = read('docs/TESTING.md')
    .split('\n')
    .filter((l) => /^\| R9\.2[4-8] /.test(l));
  const row = (id: string): string => rows.find((l) => l.startsWith(`| ${id} `)) ?? '';

  it('a Column do R9.25 e do R9.26 cabe no Cartão de 300 × 200 do R9.18 (x 20 + largura ≤ 300)', () => {
    for (const id of ['R9.25', 'R9.26']) {
      const m = /Column com `rect` `\{"x":(\d+),"y":\d+,"width":(\d+),/.exec(row(id));
      expect(m, id).not.toBeNull();
      expect(Number(m?.[1]) + Number(m?.[2]), id).toBeLessThanOrEqual(300);
    }
  });

  it('o R9.28 (c) separa invalid-ref (???) de not-found (referência bem formada que não existe)', () => {
    const r = row('R9.28');
    expect(r).toMatch(/`inside` `\?\?\?`/);
    expect(r).toMatch(/`inside` `mapping:\/\/telas\/m\/inexistente`/);
    expect(r).toMatch(/\(c1\) `invalid-ref`; \(c2\) `not-found`/);
  });

  it('o R9.24 não espera membership (só lista quem mudou de pai)', () => {
    expect(row('R9.24')).not.toBe('');
    expect(row('R9.24')).not.toContain('membership');
  });
});

describe('D2 — roteiro da densidade (R9.29 a R9.31, etapa #1085)', () => {
  const rows = read('docs/TESTING.md')
    .split('\n')
    .filter((l) => /^\| R9\.(29|30|31) /.test(l));
  const row = (id: string): string => rows.find((l) => l.startsWith(`| ${id} `)) ?? '';

  it('os três passos existem e não pedem o MCP (a nuvem faz sozinha)', () => {
    for (const id of ['R9.29', 'R9.30', 'R9.31']) expect(row(id), id).not.toBe('');
    expect(rows.join('\n')).not.toMatch(/stdio|plan_changes/);
  });

  it('os textos citados são os da interface (pt-BR)', () => {
    expect(row('R9.29')).toContain('Sugestão: 3x (Celular 360 × 800)');
    expect(ptBR['density.suggestion']).toBe('Sugestão: {value}x ({name})');
    expect(row('R9.31')).toContain(ptBR['density.error']);
    expect(row('R9.29')).toContain(ptBR['density.apply']);
    expect(row('R9.31')).toContain(ptBR['density.custom']);
  });

  it('o botão do R9.30 mede 174 × 120 (o minSize 58 × 40 × 3) e nasce 264 × 120 (88 × 40 × 3)', () => {
    const r = row('R9.30');
    expect(r).toContain('`174`');
    expect(r).toContain('`120`');
    expect(r).toContain('`264`');
    expect(58 * 3).toBe(174);
    expect(88 * 3).toBe(264);
  });
});

// Etapa #1533 (TE1, decisão 4): o prompt do testador é lido inteiro; o que só alguns leem fica no CONSULTA.
describe('docs/TESTING-NUVEM.md enxuto e TESTING-NUVEM-CONSULTA.md (#1533, TE1)', () => {
  const cloud = read('docs/TESTING-NUVEM.md');
  const consulta = read('docs/TESTING-NUVEM-CONSULTA.md');

  it('o TESTING-NUVEM.md tem até 32.000 caracteres', () => {
    expect(cloud.length).toBeLessThanOrEqual(32_000);
  });

  it('o CONSULTA traz as três chaves e o TESTING-NUVEM.md aponta para o secao de cada uma', () => {
    for (const [key, title] of [
      ['consulta.grupos', '## Rodada dirigida em grupos'],
      ['consulta.passada', '## Passada visual'],
      ['consulta.regras', '## Regras de exceção'],
      ['consulta.historico', '## Histórico dos blocos'],
    ] as const) {
      expect(consulta, key).toContain(title);
      expect(cloud, key).toContain(`cloud.mjs secao ${key}`);
    }
  });

  it('os títulos que o FLOW e o PROCESS linkam continuam no TESTING-NUVEM.md', () => {
    expect(cloud).toMatch(/^## Rodada completa em blocos$/m);
    expect(cloud).toMatch(/^## Rodada dirigida em grupos$/m);
  });
});

// Etapa #1533 (TE3, decisão 14 (1) e (2)): rótulos da tela no R25 e o R1.21a sem o item (8).
describe('TE3 — R1.21a e R25.28/30/32 (#1489)', () => {
  const guide = readFileSync('docs/TESTING.md', 'utf8');
  const row = (code: string): string =>
    guide.split('\n').find((l) => l.startsWith(`| ${code} |`)) ?? '';

  it('R1.21a perde o item (8): fica a frase do R15.3 e do R15.11', () => {
    const r = row('R1.21a');
    expect(r).not.toContain('(8)');
    expect(r).toContain(
      'A faixa de consentimento é conferida no R15.3 e no R15.11, que já conferem o foco.',
    );
  });

  it('R25.28, R25.30 e R25.32 dizem Claro, Escuro e Seguir o projeto, com o valor gravado entre parênteses', () => {
    const r30 = row('R25.30');
    expect(r30).toContain('escolha **Claro** (grava `light`)');
    expect(r30).toContain('**Seguir o projeto**');
    expect(r30).toContain('depois **Claro** e **Escuro**');
    expect(r30).not.toMatch(/depois `light` e `dark`/);
    const r32 = row('R25.32');
    expect(r32).toContain('**Claro** (`light`');
    expect(r32).toContain('**Escuro** (`dark`)');
    expect(r32).not.toMatch(/de volta para `light`/);
    expect(row('R25.28')).toContain(
      '**Claro** e **Escuro** (os valores gravados são `light` e `dark`',
    );
  });
});

describe('TE3 — reteste restrito, 300 mil e Árvore de marcações (#1533, decisões 11, 13 e 14)', () => {
  const cloud = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const consulta = readFileSync('docs/TESTING-NUVEM-CONSULTA.md', 'utf8');

  it('o modo 1 e o "R0 no reteste" falam das faixas e da Reprodução', () => {
    expect(cloud).toContain('**reteste restrito**');
    expect(cloud).toContain('round-guide.mjs R12.10d-R12.10f');
    expect(cloud).toMatch(/rode primeiro a \*\*Reprodução\*\* de cada achado/);
    expect(cloud).toMatch(/R0 no reteste[^\n]*\n?[^\n]*a faixa e a Reprodução/);
    expect(consulta).toMatch(/Retestes juntos[^\n]*faixas[^\n]*Reprodução/);
  });

  it('a regra dos 300 mil de contexto está em "Rodada completa em blocos"', () => {
    const blocos = cloud.slice(cloud.indexOf('## Rodada completa em blocos'));
    expect(blocos).toMatch(/\*\*300 mil\*\*/);
    expect(blocos).toMatch(/quem o garante é ela, com os subagentes por lote/);
    expect(blocos).toContain('Teto de contexto do testador');
    // TC2 (#1639, decisão 8): o excesso se registra, sem mover roteiros nem chamar o dono.
    expect(blocos).not.toContain('move roteiros entre os 5 blocos');
    expect(blocos).not.toMatch(/Contexto até 300 mil[^\n]*chama o dono/);
  });

  it('o "Como agir" cita o botão "Árvore de marcações" e o openWindow', () => {
    expect(cloud).toContain('**Árvore de marcações**, não "Árvore"');
    expect(cloud).toContain('só com `openWindow(page, id)`');
  });
});
