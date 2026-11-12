// @vitest-environment node
// Fase CX1 (etapa #1638): teto de contexto da sessão da fase. Teste só de texto (leitura dos
// arquivos do fluxo de entrega): a fase confere o próprio contexto a 300 mil, passa a vez por uma
// passagem na sub-issue, o coordenador (ou o orquestrador de uma etapa só) cria a sucessora e
// arquiva a anterior, e a quinta sessão não troca (PP2, etapa #1595: linha de retomada numa fonte
// só, squash do WIP e até 5 sessões).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scriptMeasureProblems } from '../support/contextMeasure';
import { between, section } from '../support/textSlice';

const flow = readFileSync('docs/FLOW.md', 'utf8');
const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

const phase = section(flow, '## Para a sessão da fase');
const item3 = between(phase, '3. Subagentes e esforço', '4. Todo briefing');
const ancora = item3.indexOf('   - **Teto de contexto da fase:**');
if (ancora < 0)
  throw new Error('âncora não achada: sub-item "Teto de contexto da fase" do item 3');
const teto = item3.slice(ancora);
const porEtapa = section(skill, '## 3. Por etapa');
const troca = between(
  porEtapa,
  '**Fase que passa a vez por contexto**',
  '**PR que espera o coordenador:**',
);
const avisou = between(porEtapa, 'Quando a fase avisar (', '3. **Testador.**');
const item6 = between(phase, '6. Acompanhe o PR', '7. Ao terminar, avise');
const LINHA =
  'Retomada por contexto (<k> de 5): a sessão anterior (<id>) passou a vez com <n> mil; a passagem está em <link>. Continue no branch <branch>, que já existe (não o recrie da origin/epic/<nome>), e não refaça o que a passagem dá como feito.';
const ocorrencias = (texto: string, trecho: string): number =>
  texto.split(trecho).length - 1;

describe('CX1 — "Para a sessão da fase" do docs/FLOW.md, sub-item do item 3', () => {
  it('o sub-item fica debaixo do item 3, sem mudar a primeira linha nem a numeração', () => {
    expect(item3.split('\n')[0]).toMatch(
      /^3\. Subagentes e esforço: <da sub-issue, ex\.: /,
    );
    expect(item3).toContain('~200k');
    expect(phase).toContain('\n4. Todo briefing');
    expect(phase).toContain('\n9. Defeito achado no caminho');
  });

  it('o teto é 300 mil, medido pelo scripts/ci/contextUsage.mjs (não pelo used_tokens do get_session)', () => {
    expect(teto).toContain('300 mil');
    expect(teto).toContain('300.000');
    expect(teto).toContain('`acima=true`');
    expect(teto).toContain('`get_session` sem `session_id`');
    // Achado CL1.5: o script como instrução e o `used_tokens` só como proibição.
    expect(scriptMeasureProblems(teto)).toEqual([]);
    expect(teto).toMatch(/só muda no fim de um turno/);
  });

  it('CL1.4: script ausente na transição (git show falha ou arquivo vazio) vale como "sem medida"', () => {
    const transicao = between(teto, '**Transição:**', '**Sem medida**');
    expect(transicao).toContain('git show origin/main:scripts/ci/contextUsage.mjs');
    expect(transicao).toContain('script ausente');
    expect(transicao).toContain('sem medida');
    expect(transicao).toContain('`contexto=`');
    expect(transicao).toMatch(/código fora de 0 e 1|código diferente de 0 e 1/);
  });

  it('a conferência é antes de tarefa nova de subagente e antes dos gates do item 5', () => {
    expect(teto).toMatch(/antes de mandar uma tarefa nova a um subagente/);
    expect(teto).toMatch(/antes de rodar os gates do item 5/);
  });

  it('depois do PR aberto não há troca: a fase termina na mesma sessão', () => {
    expect(teto).toMatch(/Depois que o PR da fase está aberto[^.]*não há troca/);
    expect(teto).toContain('termina na mesma sessão');
  });

  it('a passagem: espera os subagentes, WIP com push, comentário na sub-issue, sem PR', () => {
    expect(teto).toContain('espera os subagentes em curso');
    expect(teto).toContain('`WIP <código>: passagem por contexto`');
    expect(teto).toContain('`git push -u origin <branch>`');
    expect(teto).toMatch(/Não abre PR/);
    expect(teto).toContain('`Passagem da fase <código> (contexto <n> mil):`');
    for (const campo of [
      'o branch e o commit',
      'os checkboxes feitos e os que faltam',
      'os testes vistos falhando antes do código',
      'as decisões tomadas fora da sub-issue',
      'os defeitos pendentes',
      'o próximo passo',
    ]) {
      expect(teto).toContain(campo);
    }
  });

  it('a mensagem ao coordenador vai pelo Canal do item 7, e a fase termina o turno', () => {
    expect(teto).toContain(
      '`Troca de sessão da fase <código>: contexto <n> mil; passagem em <link do comentário>.`',
    );
    expect(teto).toContain('pelo Canal do item 7');
    expect(teto).toContain('Termina o turno');
  });

  it('a sucessora lê a passagem no item 1 e continua no branch que já existe', () => {
    expect(teto).toContain(`\`${LINHA}\``);
    expect(teto).toContain('no item 1 (');
    expect(teto).toContain('`git switch <branch>`');
    expect(teto).toMatch(/continua no branch que já existe/);
    expect(teto).toMatch(/não o recria/);
  });

  it('PP2: a linha de retomada inteira aparece uma vez só no FLOW + skill, e é no sub-item do item 3', () => {
    expect(ocorrencias(flow + skill, LINHA)).toBe(1);
    expect(ocorrencias(teto, LINHA)).toBe(1);
    // Nenhuma cópia parcial da linha nos outros lugares (o "de 3" antigo inclusive).
    expect(ocorrencias(flow + skill, 'Retomada por contexto (<k> de')).toBe(1);
  });

  it('PP2: no máximo 4 trocas (5 sessões); a quinta não troca e avisa "passou de 300 mil na quinta sessão"', () => {
    expect(teto).toContain('4 trocas');
    expect(teto).toContain('5 sessões');
    expect(teto).toContain('`5 de 5`');
    expect(teto).toContain('passou de 300 mil na quinta sessão');
    for (const velho of ['2 trocas', '3 sessões', 'terceira sessão', '3 de 3'])
      expect(teto).not.toContain(velho);
  });

  it('PP2: o squash do item 6 tira o WIP do histórico do épico (passo 2 da passagem)', () => {
    const passo2 = between(teto, '2. faz commit', '3. comenta');
    expect(passo2).toContain('o squash do item 6 tira o WIP do histórico do épico');
  });

  it('vale também para a fase de correção e não cita send_later, ci-rerun.yml nem distBudget.mjs', () => {
    expect(teto).toContain('fase de correção');
    expect(teto).not.toContain('send_later');
    expect(teto).not.toContain('ci-rerun.yml');
    expect(teto).not.toContain('distBudget.mjs');
  });
});

describe('PP2 — item 6 de "Para a sessão da fase": squash do PR com commit WIP', () => {
  it('o PR de fase ou de correção com o commit WIP se mescla com merge_method squash; os outros com merge', () => {
    expect(item6).toContain('`WIP <código>: passagem por contexto`');
    expect(item6).toContain('`git log --format=%s origin/epic/<nome>..HEAD`');
    expect(item6).toContain('`merge_pull_request` `merge_method: squash`');
    expect(item6).toMatch(/Os outros PRs continuam com `merge`/);
    expect(item6).toMatch(/o commit vermelho não entra no histórico do épico/);
    expect(item6).toMatch(/de correção/);
    // A frase do merge no épico continua.
    expect(item6).toMatch(/mescle o próprio PR no épico/);
  });
});

describe('CX1 — "Orquestrador — passo a passo" do docs/FLOW.md, parágrafo "Limites"', () => {
  const passo = section(flow, '## Orquestrador — passo a passo');
  const limites = passo.slice(passo.indexOf('**Limites:**'));

  it('o orquestrador responde ao pedido de troca criando a sucessora e arquivando a anterior', () => {
    expect(limites).toContain('Troca de sessão da fase <código>');
    expect(limites).toContain('sucessora');
    expect(limites).toContain('arquiva a anterior');
    expect(limites).toContain('Teto de contexto da fase');
  });

  it('PP2: cita a linha de retomada do sub-item, sem copiá-la', () => {
    expect(limites).toContain(
      'a linha de retomada do sub-item "Teto de contexto da fase" (item 3 da "Para a sessão da fase")',
    );
    expect(limites).not.toContain('Retomada por contexto (');
    expect(limites).not.toContain(
      'passou a vez com <n> mil; a passagem está em <link>. Continue',
    );
  });

  it('PP2: no máximo 4 trocas, a quinta sessão não troca e o aviso ao dono vai na 4ª e na 5ª', () => {
    expect(limites).toContain('no máximo 4 trocas por fase');
    expect(limites).toContain('a quinta sessão não troca');
    expect(limites).toMatch(/(4ª|quarta)[^.]*(5ª|quinta)[^.]*`PushNotification`/);
    expect(limites).toContain('Fase <código> da #<n> na sessão <k> de 5 por contexto');
    for (const velho of ['2 trocas', 'terceira sessão', '<k> de 3'])
      expect(limites).not.toContain(velho);
  });
});

describe('CX1 — skill implementar-fila, "3. Por etapa"', () => {
  it('o parágrafo vem no passo 2, depois de "Filha que espera o dono"', () => {
    const dono = porEtapa.indexOf('**Filha que espera o dono**');
    const contexto = porEtapa.indexOf('**Fase que passa a vez por contexto**');
    expect(dono).toBeGreaterThan(0);
    expect(contexto).toBeGreaterThan(dono);
  });

  it('o coordenador cria a sucessora com o mesmo model, effort e source_revision', () => {
    expect(troca).toContain('quem cria a sucessora é o coordenador');
    expect(troca).toContain('`create_session`');
    expect(troca).toMatch(/mesmo `model`, `effort` e `source_revision`/);
    expect(troca).toContain(' · retomada <k>');
  });

  it('PP2: a mensagem é a curta do passo 2 com a linha de retomada do FLOW, lida pelo nome da seção, sem cópia', () => {
    expect(troca).toContain('a curta do passo 2');
    expect(troca).toContain('a linha de retomada do sub-item "Teto de contexto da fase"');
    expect(troca).toContain('antes de "Coordenador"');
    expect(troca).toContain('item 9 de "Economia de contexto"');
    expect(troca).toContain('"Para a sessão da fase"');
    // Onde a linha começa e termina, e o que se preenche (achado da revisão: extração sem ambiguidade).
    expect(troca).toContain(
      'o trecho entre crases do sub-item que começa por `Retomada por contexto`',
    );
    expect(troca).toContain('com os campos `<…>` preenchidos');
    expect(troca).not.toContain('Retomada por contexto (');
    expect(troca).not.toContain('Continue no branch <branch>');
  });

  it('o painel recebe o child=, o session com o mesmo label e o log, num apply só', () => {
    expect(troca).toContain("row '#n' child=<novo> childAt=now");
    expect(troca).toContain("session <pasta> '#n' <novo> kind=fase label=<código>");
    expect(troca).toContain('<código>: troca por contexto (<n> mil) → <id novo>');
    expect(troca).toContain('`apply`');
  });

  it('a anterior é arquivada no mesmo ciclo, pelo subagente do ciclo, com o custo antes', () => {
    expect(troca).toContain('subagente do ciclo');
    expect(troca).toContain('`painel.py cost`');
    expect(troca).toContain('"Arquivar as sessões" › "Custo"');
    expect(troca).toContain('`archive_session`');
  });

  it('PP2: no máximo 4 trocas: a sessão 5 de 5 não troca e o log registra o caso', () => {
    expect(troca).toContain('No máximo 4 trocas por fase (5 sessões)');
    expect(troca).toContain('a sessão `5 de 5` não troca');
    expect(troca).toContain('passou de 300 mil na quinta sessão');
    expect(troca).toContain('<código>: passou de 300 mil na quinta sessão');
    expect(troca).toContain('o log registra o caso');
    expect(troca).toContain('A sessão da filha é a `<k-1>` de 5');
    for (const velho of ['2 trocas', '3 sessões', 'terceira sessão', '3 de 3', '` de 3'])
      expect(troca).not.toContain(velho);
  });

  it('PP2: a 4ª e a 5ª sessões mandam PushNotification ao dono e gravam o aviso no log, sem esperar resposta', () => {
    expect(troca).toContain('`k` igual a 4 ou 5');
    expect(troca).toContain('`PushNotification`');
    expect(troca).toContain('Fase <código> da #<n> na sessão <k> de 5 por contexto');
    expect(troca).toContain('<código>: sessão <k> de 5 (aviso ao dono)');
    expect(troca).toContain('sem esperar resposta (regra 1 da fila)');
  });

  it('PP2: o PR de fase com commit WIP se mescla com squash, também quando é o coordenador que mescla', () => {
    expect(avisou).toContain('avisou sem ter mesclado');
    expect(avisou).toContain('`WIP <código>: passagem por contexto`');
    // O clone do coordenador não está no branch da fase: o `HEAD` do item 6 vira o branch da origin.
    expect(avisou).toContain(
      '`git log --format=%s origin/epic/<nome>..origin/<branch da fase>`',
    );
    expect(avisou).not.toContain('..HEAD`');
    expect(avisou).toContain('`merge_method: squash`');
    expect(avisou).toContain('item 6');
    expect(avisou).toMatch(/Os outros PRs continuam com `merge`/);
  });

  it('"O que não se arquiva" tem a exceção da filha que passou a vez por contexto', () => {
    const arquivar = between(
      section(skill, '## 3. Por etapa'),
      '- **O que não se arquiva:**',
      '- **Registro:**',
    );
    expect(arquivar).toContain('passou a vez por contexto');
    expect(arquivar).toMatch(/se arquiva/);
  });

  it('a sucessora traz o branch com refspec que vale em clone de um branch só', () => {
    expect(teto).toContain('`git fetch origin <branch>:<branch>`');
  });

  it('o pedido de troca vale no item 7 e no Canal; a contagem usa o meta.sessions', () => {
    const item7 = between(phase, '7. Ao terminar, avise', '8. ');
    expect(item7).toContain('pedido de troca por contexto');
    expect(item7).toContain('o pedido de troca por contexto do item 3 também');
    expect(troca).toContain('`meta.sessions`');
    expect(troca).toContain('já tem uma entrada `label=<código>` mais nova');
  });
});

// PP3 (etapa #1595, decisão 8): as cópias do texto da troca por contexto se comparam entre si
// (números e começo do pedido), e os comandos do painel que o skill manda rodar rodam de verdade.
const limitesTexto = (() => {
  const passo = section(flow, '## Orquestrador — passo a passo');
  return passo.slice(passo.indexOf('**Limites:**'));
})();
const lugares: Array<[string, string]> = [
  ['item 3 (Teto de contexto da fase)', teto],
  ['"Limites" do FLOW', limitesTexto],
  ['skill (Fase que passa a vez por contexto)', troca],
];

interface Numeros {
  trocas: number[];
  sessoes: number[];
  kDeN: number[];
  ultima: number[];
}

/** Os números da troca num trecho: máximo de trocas, total de sessões, `<k> de N` e a `N de N` da última. */
function numeros(texto: string): Numeros {
  const todos = (re: RegExp, grupo = 1): number[] => [
    ...new Set([...texto.matchAll(re)].map((m) => Number(m[grupo]))),
  ];
  return {
    trocas: todos(/no m[aá]ximo (\d+) trocas por fase/gi),
    sessoes: todos(/\((\d+) sessões\)/g),
    kDeN: todos(/<k(?:-1)?>`? de (\d+)/g),
    ultima: [
      ...new Set(
        [...texto.matchAll(/`(\d+) de (\d+)`/g)].flatMap((m) => [
          Number(m[1]),
          Number(m[2]),
        ]),
      ),
    ],
  };
}

describe('PP3 — cópias do texto da troca por contexto comparadas (decisão 8)', () => {
  it('os números da troca (trocas, sessões, <k> de N) são os mesmos nos três lugares', () => {
    const achados = lugares.map(([nome, texto]) => ({ nome, ...numeros(texto) }));
    for (const a of achados) {
      // Cada lugar diz o máximo de trocas uma vez e o `<k> de N` com um N só.
      expect(a.trocas, `${a.nome}: máximo de trocas`).toHaveLength(1);
      expect(a.kDeN, `${a.nome}: <k> de N`).toHaveLength(1);
    }
    const [ref, ...outros] = achados;
    for (const o of outros) {
      expect(o.trocas, `${o.nome} x ${ref!.nome}: trocas`).toEqual(ref!.trocas);
      expect(o.kDeN, `${o.nome} x ${ref!.nome}: <k> de N`).toEqual(ref!.kDeN);
    }
    // O total de sessões, onde o texto o diz, é o mesmo N, e N = trocas + 1.
    const [trocas] = ref!.trocas;
    const [n] = ref!.kDeN;
    expect(n).toBe(trocas! + 1);
    for (const a of achados) {
      for (const total of [...a.sessoes, ...a.ultima])
        expect(total, `${a.nome}: total de sessões`).toBe(n);
    }
    expect(achados.some((a) => a.sessoes.length > 0)).toBe(true);
    expect(achados.some((a) => a.ultima.length > 0)).toBe(true);
  });

  it('o pedido de troca tem o mesmo começo no item 3, no "Limites" e no skill', () => {
    const comeco = (texto: string): string[] => [
      ...new Set(
        [
          ...texto.matchAll(
            /Troca de sessão da fase <código>: contexto <n> mil; passagem em/g,
          ),
        ].map((m) => m[0]),
      ),
    ];
    const achados = lugares.map(([nome, texto]) => ({ nome, comeco: comeco(texto) }));
    for (const a of achados) expect(a.comeco, a.nome).toHaveLength(1);
    const [ref, ...outros] = achados;
    for (const o of outros)
      expect(o.comeco, `${o.nome} x ${ref!.nome}`).toEqual(ref!.comeco);
  });

  it('a linha de retomada tem uma fonte só: o trecho entre crases do item 3, uma vez em FLOW + skill', () => {
    const fontes = [...(flow + skill).matchAll(/`(Retomada por contexto \([^`]*)`/g)];
    expect(fontes).toHaveLength(1);
    expect(ocorrencias(flow + skill, 'Retomada por contexto (')).toBe(1);
    expect(teto).toContain(fontes[0]![0]);
    expect(ocorrencias(skill, 'Retomada por contexto (')).toBe(0);
    expect(ocorrencias(limitesTexto, 'Retomada por contexto (')).toBe(0);
  });
});

describe('PP3 — comandos do painel do skill rodados num painel temporário (decisão 8)', () => {
  const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
  const AGORA = '2026-11-12T10:00:00Z';
  const ANTES = '2026-11-12T09:00:00Z';
  const TEMPO_SUBPROCESSOS = 30_000;
  const custo = between(porEtapa, '- **Custo:**', '**Sentinela:**');
  let dir = '';

  const painel = (agora: string, ...args: string[]) => {
    const r = spawnSync('python3', [SCRIPT, '--now', agora, ...args], {
      encoding: 'utf8',
    });
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
    return r.stdout;
  };
  const lote = (agora: string, texto: string) => {
    const r = spawnSync('python3', [SCRIPT, '--now', agora, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: texto,
    });
    expect(r.status, r.stderr).toBe(0);
  };
  const json = (nome: string): Array<Record<string, unknown>> =>
    JSON.parse(readFileSync(path.join(dir, `${nome}.json`), 'utf8')) as Array<
      Record<string, unknown>
    >;

  /** O comando entre crases do skill que começa por `prefixo`, sem o `painel.py ` do começo. */
  function comando(texto: string, prefixo: string): string {
    const achou = [...texto.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1]!.replace(/^painel\.py /, ''))
      .find((c) => c.startsWith(prefixo));
    if (!achou) throw new Error(`comando não achado no skill: ${prefixo}`);
    return achou;
  }

  /** Troca os marcadores do skill por valores e tira a `<pasta>` (o `apply` não a leva). */
  function preenche(cmd: string, kind: string): string {
    return cmd
      .replace('<pasta> ', '')
      .replace("'#n'", "'#10'")
      .replace('<novo>', 'session_nova')
      .replace('<id anterior>', 'session_velha')
      .replace('<id>', 'session_velha')
      .replace('<código>', 'PP3')
      .replace('kind=fase', `kind=${kind}`)
      .replace('usd=…', 'usd=1.5')
      .replace('ctx=…', 'ctx=250000')
      .replace('model=…', 'model=claude-sonnet-5-5')
      .replace('effort=…', 'effort=medium');
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-troca-'));
    painel(ANTES, 'init', dir);
    painel(ANTES, 'start', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['fase', 'fase'],
    ['correção', 'correção'],
  ])(
    'a troca da filha (kind=%s) num apply só: child novo, sessions com os dois ids, meta.sessions com o mesmo label e o custo da anterior',
    (_nome, kind) => {
      painel(
        ANTES,
        'row',
        dir,
        '#10',
        'title=Etapa dez',
        'status=em andamento',
        'child=session_velha',
        'childAt=now',
        'wait=pergunta',
      );
      painel(ANTES, 'session', dir, '#10', 'session_velha', `kind=${kind}`, 'label=PP3');
      // A linha antes da troca: filha velha, com `wait`.
      expect(json('queue')[0]).toMatchObject({
        child: 'session_velha',
        wait: 'pergunta',
      });

      const row = preenche(comando(troca, "row '#n' child="), kind);
      const sessao = preenche(comando(troca, 'session <pasta> '), kind);
      const cost = preenche(comando(custo, 'cost <pasta> <id>'), kind);
      expect(sessao).toContain(`kind=${kind}`);
      lote(AGORA, [row, sessao, cost].join('\n'));

      const linha = json('queue')[0]!;
      expect(linha.child).toBe('session_nova');
      expect(linha.childAt).toBe(AGORA);
      expect(linha.wait).toBe('');
      expect(String(linha.sessions).split(' ').sort()).toEqual([
        'session_nova',
        'session_velha',
      ]);

      const sessoes = (json('meta')[0]!.sessions ?? []) as Array<Record<string, unknown>>;
      const doCodigo = sessoes.filter((e) => e.label === 'PP3');
      // A contagem das entradas com o label é o <k> da regra: a sucessora é a 2ª sessão.
      expect(doCodigo.map((e) => e.id).sort()).toEqual(['session_nova', 'session_velha']);
      expect(doCodigo.map((e) => e.kind)).toEqual([kind, kind]);
      const velha = doCodigo.find((e) => e.id === 'session_velha')!;
      expect(velha.cost).toMatchObject({ usd: 1.5, ctx: 250000 });
      expect(doCodigo.find((e) => e.id === 'session_nova')!.cost).toBeUndefined();
    },
    TEMPO_SUBPROCESSOS,
  );
});
