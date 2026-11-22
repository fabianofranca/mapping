// @vitest-environment node
// Stage #1532, phase FM4 (decisions 7 and 8): the panel records the current session of each role
// (coordinator and supervisor), the coordinator switch happens at 35% and only registered ids are
// archived.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-10T10:00:00Z';
let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}
function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}
function meta(): Record<string, unknown> {
  return (
    JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
      Record<string, unknown>
    >
  )[0]!;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-roles-'));
  run('init', dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('painel.py role / roles (decision 7)', () => {
  it('role writes id, n, at and link; the next one of the same role adds 1', () => {
    run('role', dir, 'coordenador', 'session_a');
    expect((meta().roles as Record<string, unknown>).coordenador).toEqual({
      id: 'session_a',
      n: 1,
      at: NOW,
      link: '',
      previous: '',
    });
    run('role', dir, 'coordenador', 'session_b', 'link=https://x/y');
    expect(
      (meta().roles as Record<string, Record<string, unknown>>).coordenador,
    ).toMatchObject({
      id: 'session_b',
      n: 2,
      link: 'https://x/y',
    });
  });

  it('role keeps the previous id in previous, and an empty id or an invalid n do not break (review)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    expect(
      (meta().roles as Record<string, Record<string, unknown>>).coordenador?.previous,
    ).toBe('session_a');
    expect(runRaw('role', dir, 'coordenador', '').status).toBe(2);
    const m = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
      Record<string, unknown>
    >;
    (m[0]!.roles as Record<string, Record<string, unknown>>).coordenador!.n = null;
    writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m));
    expect(runRaw('role', dir, 'coordenador', 'session_c').status).toBe(0);
    expect(runRaw('roles', dir).status).toBe(0);
  });

  it('the roles have their own count and an invalid role exits with code 2', () => {
    run('role', dir, 'supervisor', 'session_s');
    expect((meta().roles as Record<string, Record<string, unknown>>).supervisor?.n).toBe(
      1,
    );
    const bad = runRaw('role', dir, 'testador', 'session_x');
    expect(bad.status).toBe(2);
  });

  it('roles prints coordenador and supervisor, or —', () => {
    expect(run('roles', dir)).toBe('coordenador —\nsupervisor —\n');
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    run('role', dir, 'supervisor', 'session_s', 'link=https://x/s');
    expect(run('roles', dir)).toBe(
      'coordenador 2: session_b\nsupervisor 1: session_s (https://x/s)\n',
    );
  });

  it('two consecutive role coordenador give "coordenador 2" in roles', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    expect(run('roles', dir)).toContain('coordenador 2: session_b');
  });

  it('role with the already registered id changes nothing: n, previous, at, link and meta.json stay the same (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    const out = execFileSync(
      'python3',
      [
        SCRIPT,
        '--now',
        '2026-11-10T11:00:00Z',
        'role',
        dir,
        'coordenador',
        'session_b',
        'link=https://x/outro',
      ],
      { encoding: 'utf8' },
    );
    expect(
      (meta().roles as Record<string, Record<string, unknown>>).coordenador,
    ).toMatchObject({ id: 'session_b', n: 2, previous: 'session_a' });
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
    expect(out).toContain('já é o registrado');
    expect(out).toContain('alterados: nenhum');
  });

  it('a repeated role inside the apply does not write the line and the rest of the batch is written (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    const before = (meta().roles as Record<string, unknown>).coordenador;
    const batch = path.join(dir, 'batch.txt');
    writeFileSync(batch, 'role coordenador session_b\ncontext 40\n');
    const r = runRaw('apply', dir, batch);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('já é o registrado');
    expect(r.stdout).toContain('alterados: meta.json');
    expect(meta().roles).toEqual({ coordenador: before });
    expect(meta().context).toBe(40);
  });

  it('role with an id different from the registered one adds 1 and keeps the previous (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    run('role', dir, 'coordenador', 'session_c');
    expect(
      (meta().roles as Record<string, Record<string, unknown>>).coordenador,
    ).toMatchObject({ id: 'session_c', n: 3, previous: 'session_b' });
  });

  it('show: context 35 does not warn; 36 warns "acima de 35%"', () => {
    run('context', dir, '35');
    expect(run('show', dir)).not.toContain('troque de sessão');
    run('context', dir, '36');
    expect(run('show', dir)).toContain('acima de 35%: troque de sessão agora');
  });
});

describe('painel.py roles --sessao (stage #1643, SV1, decisions 3 and 4)', () => {
  const BASE_LINES = 'coordenador 2: session_c2\nsupervisor 2: session_s2\n';

  function setMeta(patch: Record<string, unknown>) {
    const file = path.join(dir, 'meta.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
    Object.assign(m[0]!, patch);
    writeFileSync(file, JSON.stringify(m));
  }
  /** Coordinator `session_c1` → `session_c2` and supervisor `session_s1` → `session_s2`. */
  function registerBoth() {
    run('role', dir, 'coordenador', 'session_c1');
    run('role', dir, 'coordenador', 'session_c2');
    run('role', dir, 'supervisor', 'session_s1');
    run('role', dir, 'supervisor', 'session_s2');
  }
  const forSession = (id: string) => run('roles', '--sessao', id, dir);

  it('registrada: the id is roles.supervisor.id', () => {
    registerBoth();
    expect(forSession('session_s2')).toBe(`${BASE_LINES}esta sessão: registrada\n`);
  });

  it('coordenador: roles.coordenador.id, its .previous or a kind=coordenador entry in meta.sessions', () => {
    registerBoth();
    const line = 'esta sessão: coordenador (não supervisiona)\n';
    expect(forSession('session_c2')).toBe(BASE_LINES + line);
    expect(forSession('session_c1')).toBe(BASE_LINES + line);
    setMeta({ sessions: [{ id: 'session_c0', kind: 'coordenador' }] });
    expect(forSession('session_c0')).toBe(BASE_LINES + line);
  });

  it('antiga: roles.supervisor.previous or a kind=supervisor entry in meta.sessions', () => {
    registerBoth();
    const line = 'esta sessão: antiga (atual: session_s2)\n';
    expect(forSession('session_s1')).toBe(BASE_LINES + line);
    setMeta({ sessions: [{ id: 'session_s0', kind: 'supervisor' }] });
    expect(forSession('session_s0')).toBe(BASE_LINES + line);
  });

  it('sucessora: another id, with a registered supervisor', () => {
    registerBoth();
    expect(forSession('session_nova')).toBe(
      `${BASE_LINES}esta sessão: sucessora (antecessor: session_s2)\n`,
    );
    setMeta({ sessions: [{ id: 'session_f', kind: 'fase' }] });
    expect(forSession('session_f')).toContain('sucessora (antecessor: session_s2)');
  });

  it('nova: without roles.supervisor, and also with a panel without roles', () => {
    expect(forSession('session_x')).toBe(
      'coordenador —\nsupervisor —\nesta sessão: nova (nenhum supervisor registrado)\n',
    );
    run('role', dir, 'coordenador', 'session_c1');
    expect(forSession('session_x')).toBe(
      'coordenador 1: session_c1\nsupervisor —\nesta sessão: nova (nenhum supervisor registrado)\n',
    );
    expect(forSession('session_c1')).toContain('coordenador (não supervisiona)');
    const file = path.join(dir, 'meta.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
    delete m[0]!.roles;
    writeFileSync(file, JSON.stringify(m));
    expect(forSession('session_x')).toContain('nova (nenhum supervisor registrado)');
  });

  it('the first that matches wins: registrada, coordenador, antiga, sucessora, nova', () => {
    registerBoth();
    // the same id as registered supervisor and as previous coordinator: registrada wins
    setMeta({ sessions: [{ id: 'session_s2', kind: 'coordenador' }] });
    expect(forSession('session_s2')).toContain('esta sessão: registrada');
    // the same id as previous supervisor and as coordinator: coordenador wins
    setMeta({
      sessions: [
        { id: 'session_s1', kind: 'coordenador' },
        { id: 'session_s1', kind: 'supervisor' },
      ],
    });
    expect(forSession('session_s1')).toContain(
      'esta sessão: coordenador (não supervisiona)',
    );
  });

  it('--sessao with spaces or a line break around it counts as the id without them (review)', () => {
    registerBoth();
    expect(forSession(' session_s2\n')).toBe(`${BASE_LINES}esta sessão: registrada\n`);
    expect(forSession('session_s1 ')).toContain('antiga (atual: session_s2)');
  });

  it('an empty --sessao (or only spaces) exits with code 2 and the message', () => {
    for (const blank of ['', '  ']) {
      const r = runRaw('roles', '--sessao', blank, dir);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('o id da sessão não pode ser vazio');
      expect(r.stdout).toBe('');
    }
  });

  it("without --sessao the output is today's, byte by byte", () => {
    registerBoth();
    expect(run('roles', dir)).toBe(BASE_LINES);
  });

  it('roles --sessao does not enter the apply and writes nothing', () => {
    registerBoth();
    const before = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    forSession('session_nova');
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(before);
    const batch = path.join(dir, 'batch.txt');
    writeFileSync(batch, 'roles --sessao session_nova\n');
    expect(runRaw('apply', dir, batch).status).toBe(2);
  });
});

describe('implementar-fila: "Find or create", step 1, finds the panel by the pinned one (stage #1643, SV1, decision 2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const find = section(skill, '## Panel');
  const step1 = between(find, '\n1. `Artifact` `list`', '\n2. Found:');

  it('lists the candidates by the three titles, with limit 50, the pinned ones first and then the newest', () => {
    expect(step1).toContain('scope: "mine"');
    expect(step1).toContain('limit: 50');
    for (const title of [
      'Estado da execução',
      'Fila de desenvolvimento',
      'Mapping Fila',
    ]) {
      expect(step1).toContain(`"${title}"`);
    }
    expect(step1).toContain('pinned');
    expect(step1).toMatch(/from newest to oldest/);
  });

  it('the panel is the first whose meta has roles, read by ArtifactData get and Artifact read with out_dir', () => {
    expect(step1).toContain('ArtifactData');
    expect(step1).toContain('datasets');
    expect(step1).toContain('`meta`');
    expect(step1).toContain('out_dir');
    expect(step1).toMatch(/painel\.py roles/);
    expect(step1).toMatch(/—/);
    expect(step1).toContain('painel=novo');
    // at least one registered role (not both) and it stops at the first that fits (review)
    expect(step1).toMatch(/at least one role/);
    expect(step1).toMatch(/stop at the first/);
  });
});

describe('implementar-fila: switch at 35% and one active session per role (decisions 7 and 8)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('"1. Start" gives the title "Fila — coordenador <n> · linhagem <depth>/<limit>" and registers the role', () => {
    const start = section(skill, '## 1. Start');
    expect(start).toContain('"Fila — coordenador <n> · linhagem <depth>/<limit>"');
    expect(start).toContain('`lineage.depth`');
    expect(start).toContain('`lineage.limit`');
    expect(start).toContain('role');
    expect(start).toContain('prefix "Fila — coordenador"');
  });

  it('"Panel" describes the previous and the repeated registration; item 4 only asks to register when the roles lack this session (#1628)', () => {
    const panel = section(skill, '## Panel');
    expect(panel).toContain('previous');
    expect(panel).toContain('já é o registrado');
    const switching = section(skill, '## Session switch');
    const newSession = switching.slice(switching.indexOf('**In the new session**'));
    const step4 = newSession.slice(newSession.indexOf('\n4. '));
    expect(step4).toContain('only if `roles` does not list this session');
  });

  it('"Session switch": 35%, successor title, role, archive_session and the check in get_session', () => {
    const switching = section(skill, '## Session switch');
    expect(switching).toContain('Above 35%');
    expect(switching).not.toContain('60%');
    expect(switching).toContain('"Fila — coordenador <n> · linhagem <d>/<limit>"');
    expect(switching).toMatch(/<d>[^\n]*`lineage\.depth`[^\n]*plus 1/);
    const newSession = switching.slice(switching.indexOf('**In the new session**'));
    expect(newSession).toContain('role');
    expect(newSession).toContain('archive_session');
    const step4 = newSession.slice(newSession.indexOf('4. '));
    expect(step4).toMatch(
      /get_session[^\n]*archived state|archived state[^\n]*get_session/,
    );
    expect(
      switching.slice(
        switching.indexOf('**In the old session:**'),
        switching.indexOf('**In the new session**'),
      ),
    ).toMatch(/role <folder> coordenador <new id>/);
    expect(switching).toContain('`previous`');
    expect(switching).toContain('https://claude.ai/code/<new id>');
    expect(newSession).toMatch(/once more/);
    expect(newSession).toContain('PushNotification');
    const oldSession = between(
      switching,
      '**In the old session:**',
      '**In the new session**',
    );
    expect(oldSession).toMatch(/does not act/);
  });

  it('"Archive the sessions": only ids registered in the panel; a session that is not the registered one does not act', () => {
    const block = skill.slice(skill.indexOf('**Archive the sessions**'));
    expect(block).toMatch(/only ids registered in the panel are archived/i);
    expect(block).toContain('meta.sessions');
    expect(block).toContain('`anterior`');
    expect(skill).toMatch(/that is not the one registered/);
    expect(skill).toMatch(
      /send_message[^\n]*current session|current session[^\n]*send_message/,
    );
  });

  it('"Fallback checks" uses 35%', () => {
    const checks = skill.slice(skill.indexOf('**Fallback checks:**'));
    expect(checks.slice(0, checks.indexOf('## '))).toContain('acima de 35%');
  });

  it('"For the owner, in the three chats" says 35% and the archiving', () => {
    const owner = section(flow, '## For the owner, in the three chats');
    expect(owner).toMatch(/hourly check[^\n]*context[^\n]*35%/);
    expect(owner).toMatch(/above 35%/);
    expect(owner).not.toContain('60%');
    expect(owner).toMatch(/archives the previous/);
  });
});
