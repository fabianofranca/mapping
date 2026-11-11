// @vitest-environment node
// Etapa #1532, fase FM4 (decisões 7 e 8): o painel registra a sessão atual de cada papel (coordenador e
// supervisor), a troca de coordenador é aos 35% e só se arquivam ids registrados.
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

describe('painel.py role / roles (decisão 7)', () => {
  it('role grava id, n, at e link; o seguinte do mesmo papel soma 1', () => {
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

  it('role guarda o id anterior em previous, e id vazio ou n inválido não quebram (revisão)', () => {
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

  it('os papéis têm contagem própria e o papel inválido sai com código 2', () => {
    run('role', dir, 'supervisor', 'session_s');
    expect((meta().roles as Record<string, Record<string, unknown>>).supervisor?.n).toBe(
      1,
    );
    const bad = runRaw('role', dir, 'testador', 'session_x');
    expect(bad.status).toBe(2);
  });

  it('roles imprime coordenador e supervisor, ou —', () => {
    expect(run('roles', dir)).toBe('coordenador —\nsupervisor —\n');
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    run('role', dir, 'supervisor', 'session_s', 'link=https://x/s');
    expect(run('roles', dir)).toBe(
      'coordenador 2: session_b\nsupervisor 1: session_s (https://x/s)\n',
    );
  });

  it('dois role coordenador seguidos dão "coordenador 2" no roles', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    expect(run('roles', dir)).toContain('coordenador 2: session_b');
  });

  it('role com o id já registrado não muda nada: n, previous, at, link e o meta.json ficam iguais (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    const antes = readFileSync(path.join(dir, 'meta.json'), 'utf8');
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
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(antes);
    expect(out).toContain('já é o registrado');
    expect(out).toContain('alterados: nenhum');
  });

  it('role repetido dentro do apply não grava a linha e o resto do lote grava (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    const antes = (meta().roles as Record<string, unknown>).coordenador;
    const lote = path.join(dir, 'lote.txt');
    writeFileSync(lote, 'role coordenador session_b\ncontext 40\n');
    const r = runRaw('apply', dir, lote);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('já é o registrado');
    expect(r.stdout).toContain('alterados:');
    expect(meta().roles).toEqual({ coordenador: antes });
    expect(meta().context).toBe(40);
  });

  it('role com id diferente do registrado soma 1 e guarda o previous (#1628)', () => {
    run('role', dir, 'coordenador', 'session_a');
    run('role', dir, 'coordenador', 'session_b');
    run('role', dir, 'coordenador', 'session_c');
    expect(
      (meta().roles as Record<string, Record<string, unknown>>).coordenador,
    ).toMatchObject({ id: 'session_c', n: 3, previous: 'session_b' });
  });

  it('show: context 35 não avisa; 36 avisa "acima de 35%"', () => {
    run('context', dir, '35');
    expect(run('show', dir)).not.toContain('troque de sessão');
    run('context', dir, '36');
    expect(run('show', dir)).toContain('acima de 35%: troque de sessão agora');
  });
});

describe('implementar-fila: troca aos 35% e uma sessão ativa por papel (decisões 7 e 8)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('"1. Começo" dá o título "Fila — coordenador <n>" e registra o papel', () => {
    const comeco = section(skill, '## 1. Começo');
    expect(comeco).toContain('Fila — coordenador <n>');
    expect(comeco).toContain('role');
    expect(comeco).toContain('prefixo "Fila — coordenador"');
  });

  it('"Painel" descreve o previous e o registro repetido; o item 4 só pede o registro sem esta sessão (#1628)', () => {
    const painel = section(skill, '## Painel');
    expect(painel).toContain('previous');
    expect(painel).toContain('já é o registrado');
    const troca = section(skill, '## Troca de sessão');
    const nova = troca.slice(troca.indexOf('**Na sessão nova**'));
    const passo4 = nova.slice(nova.indexOf('4. '));
    expect(passo4).toContain('só se o `roles` não traz esta sessão');
  });

  it('"Troca de sessão": 35%, título do sucessor, role, archive_session e conferência no get_session', () => {
    const troca = section(skill, '## Troca de sessão');
    expect(troca).toContain('Acima de 35%');
    expect(troca).not.toContain('60%');
    expect(troca).toContain('Fila — coordenador <n>');
    const nova = troca.slice(troca.indexOf('**Na sessão nova**'));
    expect(nova).toContain('role');
    expect(nova).toContain('archive_session');
    const passo4 = nova.slice(nova.indexOf('4. '));
    expect(passo4).toMatch(
      /get_session[^\n]*estado arquivado|estado arquivado[^\n]*get_session/,
    );
    expect(
      troca.slice(
        troca.indexOf('**Na sessão antiga:**'),
        troca.indexOf('**Na sessão nova**'),
      ),
    ).toMatch(/role <pasta> coordenador <id novo>/);
    expect(troca).toContain('`previous`');
    expect(troca).toContain('https://claude.ai/code/<id novo>');
    expect(nova).toMatch(/nova tentativa/);
    expect(nova).toContain('PushNotification');
    const antiga = between(troca, '**Na sessão antiga:**', '**Na sessão nova**');
    expect(antiga).toMatch(/não age/);
  });

  it('"Arquivar as sessões": só ids registrados no painel; a sessão que não é a registrada não age', () => {
    const bloco = skill.slice(skill.indexOf('**Arquivar as sessões**'));
    expect(bloco).toMatch(/só se arquivam ids registrados no painel/i);
    expect(bloco).toContain('meta.sessions');
    expect(bloco).toContain('`anterior`');
    expect(skill).toMatch(/não é a registrada/);
    expect(skill).toMatch(
      /send_message[^\n]*sessão atual|sessão atual[^\n]*send_message/,
    );
  });

  it('"Conferências de reserva" usa 35%', () => {
    const conf = skill.slice(skill.indexOf('**Conferências de reserva:**'));
    expect(conf.slice(0, conf.indexOf('## '))).toContain('acima de 35%');
  });

  it('"Para o dono, nos três chats" diz 35% e o arquivamento', () => {
    const dono = section(flow, '## Para o dono, nos três chats');
    expect(dono).toMatch(/conferência de hora em hora[^\n]*contexto[^\n]*35%/);
    expect(dono).toMatch(/acima de 35%/);
    expect(dono).not.toContain('60%');
    expect(dono).toMatch(/anterior[^\n]*arquivad/);
  });
});
