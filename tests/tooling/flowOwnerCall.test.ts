// @vitest-environment node
// Fase DN1 (etapa #1826, decisões 1 a 6 e 8): "chamar o dono" é definido uma vez no "Orquestrador —
// passo a passo" (parágrafo `**Chamar o dono:**`), a fase e o testador que não avisam seguem a escada
// do skill `implementar-fila` antes de o dono ser chamado, as "Limitações conhecidas" do revisor não
// repetem os comandos do item 6 da mensagem, e a regra `code-review` sai da lista de "## 1. Candidatas".
// Teste só de texto (leitura do `docs/FLOW.md` e do skill `detalhar-backlog`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');

const orquestrador = section(flow, '## Orquestrador — passo a passo');
const correcao = section(flow, '## Fase de correção');
const grupos = section(flow, '## Rodada dirigida em grupos');
const cincoBlocos = section(flow, '## Rodada completa em 5 blocos');
const limitacoes = section(flow, '### Limitações conhecidas');
const candidatas = section(skill, '## 1. Candidatas');

/** Parágrafo (bloco de linhas até a linha em branco) que começa por `start`. */
function paragraph(text: string, start: string): string {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`âncora não achada: ${start}`);
  const end = text.indexOf('\n\n', from);
  return text.slice(from, end < 0 ? undefined : end);
}

const limites = (): string => paragraph(orquestrador, '**Limites:**');
const chamarODono = (): string => paragraph(orquestrador, '**Chamar o dono:**');

describe('DN1 — "Chamar o dono" definido uma vez (#1826, decisão 1)', () => {
  it('o parágrafo `**Chamar o dono:**` vem logo depois do **Limites**', () => {
    const depois = orquestrador.indexOf('\n\n', orquestrador.indexOf('**Limites:**'));
    expect(orquestrador.slice(depois + 2).startsWith('**Chamar o dono:**')).toBe(true);
  });

  it('diz PushNotification, AskUserQuestion com a recomendada primeiro, o item 8 e a fila', () => {
    const p = chamarODono();
    expect(p).toContain('`PushNotification`');
    expect(p).toContain('com o motivo e o link');
    expect(p).toContain('`AskUserQuestion`');
    expect(p).toContain('com a opção recomendada primeiro');
    expect(p).toContain('item 8 da "Para a sessão da fase"');
    expect(p).toContain('a pergunta é da fase, no chat dela');
    expect(p).toContain('`implementar-fila`');
    expect(p).toContain('regras 1 e 2 de "Regras desta fila"');
  });
});

describe('DN1 — a fase que não avisa segue a escada antes de chamar o dono (decisão 2)', () => {
  it('o **Limites** traz a escada: working, send_message de retomada, recriar uma vez, Chamar o dono', () => {
    const p = limites();
    expect(p).toContain('`implementar-fila`');
    expect(p).toContain('`working`');
    expect(p).toContain('outra conferência de reserva');
    expect(p).toContain('`review_ready` ou `idle` sem `send_later` pendente da fase');
    expect(p).toContain(
      '"Conferência do orquestrador: a fase não avisou. Retome do ponto em que parou (CI do PR, merge, aviso) e avise o coordenador."',
    );
    expect(p).toContain('cria a sessão de novo **uma vez**');
    expect(p).toContain('a sessão anterior (<id>) parou em: <o que os eventos mostram>');
    expect(p).toMatch(/se acontecer de novo, chama o dono \("Chamar o dono"/);
  });

  it('a falha ou sessão parada não chama mais o dono de imediato', () => {
    expect(limites()).not.toContain(
      'com falha ou sessão parada, o orquestrador chama o dono',
    );
  });

  it('a pergunta da fase parada é lida "antes de avisar o dono"', () => {
    expect(limites()).toContain('antes de avisar o dono');
    expect(limites()).not.toContain('antes de chamar o dono');
  });
});

describe('DN1 — o testador que não avisa segue o mesmo (decisão 3)', () => {
  const reserva = (secao: string): string => {
    const linha = secao
      .split('\n')
      .find((l) => l.startsWith('- **Conferência de reserva:**'));
    if (!linha) throw new Error('Conferência de reserva não achada');
    return linha;
  };

  it('Rodada dirigida em grupos cita o **Limites** e mantém o send_later e os n avisos', () => {
    const l = reserva(grupos);
    expect(l).toContain('`send_later` de 60 min');
    expect(l).toContain('**n avisos**');
    expect(l).toContain(
      'o mesmo da fase que não avisa (parágrafo **Limites** do "Orquestrador — passo a passo")',
    );
    expect(l).not.toMatch(/chama o dono/i);
  });

  it('Rodada completa em 5 blocos cita o **Limites** e mantém o send_later e os cinco avisos', () => {
    const l = reserva(cincoBlocos);
    expect(l).toContain('`send_later` de 60 min');
    expect(l).toContain('**cinco avisos**');
    expect(l).toContain(
      'o mesmo da fase que não avisa (parágrafo **Limites** do "Orquestrador — passo a passo")',
    );
    expect(l).not.toMatch(/chama o dono/i);
  });
});

describe('DN1 — a correção que falha de novo cita "Chamar o dono" com os mesmos três casos (decisão 4)', () => {
  const item = (): string => {
    const linha = orquestrador.split('\n').find((l) => l.startsWith('- **com ❌**'));
    if (!linha) throw new Error('item "com ❌" não achado');
    return linha;
  };
  const ultimaFrase = (): string => {
    const de = correcao.lastIndexOf('Na segunda falha');
    if (de < 0) throw new Error('última frase da Fase de correção não achada');
    return correcao.slice(de).trimEnd();
  };

  it('o item "com ❌" do orquestrador', () => {
    const l = item();
    expect(l).toMatch(/Chama o dono \("Chamar o dono"[^)]*\) se falhar de novo, /);
    expect(l).toContain(
      'se o achado for de perda de dados, integridade do `mapping.json` ou segurança',
    );
    expect(l).toContain('ou se a correção pedir decisão de produto');
  });

  it('a última frase da "Fase de correção"', () => {
    const f = ultimaFrase();
    expect(f).toContain('Na segunda falha');
    expect(f).toContain('perda de dados, integridade do `mapping.json` ou segurança');
    expect(f).toContain('decisão de produto');
    expect(f).toMatch(/o orquestrador chama o dono \("Chamar o dono"/);
  });
});

describe('DN1 — todo "chama o dono" do docs/FLOW.md cita "Chamar o dono" (decisão 1 e aceite)', () => {
  it('cada ocorrência, até o próximo ". ", ";" ou fim de linha, cita "Chamar o dono"', () => {
    const faltam: string[] = [];
    const lines = flow.split('\n');
    lines.forEach((linha, i) => {
      for (const m of linha.matchAll(/chama o dono/gi)) {
        const resto = linha.slice(m.index);
        const fim = resto.search(/\. |;|$/);
        const trecho = resto.slice(0, fim < 0 ? undefined : fim);
        if (!trecho.includes('"Chamar o dono"')) faltam.push(`linha ${i + 1}: ${trecho}`);
      }
    });
    expect(faltam).toEqual([]);
  });

  it('há ocorrências no texto (o teste não passa vazio)', () => {
    expect((flow.match(/chama o dono/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('DN1 — "Limitações conhecidas" não repete o item 6 do revisor (decisão 5)', () => {
  const item = (): string => {
    const linha = limitacoes.split('\n').find((l) => l.includes('API REST'));
    if (!linha) throw new Error('item da API REST não achado');
    return linha;
  };

  it('diz só a limitação e aponta para o item 6 de "Para o revisor do CR por épico"', () => {
    const l = item();
    expect(l).not.toMatch(/^- Use a API REST/);
    expect(l).toContain('`gh issue create`, `gh repo clone` e GraphQL');
    expect(l).toContain('item 6 de "Para o revisor do CR por épico"');
  });

  it('sem os comandos `gh api -X POST` nem a frase do `-X GET`', () => {
    const l = item();
    expect(l).not.toContain('-X POST');
    expect(l).not.toContain('-X GET');
    expect(l).not.toContain('gh api');
  });

  it('o item 6 da mensagem do revisor continua com os comandos', () => {
    const mensagem = section(flow, '### Para o revisor do CR por épico');
    const item6 = between(mensagem, '\n6. ', '\n7. ');
    expect(item6).toContain('gh api -X POST repos/fabianofranca/mapping/issues');
    expect(item6).toContain('gh api -X GET search/issues');
  });

  it('o item da busca (search/issues, 30 chamadas por minuto) continua', () => {
    expect(limitacoes).toContain(
      'A busca (`search/issues`) aceita 30 chamadas por minuto',
    );
  });
});

describe('DN1 — "## 1. Candidatas" do detalhar-backlog (decisão 6)', () => {
  const passos = (): string[] => candidatas.split('\n').filter((l) => /^\d+\. /.test(l));

  it('tem 4 passos numerados e "Sem candidatas" é o 4', () => {
    const p = passos();
    expect(p).toHaveLength(4);
    expect(p[3]).toBe('4. Sem candidatas, diga isso e termine.');
  });

  it('os passos 1 a 3 continuam (o queuePanel lê o passo 2 entre "2. " e "\\n3. ")', () => {
    const p = passos();
    expect(p[0]).toMatch(/^1\. `list_issues`/);
    expect(p[1]).toMatch(/^2\. Fique só com as que \*\*não\*\* têm `ready`/);
    expect(p[2]).toMatch(/^3\. Ordem: /);
  });

  it('o parágrafo `**Issues do revisor de código**` vem depois da lista, com o texto da regra', () => {
    const depoisDaLista = candidatas.slice(candidatas.indexOf('4. Sem candidatas'));
    const p = paragraph(depoisDaLista, '**Issues do revisor de código**');
    expect(depoisDaLista.split('\n\n')[1]).toBe(p);
    expect(p).toContain('(rótulo `code-review`, `docs/PROCESS.md` "Revisão de código")');
    expect(p).toContain(
      'cada defeito high ou medium dela já tem a sua issue `bug`, citada no corpo',
    );
    expect(p).toContain('cobre só os achados que **não** apontam para um `bug`');
    expect(p).toContain('sem detalhar o mesmo achado duas vezes');
  });
});
