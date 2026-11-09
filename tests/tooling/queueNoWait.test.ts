// @vitest-environment node
// Fase FS1 (etapa #1322): a fila sem espera. Confere, lendo os arquivos do fluxo de entrega, que o
// skill da fila escolhe a versão do MCP no fechamento, roda a correção dependente como `bug`
// `ready`, não conta etapa parada como vaga, confere os `bug` dela no fim e fecha durante o CI, e
// que o painel não mantém mais a tabela de issues.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FILA = '.claude/skills/implementar-fila';
const read = (p: string): string => readFileSync(p, 'utf8');
const fila = read(`${FILA}/SKILL.md`);
const detalhar = read('.claude/skills/detalhar-backlog/SKILL.md');
const flow = read('docs/FLOW.md');
const process = read('docs/PROCESS.md');
const page = read(`${FILA}/painel/index.html`);
const painelPy = read(`${FILA}/painel/painel.py`);

/** Texto de um cabeçalho (`## ` ou `### `) até o próximo do mesmo nível ou acima. */
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start < 0) throw new Error(`seção não achada: ${heading}`);
  const level = heading.match(/^#+/)![0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i]!.match(/^(#+) /);
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('implementar-fila: versão do MCP no fechamento (decisão 1)', () => {
  const regras = section(fila, '## Regras desta fila');
  const regra3 = regras.slice(regras.indexOf('\n3. '));

  it('a regra 3 diz que a versão é provisória e escolhida no fechamento', () => {
    expect(regra3).toContain('provisória');
    expect(regra3).toContain('escolhida no fechamento');
    expect(regra3).toContain('git merge origin/main');
    expect(regra3).toContain('tests/mcp/version.test.ts');
    expect(regra3).not.toContain('fixada ao começar');
  });

  it('o passo 1 de "Por etapa" usa a versão provisória, não fixa', () => {
    const porEtapa = section(fila, '## 3. Por etapa');
    expect(porEtapa).toContain('versão provisória do MCP');
    expect(porEtapa).not.toContain('Fixe a versão do MCP');
  });

  it('o fechamento escolhe a versão antes do push e o Merge confere o SERVER_VERSION da origin/main', () => {
    const porEtapa = section(fila, '## 3. Por etapa');
    expect(porEtapa).toContain('SERVER_VERSION');
    const merge = section(fila, '## Merge');
    expect(merge).toContain('SERVER_VERSION');
    expect(merge).toContain('origin/main');
  });
});

describe('implementar-fila: paralelo e ordem (decisões 2 e 3)', () => {
  const paralelo = section(fila, '## Paralelo');

  it('"Paralelo" não tem mais a cláusula do MCP', () => {
    expect(paralelo).not.toMatch(/não mudam o MCP/);
    expect(paralelo).toMatch(/não mudam o schema ao mesmo tempo/);
    expect(paralelo).toContain('mcp/version.ts');
  });

  it('só `em andamento` ocupa vaga e os "Toca em:" se comparam também com as etapas paradas', () => {
    expect(paralelo).toContain('só as etapas `em andamento` ocupam vaga');
    expect(paralelo).toContain('esperando dono');
    expect(paralelo).toMatch(/paradas/);
  });

  it('a "Ordem" não fala mais em ordem das versões', () => {
    expect(section(fila, '## 2. Fila')).not.toContain('ordem das versões');
  });
});

describe('implementar-fila: correção dependente vira bug ready (decisões 4 e 5)', () => {
  const porEtapa = section(fila, '## 3. Por etapa');
  const mudancas = section(fila, '## Mudanças na fila durante a execução');

  it('o passo de correção separa os achados que dependem de outro épico e cria o `bug` `ready`', () => {
    expect(porEtapa).toContain('depende de #N');
    expect(porEtapa).toContain('(correção que depende de #N)');
    expect(porEtapa).toContain('**Depende de:** #N');
    expect(porEtapa).toContain('severity: high');
    expect(porEtapa).toContain('`kind=bug`');
  });

  it('o `bug` da própria fila entra mesmo com a lista `#n ...`', () => {
    expect(mudancas).toContain('kind=bug');
    expect(mudancas).toContain('lista `#n ...`');
  });
});

describe('implementar-fila: o Fim confere os bug da fila (decisão 6)', () => {
  const fim = section(fila, '## Fim');

  it('confere as linhas kind=bug antes de encerrar', () => {
    expect(fim).toContain('kind=bug');
    expect(fim).toContain('aguardando');
    expect(fim).toContain('falhou');
    expect(fim).toContain('esperando dono');
  });
});

describe('detalhar-backlog: Depende de (decisão 7)', () => {
  it('exige Depende de sobre as ready e in-progress com arquivo em comum', () => {
    expect(detalhar).toContain('`ready` ou `in-progress`');
    expect(detalhar).toContain('arquivo em comum');
    expect(detalhar).toContain('mcp/version.ts');
    expect(detalhar).not.toContain('fixado quando o épico começa');
    expect(detalhar).toContain('escolhido no fechamento do épico');
  });

  it('o coordenador compara as prontas da rodada ao receber cada PRONTA', () => {
    const durante = section(detalhar, '## 4. Durante');
    expect(durante).toContain('Sobreposição');
    expect(durante).toContain('Depende de');
    expect(durante).toContain('ORDEM');
  });
});

describe('implementar-fila: fechamento durante o CI (decisão 9)', () => {
  it('as issues do que ficou para depois e o comentário saem por um subagente durante o CI', () => {
    const porEtapa = section(fila, '## 3. Por etapa');
    expect(porEtapa).toContain('durante o CI');
    expect(porEtapa).toContain('Closes #<etapa>');
    const merge = section(fila, '## Merge');
    expect(merge).toContain('não espera');
    expect(merge).toContain('subagente');
  });
});

describe('docs: processo e mensagens (decisão 8)', () => {
  it('o item "Versão do MCP por épico" diz que a versão é provisória até o fechamento', () => {
    expect(process).toContain('provisória até o fechamento');
    expect(process).toContain('próxima livre na `origin/main`');
  });

  it('o FLOW cita as novidades da fila e do detalhamento', () => {
    expect(flow).toContain('versão do MCP no fechamento');
    expect(flow).toContain('`Depende de` cobre as `ready` e `in-progress`');
    const correcao = section(flow, '## Fase de correção');
    expect(correcao).toContain('depende de #N');
    expect(correcao).toContain('`bug` `ready`');
  });
});

describe('painel sem a tabela de issues (decisão 10)', () => {
  it('a página troca a seção pelo cartão com o link da busca do GitHub', () => {
    expect(page).not.toContain('Bugs e roadmaps por etapa');
    expect(page).not.toContain('mp-issues');
    expect(page).toContain('Issues criadas pela fila');
    expect(page).toContain(
      'https://github.com/fabianofranca/mapping/issues?q=is%3Aissue+is%3Aopen+%22Origem%3A+etapa%22',
    );
  });

  it('o painel.py não tem o subcomando issue nem o issues.json', () => {
    expect(painelPy).not.toContain('issues.json');
    expect(painelPy).not.toContain('cmd_issue');
    const dir = mkdtempSync(path.join(tmpdir(), 'painel-nw-'));
    try {
      execFileSync('python3', [`${FILA}/painel/painel.py`, 'init', dir]);
      expect(existsSync(path.join(dir, 'issues.json'))).toBe(false);
      expect(() =>
        execFileSync('python3', [`${FILA}/painel/painel.py`, 'issue', dir, 'number=#1'], {
          stdio: 'pipe',
        }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('o skill da fila e o detalhar-backlog exigem a linha `Origem: etapa #<n>`', () => {
    expect(fila).toContain('Origem: etapa #<n>');
    expect(detalhar).toContain('Origem: etapa #<n>');
    expect(fila).not.toContain('no dataset `issues`');
    expect(fila).not.toContain('painel.py issue');
  });

  it('o fechamento troca o files/index.html e apaga o datasets/issues do painel publicado', () => {
    const porEtapa = section(fila, '## 3. Por etapa');
    expect(porEtapa).toContain('datasets/issues');
    expect(porEtapa).toContain('files/index.html');
  });
});

describe('implementar-fila: skill novo na main (decisão 11)', () => {
  const troca = section(fila, '## Troca de sessão');

  it('mudança grande vira troca de sessão, com a linhagem conferida antes', () => {
    expect(troca).toContain('mais de 30 linhas');
    expect(troca).toContain('seções de regra');
    expect(troca).toContain('git diff --numstat');
    expect(troca).toMatch(
      /linhagem[\s\S]*antes dessa troca|antes dessa troca[\s\S]*linhagem/,
    );
  });

  it('mudança pequena é releitura do SKILL.md inteiro, com prova no log', () => {
    expect(troca).toContain('`SKILL.md` inteiro, nunca só o diff');
    expect(troca).toContain('skill <commit>: <regra> → <o que faço agora>');
  });
});
