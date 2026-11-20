// @vitest-environment node
// Phase FM5 (stage #1532, decisions 9 and 10): the supervisor requests (`SUP-n`, `sup`, `requests`) and the
// rules in force (`rule`) live in the panel (`meta.requests` and `meta.rules`), in the `show`, in the page and in the skill.
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

describe('painel.py sup (FM5, decision 9)', () => {
  it('creates the request with tipo, pedido and estado=enviado, and updates it by SUP-n keeping the history', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=hold #7', 'estado=enviado');
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({
      id: 'SUP-1',
      tipo: 'A',
      pedido: 'hold #7',
      estado: 'enviado',
    });
    runAt(
      '2026-11-11T10:20:00Z',
      'sup',
      dir,
      'SUP-1',
      'estado=aplicado',
      'evidencia=hold recorded on #7',
    );
    const r = requests()[0]!;
    expect(requests()).toHaveLength(1);
    expect(r).toMatchObject({
      tipo: 'A',
      pedido: 'hold #7',
      estado: 'aplicado',
      evidencia: 'hold recorded on #7',
    });
    expect(r.history).toEqual([
      { estado: 'enviado', at: T0 },
      { estado: 'aplicado', at: '2026-11-11T10:20:00Z' },
    ]);
  });

  it('a new request needs tipo and pedido; the tipo is A or B', () => {
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
  ])('estado %s exits with code %i', (estado, code) => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=B', 'pedido=merge #9', 'estado=enviado');
    expect(tryRun(T0, 'sup', dir, 'SUP-1', `estado=${estado}`).code).toBe(code);
  });

  it('aplicado and recusado without evidencia exit with code 2; with it, they record', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=pause', 'estado=enviado');
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'estado=aplicado').code).toBe(2);
    expect(tryRun(T0, 'sup', dir, 'SUP-1', 'estado=recusado').code).toBe(2);
    expect(requests()[0]!.estado).toBe('enviado');
    runAt(
      T0,
      'sup',
      dir,
      'SUP-1',
      'estado=recusado',
      'evidencia=outside the type A list',
    );
    expect(requests()[0]).toMatchObject({
      estado: 'recusado',
      evidencia: 'outside the type A list',
    });
  });

  it('repeating the same estado changes neither the at nor the history, so the atrasado does not go away (review)', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=hold #7', 'estado=enviado');
    runAt('2026-11-11T11:40:00Z', 'sup', dir, 'SUP-1', 'estado=enviado');
    expect(requests()[0]!.at).toBe(T0);
    expect(requests()[0]!.history).toEqual([{ estado: 'enviado', at: T0 }]);
    expect(runAt('2026-11-11T11:40:00Z', 'requests', dir)).toContain('atrasado');
  });

  it('the evidencia of an earlier estado does not stay in the new estado (review)', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=pause', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=recusado', 'evidencia=outside the list');
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=enviado');
    expect(requests()[0]!.evidencia).toBeUndefined();
    runAt(T0, 'sup', dir, 'SUP-1', 'estado=perguntado ao dono', 'evidencia=asked');
    expect(requests()[0]!.evidencia).toBe('asked');
  });

  it('updating a SUP that does not exist, with no tipo and pedido, exits with code 2', () => {
    expect(tryRun(T0, 'sup', dir, 'SUP-9', 'estado=aprovado').code).toBe(2);
  });

  it('goes into apply and marks meta.json as unpublished', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: "sup SUP-1 tipo=A pedido='confira a #3' estado=enviado\n",
    });
    expect(r.status).toBe(0);
    expect(requests()).toHaveLength(1);
    expect((meta().unpublished as { files: string[] }).files).toContain('meta.json');
  });
});

describe('painel.py requests and the show line (FM5, decision 9)', () => {
  it('requests prints the table; with no requests, nenhum', () => {
    expect(runAt(T0, 'requests', dir)).toBe('nenhum\n');
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=hold #7', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-2', 'tipo=B', 'pedido=merge #9', 'estado=enviado');
    const out = runAt('2026-11-11T10:10:00Z', 'requests', dir);
    expect(out).toContain('SUP-1');
    expect(out).toContain('hold #7');
    expect(out).toContain('SUP-2');
    expect(out).not.toContain('atrasado');
  });

  it.each([
    [89, false],
    [90, false],
    [91, true],
  ])('enviado %i min ago: atrasado = %s', (mins, late) => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=A', 'pedido=hold #7', 'estado=enviado');
    const at = new Date(Date.parse(T0) + mins * 60000)
      .toISOString()
      .replace('.000Z', 'Z');
    const out = runAt(at, 'requests', dir);
    expect(out.includes('atrasado')).toBe(late);
  });

  it('aprovado goes atrasado by the approval time; perguntado ao dono, aplicado and negado do not', () => {
    runAt(T0, 'sup', dir, 'SUP-1', 'tipo=B', 'pedido=x', 'estado=enviado');
    runAt('2026-11-11T10:10:00Z', 'sup', dir, 'SUP-1', 'estado=perguntado ao dono');
    expect(runAt('2026-11-11T14:00:00Z', 'requests', dir)).not.toContain('atrasado');
    runAt('2026-11-11T14:00:00Z', 'sup', dir, 'SUP-1', 'estado=aprovado');
    expect(runAt('2026-11-11T15:00:00Z', 'requests', dir)).not.toContain('atrasado');
    expect(runAt('2026-11-11T15:31:00Z', 'requests', dir)).toContain('atrasado');
    runAt('2026-11-11T15:31:00Z', 'sup', dir, 'SUP-1', 'estado=negado');
    expect(runAt('2026-11-12T10:00:00Z', 'requests', dir)).not.toContain('atrasado');
  });

  describe('requests --desde (stage #1643, SV1, decision 5)', () => {
    const SINCE = '2026-11-11T10:00:00Z';
    const NOW = '2026-11-11T12:00:00Z';

    /** SUP-1 and SUP-2 closed before SINCE; SUP-3 and SUP-6 open and old; SUP-4 and SUP-5 from SINCE on. */
    function seed() {
      runAt(
        '2026-11-11T07:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'tipo=A',
        'pedido=one',
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
        'pedido=two',
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
        'pedido=three',
        'estado=enviado',
      );
      runAt(
        '2026-11-11T09:30:00Z',
        'sup',
        dir,
        'SUP-4',
        'tipo=A',
        'pedido=four',
        'estado=enviado',
      );
      runAt(SINCE, 'sup', dir, 'SUP-4', 'estado=aplicado', 'evidencia=ok');
      runAt(
        '2026-11-11T11:00:00Z',
        'sup',
        dir,
        'SUP-5',
        'tipo=B',
        'pedido=five',
        'estado=enviado',
      );
      runAt('2026-11-11T11:10:00Z', 'sup', dir, 'SUP-5', 'estado=negado');
      runAt(
        '2026-11-11T06:00:00Z',
        'sup',
        dir,
        'SUP-6',
        'tipo=B',
        'pedido=six',
        'estado=perguntado ao dono',
      );
    }

    it("shows those with at from --desde on (inclusive) and all the open ones, in today's order and format, and counts the ones left out", () => {
      seed();
      const all = runAt(NOW, 'requests', dir).trimEnd().split('\n');
      expect(all).toHaveLength(6);
      const out = runAt(NOW, 'requests', '--desde', SINCE, dir).trimEnd().split('\n');
      expect(out).toEqual([
        all[2], // SUP-3 (enviado, with the atrasado)
        all[3], // SUP-4 (aplicado at --desde)
        all[4], // SUP-5
        all[5], // SUP-6 (perguntado ao dono)
        `2 pedidos fechados antes de ${SINCE} fora da lista`,
      ]);
      expect(out[0]).toContain('SUP-3 | tipo A | enviado (atrasado)');
    });

    it('with no request left out, it does not print the count line', () => {
      seed();
      const out = runAt(NOW, 'requests', '--desde', '2026-11-11T06:00:00Z', dir);
      expect(out).not.toContain('fora da lista');
      expect(out).toBe(runAt(NOW, 'requests', dir));
    });

    it('with nothing to show, it prints "nenhum desde <ISO>"; with no request at all, "nenhum"', () => {
      expect(runAt(NOW, 'requests', '--desde', SINCE, dir)).toBe('nenhum\n');
      runAt(
        '2026-11-11T07:00:00Z',
        'sup',
        dir,
        'SUP-1',
        'tipo=A',
        'pedido=one',
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
      expect(runAt(NOW, 'requests', '--desde', SINCE, dir)).toBe(
        `nenhum desde ${SINCE}\n`,
      );
    });

    it('a --desde that is not ISO UTC exits with code 2', () => {
      seed();
      for (const bad of [
        'ontem',
        '2026-11-11',
        '2026-11-11T10:00:00',
        '2026-11-11T10:00:00-03:00',
      ]) {
        const r = tryRun(NOW, 'requests', '--desde', bad, dir);
        expect(r.code).toBe(2);
        expect(r.err).toContain('horário inválido');
        expect(r.out).toBe('');
      }
    });

    it("without --desde the output is today's and requests stays out of apply", () => {
      seed();
      expect(runAt(NOW, 'requests', dir).trimEnd().split('\n')).toHaveLength(6);
      const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
        encoding: 'utf8',
        input: `requests --desde ${SINCE}\n`,
      });
      expect(r.status).toBe(2);
    });
  });

  it('show: open and atrasados, or nenhum', () => {
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

  it('requests reads only the meta and does not go into apply', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'requests\n',
    });
    expect(r.status).toBe(2);
  });
});

describe('painel.py rule (FM5, decision 10)', () => {
  it('add numbers R1, R2, … and records texto, origem, saida and at', () => {
    runAt(T0, 'rule', dir, 'add', 'No merging at night', 'origem=dono');
    runAt(
      '2026-11-11T11:00:00Z',
      'rule',
      dir,
      'add',
      'Only one panel stage at a time',
      'origem=SUP-3',
      'saida=when #7 merges',
    );
    expect(rules()).toHaveLength(2);
    expect(rules()[0]).toMatchObject({
      id: 'R1',
      texto: 'No merging at night',
      origem: 'dono',
      at: T0,
    });
    expect(rules()[1]).toMatchObject({
      id: 'R2',
      origem: 'SUP-3',
      saida: 'when #7 merges',
      at: '2026-11-11T11:00:00Z',
    });
  });

  it('the origem is dono or SUP-n; empty text exits with code 2', () => {
    expect(tryRun(T0, 'rule', dir, 'add', 'x').code).toBe(2);
    expect(tryRun(T0, 'rule', dir, 'add', 'x', 'origem=testador').code).toBe(2);
    expect(tryRun(T0, 'rule', dir, 'add', '  ', 'origem=dono').code).toBe(2);
    expect(rules()).toHaveLength(0);
  });

  it('end takes the rule out of those in force and keeps the motivo; the number is not reused', () => {
    runAt(T0, 'rule', dir, 'add', 'Rule one', 'origem=dono');
    runAt(T0, 'rule', dir, 'add', 'Rule two', 'origem=dono');
    runAt(
      '2026-11-11T12:00:00Z',
      'rule',
      dir,
      'end',
      'R1',
      'motivo=the owner revoked it',
    );
    expect(rules()[0]).toMatchObject({
      id: 'R1',
      motivo: 'the owner revoked it',
      endedAt: '2026-11-11T12:00:00Z',
    });
    const out = runAt(T0, 'show', dir);
    expect(out).toContain('Rule two');
    expect(out).not.toContain('Rule one');
    runAt(T0, 'rule', dir, 'add', 'Rule three', 'origem=dono');
    expect(rules()[2]!.id).toBe('R3');
  });

  it('end of a number that does not exist, or is already ended, exits with code 2', () => {
    runAt(T0, 'rule', dir, 'add', 'Rule one', 'origem=dono');
    expect(tryRun(T0, 'rule', dir, 'end', 'R9').code).toBe(2);
    runAt(T0, 'rule', dir, 'end', 'R1');
    expect(tryRun(T0, 'rule', dir, 'end', 'R1').code).toBe(2);
  });

  it('show prints the full text of each rule in force, never summarized', () => {
    const long =
      'Every fixed owner rule in the queue chat becomes rule add in the same turn and the new session reads it in the show, with no summary, with the exit condition and everything else the owner said.';
    expect(runAt(T0, 'show', dir)).toContain('regras em vigor: nenhuma');
    runAt(T0, 'rule', dir, 'add', long, 'origem=dono', 'saida=when the owner says so');
    const out = runAt(T0, 'show', dir);
    expect(out).toContain('regras em vigor:');
    expect(out).toContain(long);
    expect(out).toContain('R1');
    expect(out).toContain('when the owner says so');
  });

  it('goes into apply, along with other commands', () => {
    const r = spawnSync('python3', [SCRIPT, '--now', T0, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: "rule add 'No merge on Friday' origem=dono\nlog 'regra gravada'\n",
    });
    expect(r.status).toBe(0);
    expect(rules()).toHaveLength(1);
  });
});

describe('page: the "Supervisor requests" and "Rules in force" cards (FM5)', () => {
  const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');
  const script = page.slice(page.indexOf('<script>'));

  it('both cards exist and read meta.requests and meta.rules', () => {
    expect(page).toContain('Supervisor requests');
    expect(page).toContain('Rules in force');
    expect(script).toMatch(/\.requests/);
    expect(script).toMatch(/\.rules/);
  });

  it('shows the 20 most recent, "—" with no data and only textContent', () => {
    expect(script).toMatch(/slice\(-20\)/);
    expect(script).toMatch(/mp-pedidos/);
    expect(script).toMatch(/mp-regras/);
    expect(script).toMatch(/'—'/);
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});

describe('SKILL.md: "Supervisor requests" (FM5, decisions 9 and 10)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');

  it('the section lists the closed type A, type B and the request format', () => {
    const s = section(skill, '## Supervisor requests');
    const typeA = s.slice(s.indexOf('**Type A'), s.indexOf('**Type B'));
    expect(typeA).toMatch(/hold or release/);
    expect(typeA).toContain('`hold`');
    expect(typeA).toMatch(/reorder/);
    expect(typeA).toMatch(/pause/);
    expect(typeA).toMatch(/resume/);
    expect(typeA).toMatch(/drain/);
    expect(typeA).toMatch(/panel writing rule/);
    expect(typeA).toContain('"confira X"');
    expect(typeA).toMatch(/register the supervisor/);
    expect(typeA).toContain('role supervisor');
    expect(s).toContain('SUP-<n> (tipo A|B): <pedido>. Supervisor: `<id>`');
    for (const state of [
      'enviado',
      'aplicado',
      'recusado',
      'perguntado ao dono',
      'aprovado',
      'negado',
    ]) {
      expect(s).toContain(`\`${state}\``);
    }
    expect(s).toMatch(/`atrasado` is not recorded/);
    expect(s).toContain('regra do supervisor (SUP-n)');
  });

  it('type B is asked of the owner through the picker (no push) and a relayed "o dono aprovou" is never accepted', () => {
    const s = section(skill, '## Supervisor requests');
    const typeB = s.slice(s.indexOf('**Type B'));
    expect(typeB).toContain('AskUserQuestion');
    expect(typeB).toContain('`Aprovar SUP-<k>`');
    expect(typeB).toContain('`Negar SUP-<k>`');
    expect(typeB).toMatch(/no `PushNotification`/);
    expect(typeB).toContain('`aprovar SUP-<k>`');
    expect(typeB).toMatch(/never accepts[^\n]*"o dono aprovou"[^\n]*relayed/);
  });

  it("the supervisor is only woken on a refusal, an error and the owner's answer to a type B request", () => {
    const s = section(skill, '## Supervisor requests');
    expect(s).toMatch(
      /only woken on a refusal, an error applying, and the owner's answer to a type B request/,
    );
    expect(s).toMatch(/old supervisor|old session/);
    expect(s).toContain('register the supervisor');
    expect(s).toContain('kind=supervisor');
  });

  it('the fixed owner rule becomes rule add origem=dono, and the order constraint stays a hold', () => {
    const s = section(skill, '## Queue changes during the run');
    expect(s).toMatch(/rule <folder> add[^\n]*origem=dono/);
    expect(s).toMatch(/order constraint[^\n]*`hold`/);
  });

  it('the hourly check applies or refuses the overdue requests', () => {
    const check = skill.slice(skill.indexOf('**Fallback checks:**'));
    const block = check.slice(0, check.indexOf('\n## '));
    expect(block).toMatch(/pedidos do supervisor[^\n]*overdue/);
    expect(block).toMatch(/applies or refuses/);
  });

  it('the session switch says the rules are in the panel, not only in the log', () => {
    const switching = section(skill, '## Session switch');
    const oldSession = switching.slice(
      switching.indexOf('**In the old session:**'),
      switching.indexOf('**In the new session**'),
    );
    expect(oldSession).toMatch(/rules in force[^\n]*panel[^\n]*not only in the `?log`?/);
  });

  it('the "Panel" documents the commands and the new lines', () => {
    const p = section(skill, '## Panel');
    expect(p).toContain('painel.py sup <folder>');
    expect(p).toContain('painel.py requests <folder>');
    expect(p).toContain('painel.py rule <folder> add');
    expect(p).toContain('painel.py rule <folder> end');
    expect(p).toContain('pedidos do supervisor:');
    expect(p).toContain('regras em vigor:');
  });
});
