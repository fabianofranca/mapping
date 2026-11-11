// @vitest-environment node
// Fase FM5 (etapa #1532, decisões 9 e 10): os pedidos do supervisor (`SUP-n`, `sup`, `requests`) e as
// regras em vigor (`rule`) ficam no painel (`meta.requests` e `meta.rules`), no `show`, na página e no skill.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const BASE = '.claude/skills/implementar-fila';
const SCRIPT = `${BASE}/painel/painel.py`;
const T0 = '2026-11-11T10:00:00Z';

let dir = '';

function runAt(now: string, ...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
}

function tryRun(now: string, ...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

type Entry = Record<string, unknown>;

function meta(): Entry {
  return (JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Entry[])[0]!;
}

function requests(): Entry[] {
  return (meta().requests ?? []) as Entry[];
}

function rules(): Entry[] {
  return (meta().rules ?? []) as Entry[];
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-sup-'));
  runAt(T0, 'init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py sup (FM5, decisão 9)', () => {
  it('cria o pedido com tipo, pedido e estado=enviado, e o atualiza pelo SUP-n mantendo o histórico', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=segurar a #7', 'estado=enviado');
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({
      id: 'SUP-1',
      tipo: 'A',
      pedido: 'segurar a #7',
      estado: 'enviado',
    });
    runAt(
      '2026-11-11T10:20:00Z',
      'sup',
      dir,
      'SUP-1',
      'estado=aplicado',
      'evidencia=hold gravado na #7',
    );
    const r = requests()[0]!;
    expect(requests()).toHaveLength(1);
    expect(r).toMatchObject({
      tipo: 'A',
      pedido: 'segurar a #7',
      estado: 'aplicado',
      evidencia: 'hold gravado na #7',
    });
    expect(r.history).toEqual([
      { estado: 'enviado', at: T0 },
      { estado: 'aplicado', at: '2026-11-11T10:20:00Z' },
    ]);
  });

  it('o pedido novo precisa de tipo e pedido; o tipo é A ou B', () => {
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'estado=enviado').code).toBe(2);
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'estado=enviado').code).toBe(2);
    expect(
      tryRun(T0, 'sup', dir, 'SUP-1', 'tipo=C', 'pedido=x', 'estado=enviado').code,
    ).toBe(2);
    expect(
      tryRun(T0, 'sup', dir, 'SUP-x', 'tipo=A', 'pedido=x', 'estado=enviado').code,
    ).toBe(2);
    expect(requests()).toHaveLength(0);
  });

  it.each([
    ['enviado', 0],
    ['perguntado ao dono', 0],
    ['aprovado', 0],
    ['negado', 0],
    ['atrasado', 2],
    ['qualquer', 2],
  ])('estado %s sai com código %i', (estado, code) => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=B', 'pedido=mesclar a #9', 'estado=enviado');
    expect(tryRun(T0, 'sup', dir, 'SUP-1', `estado=${estado}`).code).toBe(code);
  });

  it('aplicado e recusado sem evidencia saem com código 2; com ela, gravam', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=pausar', 'estado=enviado');
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'estado=aplicado').code).toBe(2);
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'estado=recusado').code).toBe(2);
    expect(requests()[0]!.estado).toBe('enviado');
    runAt(
      T0,
      'sup',
      dir,
      'SUP-1',
      'estado=recusado',
      'evidencia=fora da lista do tipo A',
    );
    expect(requests()[0]).toMatchObject({
      estado: 'recusado',
      evidencia: 'fora da lista do tipo A',
    });
  });

  it('repetir o mesmo estado não muda o at nem o histórico, então o atrasado não some (revisão)', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=segurar a #7', 'estado=enviado');
    runAt('2026-11-11T11:40:00Z', 'sup', dir, 'SUP-1', 'estado=enviado');
    expect(requests()[0]!.at).toBe(T0);
    expect(requests()[0]!.history).toEqual([{ estado: 'enviado', at: T0 }]);
    expect(runAt('2026-11-11T11:40:00Z', 'requests', dir)).toContain('atrasado');
  });

  it('a evidencia de um estado anterior não fica no estado novo (revisão)', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=pausar', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=recusado', 'evidencia=fora da lista');
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=enviado');
    expect(requests()[0]!.evidencia).toBeUndefined();
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=perguntado ao dono', 'evidencia=perguntei');
    expect(requests()[0]!.evidencia).toBe('perguntei');
  });

  it('atualizar um SUP que não existe, sem tipo e pedido, sai com código 2', () => {
    expect(tryRun(T0, 'sup', dir, 'SUP-9', 'estado=aprovado').code).toBe(2);
  });

  it('entra no apply e marca meta.json como não publicado', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: "sup SUP-1 tipo=A pedido='confira a #3' estado=enviado\n",
    });
    expect(r.status).toBe(0);
    expect(requests()).toHaveLength(1);
    expect((meta().unpublished as { files: string[] }).files).toContain('meta.json');
  });
});

describe('painel.py requests e a linha do show (FM5, decisão 9)', () => {
  it('requests imprime a tabela; sem pedidos, nenhum', () => {
    expect(runAt(T0, 'requests', dir)).toBe('nenhum\n');
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=segurar a #7', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-2', 'tipo=B', 'pedido=mesclar a #9', 'estado=enviado');
    const out = runAt('2026-11-11T10:10:00Z', 'requests', dir);
    expect(out).toContain('SUP-1');
    expect(out).toContain('segurar a #7');
    expect(out).toContain('SUP-2');
    expect(out).not.toContain('atrasado');
  });

  it.each([
    [89, false],
    [90, false],
    [91, true],
  ])('enviado há %i min: atrasado = %s', (mins, late) => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=segurar a #7', 'estado=enviado');
    const at = new Date(Date.parse(T0) + mins * 60000)
      .toISOString()
      .replace('.000Z', 'Z');
    const out = runAt(at, 'requests', dir);
    expect(out.includes('atrasado')).toBe(late);
  });

  it('aprovado atrasa pelo horário da aprovação; perguntado ao dono, aplicado e negado não atrasam', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=B', 'pedido=x', 'estado=enviado');
    runAt('2026-11-11T10:10:00Z', 'sup', dir, 'SUP-1', 'estado=perguntado ao dono');
    expect(runAt('2026-11-11T14:00:00Z', 'requests', dir)).not.toContain('atrasado');
    runAt('2026-11-11T14:00:00Z', 'sup', dir, 'SUP-1', 'estado=aprovado');
    expect(runAt('2026-11-11T15:00:00Z', 'requests', dir)).not.toContain('atrasado');
    expect(runAt('2026-11-11T15:31:00Z', 'requests', dir)).toContain('atrasado');
    runAt('2026-11-11T15:31:00Z', 'sup', dir, 'SUP-1', 'estado=negado');
    expect(runAt('2026-11-12T10:00:00Z', 'requests', dir)).not.toContain('atrasado');
  });

  describe('requests --desde (etapa #1643, SV1, decisão 5)', () => {
    const DESDE = '2026-11-11T10:00:00Z';
    const AGORA = '2026-11-11T12:00:00Z';

    /** SUP-1 e SUP-2 fechados antes de DESDE; SUP-3 e SUP-6 abertos e velhos; SUP-4 e SUP-5 de DESDE em diante. */
    function seed() {
      runAt(
        '2026-11-11T07:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'tipo=A',
        'pedido=um',
        'estado=enviado',
      );
      runAt(
        '2026-11-11T08:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'estado=aplicado',
        'evidencia=ok',
      );
      runAt(
        '2026-11-11T08:30:00Z',
        'sup',
        dir,
        'SUP-2',
        'tipo=B',
        'pedido=dois',
        'estado=enviado',
      );
      runAt(
        '2026-11-11T09:00:00Z',
        'sup',
        dir,
        'SUP-2',
        'estado=recusado',
        'evidencia=x',
      );
      runAt(
        '2026-11-11T07:00:00Z',
        'sup',
        dir,
        'SUP-3',
        'tipo=A',
        'pedido=tres',
        'estado=enviado',
      );
      runAt(
        '2026-11-11T09:30:00Z',
        'sup',
        dir,
        'SUP-4',
        'tipo=A',
        'pedido=quatro',
        'estado=enviado',
      );
      runAt(DESDE, 'sup', dir, 'SUP-4', 'estado=aplicado', 'evidencia=ok');
      runAt(
        '2026-11-11T11:00:00Z',
        'sup',
        dir,
        'SUP-5',
        'tipo=B',
        'pedido=cinco',
        'estado=enviado',
      );
      runAt('2026-11-11T11:10:00Z', 'sup', dir, 'SUP-5', 'estado=negado');
      runAt(
        '2026-11-11T06:00:00Z',
        'sup',
        dir,
        'SUP-6',
        'tipo=B',
        'pedido=seis',
        'estado=perguntado ao dono',
      );
    }

    it('mostra os com at a partir de --desde (inclusive) e todos os abertos, na ordem e no formato de hoje, e conta os de fora', () => {
      seed();
      const tudo = runAt(AGORA, 'requests', dir).trimEnd().split('\n');
      expect(tudo).toHaveLength(6);
      const out = runAt(AGORA, 'requests', '--desde', DESDE, dir).trimEnd().split('\n');
      expect(out).toEqual([
        tudo[2], // SUP-3 (enviado, com o atrasado)
        tudo[3], // SUP-4 (aplicado em --desde)
        tudo[4], // SUP-5
        tudo[5], // SUP-6 (perguntado ao dono)
        `2 pedidos fechados antes de ${DESDE} fora da lista`,
      ]);
      expect(out[0]).toContain('SUP-3 | tipo A | enviado (atrasado)');
    });

    it('sem pedido de fora, não imprime a linha de contagem', () => {
      seed();
      const out = runAt(AGORA, 'requests', '--desde', '2026-11-11T06:00:00Z', dir);
      expect(out).not.toContain('fora da lista');
      expect(out).toBe(runAt(AGORA, 'requests', dir));
    });

    it('sem nada a mostrar, imprime "nenhum desde <ISO>"; sem pedido nenhum, "nenhum"', () => {
      expect(runAt(AGORA, 'requests', '--desde', DESDE, dir)).toBe('nenhum\n');
      runAt(
        '2026-11-11T07:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'tipo=A',
        'pedido=um',
        'estado=enviado',
      );
      runAt(
        '2026-11-11T08:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'estado=aplicado',
        'evidencia=ok',
      );
      expect(runAt(AGORA, 'requests', '--desde', DESDE, dir)).toBe(
        `nenhum desde ${DESDE}\n`,
      );
    });

    it('--desde que não é ISO UTC sai com código 2', () => {
      seed();
      for (const ruim of [
        'ontem',
        '2026-11-11',
        '2026-11-11T10:00:00',
        '2026-11-11T10:00:00-03:00',
      ]) {
        const r = tryRun(AGORA, 'requests', '--desde', ruim, dir);
        expect(r.code).toBe(2);
        expect(r.err).toContain('horário inválido');
        expect(r.out).toBe('');
      }
    });

    it('sem --desde a saída é a de hoje e o requests segue fora do apply', () => {
      seed();
      expect(runAt(AGORA, 'requests', dir).trimEnd().split('\n')).toHaveLength(6);
      const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
        encoding: 'utf8',
        input: `requests --desde ${DESDE}\n`,
      });
      expect(r.status).toBe(2);
    });
  });

  it('show: abertos e atrasados, ou nenhum', () => {
    expect(runAt(T0, 'show', dir)).toContain('pedidos do supervisor: nenhum');
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=a', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-2', 'tipo=A', 'pedido=b', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-2', 'estado=aplicado', 'evidencia=ok');
    expect(runAt('2026-11-11T10:30:00Z', 'show', dir)).toContain(
      'pedidos do supervisor: 1 abertos (atrasados: nenhum)',
    );
    expect(runAt('2026-11-11T12:00:00Z', 'show', dir)).toContain(
      'pedidos do supervisor: 1 abertos (atrasados: SUP-1)',
    );
    runAt('2026-11-11T12:00:00Z', 'sup', dir, 'SUP-1', 'estado=recusado', 'evidencia=x');
    expect(runAt('2026-11-11T12:00:00Z', 'show', dir)).toContain(
      'pedidos do supervisor: nenhum',
    );
  });

  it('requests lê só o meta e não entra no apply', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'requests\n',
    });
    expect(r.status).toBe(2);
  });
});

describe('painel.py rule (FM5, decisão 10)', () => {
  it('add numera R1, R2, … e grava texto, origem, saida e at', () => {
    runAt(T0, 'rule', dir, 'add', 'Nada de merge à noite', 'origem=dono');
    runAt(
      '2026-11-11T11:00:00Z',
      'rule',
      dir,
      'add',
      'Só uma etapa do painel por vez',
      'origem=SUP-3',
      'saida=quando a #7 mesclar',
    );
    expect(rules()).toHaveLength(2);
    expect(rules()[0]).toMatchObject({
      id: 'R1',
      texto: 'Nada de merge à noite',
      origem: 'dono',
      at: T0,
    });
    expect(rules()[1]).toMatchObject({
      id: 'R2',
      origem: 'SUP-3',
      saida: 'quando a #7 mesclar',
      at: '2026-11-11T11:00:00Z',
    });
  });

  it('a origem é dono ou SUP-n; texto vazio sai com código 2', () => {
    expect(tryRun(T0, 'rule', dir, 'add', 'x').code).toBe(2);
    expect(tryRun(T0, 'rule', dir, 'add', 'x', 'origem=testador').code).toBe(2);
    expect(tryRun(T0, 'rule', dir, 'add', '  ', 'origem=dono').code).toBe(2);
    expect(rules()).toHaveLength(0);
  });

  it('end tira a regra das em vigor e guarda o motivo; o número não se reaproveita', () => {
    runAt(T0, 'rule', dir, 'add', 'Regra um', 'origem=dono');
    runAt(T0, 'rule', dir, 'add', 'Regra dois', 'origem=dono');
    runAt('2026-11-11T12:00:00Z', 'rule', dir, 'end', 'R1', 'motivo=o dono revogou');
    expect(rules()[0]).toMatchObject({
      id: 'R1',
      motivo: 'o dono revogou',
      endedAt: '2026-11-11T12:00:00Z',
    });
    const out = runAt(T0, 'show', dir);
    expect(out).toContain('Regra dois');
    expect(out).not.toContain('Regra um');
    runAt(T0, 'rule', dir, 'add', 'Regra três', 'origem=dono');
    expect(rules()[2]!.id).toBe('R3');
  });

  it('end de um número que não existe, ou já encerrado, sai com código 2', () => {
    runAt(T0, 'rule', dir, 'add', 'Regra um', 'origem=dono');
    expect(tryRun(T0, 'rule', dir, 'end', 'R9').code).toBe(2);
    runAt(T0, 'rule', dir, 'end', 'R1');
    expect(tryRun(T0, 'rule', dir, 'end', 'R1').code).toBe(2);
  });

  it('show imprime o texto inteiro de cada regra em vigor, nunca resumido', () => {
    const longo =
      'Toda regra fixa do dono no chat da fila vira rule add no mesmo turno e a sessão nova a lê no show, sem resumo, com a condição de saída e tudo o mais que o dono disse.';
    expect(runAt(T0, 'show', dir)).toContain('regras em vigor: nenhuma');
    runAt(T0, 'rule', dir, 'add', longo, 'origem=dono', 'saida=quando o dono disser');
    const out = runAt(T0, 'show', dir);
    expect(out).toContain('regras em vigor:');
    expect(out).toContain(longo);
    expect(out).toContain('R1');
    expect(out).toContain('quando o dono disser');
  });

  it('entra no apply, junto de outros comandos', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: "rule add 'Sem merge sexta' origem=dono\nlog 'regra gravada'\n",
    });
    expect(r.status).toBe(0);
    expect(rules()).toHaveLength(1);
  });
});

describe('página: os cards "Pedidos do supervisor" e "Regras em vigor" (FM5)', () => {
  const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');
  const script = page.slice(page.indexOf('<script>'));

  it('os dois cards existem e leem meta.requests e meta.rules', () => {
    expect(page).toContain('Pedidos do supervisor');
    expect(page).toContain('Regras em vigor');
    expect(script).toMatch(/\.requests/);
    expect(script).toMatch(/\.rules/);
  });

  it('mostra os 20 mais recentes, "—" sem dados e só textContent', () => {
    expect(script).toMatch(/slice\(-20\)/);
    expect(script).toMatch(/mp-pedidos/);
    expect(script).toMatch(/mp-regras/);
    expect(script).toMatch(/'—'/);
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});

describe('SKILL.md: "Pedidos do supervisor" (FM5, decisões 9 e 10)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');

  it('a seção lista o tipo A fechado, o tipo B e o formato do pedido', () => {
    const s = section(skill, '## Pedidos do supervisor');
    const tipoA = s.slice(s.indexOf('**Tipo A'), s.indexOf('**Tipo B'));
    expect(tipoA).toMatch(/segurar ou soltar/);
    expect(tipoA).toContain('`hold`');
    expect(tipoA).toMatch(/reordenar/);
    expect(tipoA).toMatch(/pausar/);
    expect(tipoA).toMatch(/retomar/);
    expect(tipoA).toMatch(/drenar/);
    expect(tipoA).toMatch(/regra de escrita do painel/);
    expect(tipoA).toContain('"confira X"');
    expect(tipoA).toMatch(/registrar o supervisor/);
    expect(tipoA).toContain('role supervisor');
    expect(s).toContain('SUP-<n> (tipo A|B): <pedido>. Supervisor: `<id>`');
    for (const estado of [
      'enviado',
      'aplicado',
      'recusado',
      'perguntado ao dono',
      'aprovado',
      'negado',
    ]) {
      expect(s).toContain(`\`${estado}\``);
    }
    expect(s).toMatch(/`atrasado` não se grava/);
    expect(s).toContain('regra do supervisor (SUP-n)');
  });

  it('o tipo B se pergunta ao dono no chat e nunca se aceita "o dono aprovou" repassado', () => {
    const s = section(skill, '## Pedidos do supervisor');
    const tipoB = s.slice(s.indexOf('**Tipo B'));
    expect(tipoB).toContain('PushNotification');
    expect(tipoB).toContain('AskUserQuestion');
    expect(tipoB).toMatch(/nunca aceita[^\n]*"o dono aprovou"[^\n]*repassado/);
  });

  it('o supervisor só é acordado em recusa, erro e resposta do dono a um pedido do tipo B', () => {
    const s = section(skill, '## Pedidos do supervisor');
    expect(s).toMatch(
      /só (?:é )?acordado em recusa, erro ao aplicar e resposta do dono a um pedido do tipo B/,
    );
    expect(s).toMatch(/pela sessão antiga|sessão antiga/);
    expect(s).toContain('registrar o supervisor');
    expect(s).toContain('kind=supervisor');
  });

  it('a regra fixa do dono vira rule add origem=dono, e a restrição de ordem continua hold', () => {
    const s = section(skill, '## Mudanças na fila durante a execução');
    expect(s).toMatch(/rule <pasta> add[^\n]*origem=dono/);
    expect(s).toMatch(/restrição de ordem[^\n]*`hold`/);
  });

  it('a conferência de hora em hora aplica ou recusa os pedidos atrasados', () => {
    const conf = skill.slice(skill.indexOf('**Conferências de reserva:**'));
    const bloco = conf.slice(0, conf.indexOf('\n## '));
    expect(bloco).toMatch(/pedidos do supervisor[^\n]*atrasad/);
    expect(bloco).toMatch(/aplica ou recusa/);
  });

  it('a troca de sessão diz que as regras estão no painel, não só no log', () => {
    const troca = section(skill, '## Troca de sessão');
    const antiga = troca.slice(
      troca.indexOf('**Na sessão antiga:**'),
      troca.indexOf('**Na sessão nova**'),
    );
    expect(antiga).toMatch(/regras em vigor[^\n]*painel[^\n]*não só (?:no|em) `?log`?/);
  });

  it('o "Painel" documenta os comandos e as linhas novas', () => {
    const p = section(skill, '## Painel');
    expect(p).toContain('painel.py sup <pasta>');
    expect(p).toContain('painel.py requests <pasta>');
    expect(p).toContain('painel.py rule <pasta> add');
    expect(p).toContain('painel.py rule <pasta> end');
    expect(p).toContain('pedidos do supervisor:');
    expect(p).toContain('regras em vigor:');
  });
});
