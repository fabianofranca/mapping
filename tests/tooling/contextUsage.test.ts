// @vitest-environment node
// Etapa #1699, fase CM1 (decisões 1 a 11): a medida de contexto pelo transcript local da própria
// sessão (`scripts/ci/contextUsage.mjs`) e os textos do fluxo que passam a usá-la. A unidade e a CLI
// rodam com fixtures `.jsonl` numa pasta temporária (`CLAUDE_CONFIG_DIR` e
// `CLAUDE_CODE_SESSION_ID` no `env` do processo); o resto é teste de texto.
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem declaração de tipos
import { lastContext } from '../../scripts/ci/contextUsage.mjs';
import { between, section } from '../support/textSlice';

interface Usage {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
const lastOf = lastContext as (text: string) => number | null;

/** Linha de mensagem do assistente, no formato real do transcript (subconjunto das chaves). */
function assistant(
  usage: Usage,
  extra: { isSidechain?: boolean; model?: string } = {},
): string {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: extra.isSidechain ?? false,
    message: { model: extra.model ?? 'claude-sonnet-5-5', role: 'assistant', usage },
  });
}
const user = JSON.stringify({
  type: 'user',
  isSidechain: false,
  message: { role: 'user' },
});
const main = (n: number): string =>
  assistant({
    input_tokens: 2,
    cache_read_input_tokens: n - 2 - 100,
    cache_creation_input_tokens: 100,
  });

let dir: string;
let counter = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'context-usage-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  values: Record<string, string>;
}

/** Cria `<config>/projects/p/<id>.jsonl` com as linhas e devolve a pasta de configuração. */
function transcript(id: string, lines: string[]): { config: string; file: string } {
  const config = join(dir, `cfg-${counter++}`);
  const folder = join(config, 'projects', 'p');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${id}.jsonl`);
  writeFileSync(file, lines.join('\n') + '\n');
  return { config, file };
}

function cli(args: string[], env: Record<string, string | undefined>): Run {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.CLAUDE_CODE_SESSION_ID;
  delete clean.CLAUDE_CONFIG_DIR;
  const r = spawnSync('node', ['scripts/ci/contextUsage.mjs', ...args], {
    encoding: 'utf8',
    env: { ...clean, ...env },
  });
  const values: Record<string, string> = {};
  for (const line of r.stdout.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) values[line.slice(0, i)] = line.slice(i + 1);
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, values };
}

describe('CM1 — contextUsage.mjs: a conta (decisão 2)', () => {
  it('a última mensagem do fio principal ganha', () => {
    const text = [main(100_000), user, main(120_000), user].join('\n');
    expect(lastOf(text)).toBe(120_000);
  });

  it('linhas isSidechain, <synthetic>, de soma 0 e não-JSON ficam de fora', () => {
    const text = [
      main(150_000),
      assistant(
        { input_tokens: 9, cache_read_input_tokens: 900_000 },
        { isSidechain: true },
      ),
      assistant(
        { input_tokens: 5, cache_read_input_tokens: 800_000 },
        { model: '<synthetic>' },
      ),
      assistant({ input_tokens: 0, cache_read_input_tokens: 0 }),
      '{"type":"assistant","message":{"usage":{"input_tok',
    ].join('\n');
    expect(lastOf(text)).toBe(150_000);
  });

  it('usage sem cache_creation_input_tokens conta 0 para ele', () => {
    const text = assistant({ input_tokens: 3, cache_read_input_tokens: 40_000 });
    expect(lastOf(text)).toBe(40_003);
  });

  it('sem mensagem do assistente com usage dá null', () => {
    expect(lastOf([user, '', 'não é json'].join('\n'))).toBeNull();
    expect(lastOf('')).toBeNull();
  });
});

describe('CM1 — contextUsage.mjs: a CLI (decisões 1 e 3)', () => {
  it('lê o transcript do CLAUDE_CODE_SESSION_ID e imprime as chaves, com fonte=sessao', () => {
    const { config, file } = transcript('abc', [user, main(112_697)]);
    const r = cli([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'abc' });
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n').map((l) => l.split('=')[0])).toEqual([
      'contexto',
      'mil',
      'acima',
      'fonte',
      'arquivo',
      '',
    ]);
    expect(r.values).toMatchObject({
      contexto: '112697',
      mil: '113',
      acima: 'false',
      fonte: 'sessao',
      arquivo: file,
    });
  });

  it('sem a variável, fonte=recente: o mais novo direto em projects/*/, ignorando subagents/', () => {
    const { config, file } = transcript('velho', [main(50_000)]);
    const folder = join(config, 'projects', 'p');
    const novo = join(folder, 'novo.jsonl');
    writeFileSync(novo, main(70_000) + '\n');
    mkdirSync(join(folder, 'novo', 'subagents'), { recursive: true });
    const sub = join(folder, 'novo', 'subagents', 'agent-1.jsonl');
    writeFileSync(
      sub,
      assistant({ input_tokens: 1, cache_read_input_tokens: 900_000 }) + '\n',
    );
    utimesSync(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(novo, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
    utimesSync(sub, new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'));
    const r = cli([], { CLAUDE_CONFIG_DIR: config });
    expect(r.status).toBe(0);
    expect(r.values).toMatchObject({
      contexto: '70000',
      fonte: 'recente',
      arquivo: novo,
    });
  });

  it('o mesmo id em duas pastas de projects/: vale o transcript mais recente', () => {
    const { config, file } = transcript('dup', [main(10_000)]);
    const outra = join(config, 'projects', 'q');
    mkdirSync(outra, { recursive: true });
    const novo = join(outra, 'dup.jsonl');
    writeFileSync(novo, main(20_000) + '\n');
    utimesSync(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(novo, new Date('2026-01-02T00:00:00Z'), new Date('2026-01-02T00:00:00Z'));
    const r = cli([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'dup' });
    expect(r.values).toMatchObject({ contexto: '20000', fonte: 'sessao', arquivo: novo });
  });

  it('--arquivo lê esse arquivo, com fonte=arquivo', () => {
    const { file } = transcript('qualquer', [main(33_333)]);
    const r = cli(['--arquivo', file], {});
    expect(r.status).toBe(0);
    expect(r.values).toMatchObject({
      contexto: '33333',
      mil: '34',
      fonte: 'arquivo',
      arquivo: file,
    });
  });

  it('--teto: 300000 não está acima, 300001 está (o padrão é 300000)', () => {
    const a = transcript('a', [main(300_000)]);
    const b = transcript('b', [main(300_001)]);
    const env = (c: string, id: string) => ({
      CLAUDE_CONFIG_DIR: c,
      CLAUDE_CODE_SESSION_ID: id,
    });
    expect(cli([], env(a.config, 'a')).values.acima).toBe('false');
    expect(cli([], env(b.config, 'b')).values.acima).toBe('true');
    expect(cli(['--teto', '299999'], env(a.config, 'a')).values.acima).toBe('true');
    expect(cli(['--teto', '300001'], env(b.config, 'b')).values.acima).toBe('false');
  });

  it('--max imprime pct, arredondado para cima, depois de arquivo=', () => {
    const { file } = transcript('m', [main(350_001)]);
    const r = cli(['--arquivo', file, '--max', '1000000'], {});
    expect(r.status).toBe(0);
    expect(r.values.pct).toBe('36');
    expect(r.stdout.trimEnd().split('\n').pop()).toBe('pct=36');
    expect(cli(['--arquivo', file], {}).values.pct).toBeUndefined();
  });

  it('sem medida dá código 1, com contexto=? e motivo=', () => {
    const vazio = transcript('v', [user]);
    const r = cli([], { CLAUDE_CONFIG_DIR: vazio.config, CLAUDE_CODE_SESSION_ID: 'v' });
    expect(r.status).toBe(1);
    expect(r.values.contexto).toBe('?');
    expect(r.values.motivo).toBeTruthy();

    const semArquivo = cli([], {
      CLAUDE_CONFIG_DIR: join(dir, 'nao-existe'),
      CLAUDE_CODE_SESSION_ID: 'x',
    });
    expect(semArquivo.status).toBe(1);
    expect(semArquivo.values.contexto).toBe('?');
    expect(semArquivo.values.motivo).toBeTruthy();
  });

  it('erro de uso dá código 2, com a mensagem no stderr', () => {
    const r1 = cli(['--teto'], {});
    expect(r1.status).toBe(2);
    expect(r1.stderr).toContain('Uso:');
    const r2 = cli(['--max', 'abc'], {});
    expect(r2.status).toBe(2);
    expect(r2.stderr).toContain('Uso:');
    const r3 = cli(['--desconhecida'], {});
    expect(r3.status).toBe(2);
    expect(r3.stderr).toContain('Uso:');
  });
});

describe('CM1 — textos do fluxo que usam a medida (decisões 5 a 10)', () => {
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const nuvem = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const fila = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const supervisao = readFileSync('.claude/skills/supervisionar-fila/SKILL.md', 'utf8');

  const phase = section(flow, '## Para a sessão da fase');
  const item3 = between(phase, '3. Subagentes e esforço', '4. Todo briefing');
  const teto = item3.slice(item3.indexOf('   - **Teto de contexto da fase:**'));
  const item7 = between(phase, '7. Ao terminar, avise', '8. ');

  it('FLOW item 3: a medida é o script, e o get_session fica de fora por ler 0 no turno', () => {
    expect(teto).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(teto).toContain('`acima=true`');
    expect(teto).toContain('300 mil');
    expect(teto).toContain('300.000');
    expect(teto).toContain('`external_metadata.context_usage.used_tokens`');
    expect(teto).toMatch(/só muda no fim de um turno/);
    expect(teto).toContain('item 8');
  });

  it('FLOW item 3: a transição pelo git show e o "sem medida"', () => {
    expect(teto).toContain('git show origin/main:scripts/ci/contextUsage.mjs');
    expect(teto).toContain('`Contexto: sem medida (<motivo>)`');
    expect(teto).toContain('código 1');
  });

  it('FLOW item 3: o número do pedido de troca é o mil do script', () => {
    expect(teto).toContain('`mil`');
    expect(teto).toContain(
      '`Troca de sessão da fase <código>: contexto <n> mil; passagem em',
    );
  });

  it('FLOW item 7: o aviso final traz a linha Contexto', () => {
    expect(item7).toContain('`Contexto: <mil> mil`');
    expect(item7).toContain('`Contexto: sem medida (<motivo>)`');
  });

  const contexto = between(nuvem, '**Contexto até 300 mil.**', '\n\n');
  const entrega = between(nuvem, '**Entrega, no fim da rodada:**', '6. **Cole o Resumo');
  const aviso = entrega.slice(entrega.indexOf('5. **Avise o coordenador**'));

  it('TESTING-NUVEM: o testador mede antes de cada lote e antes do aviso, sem ação nova', () => {
    expect(contexto).toContain('300 mil');
    expect(contexto).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(contexto).toContain('antes de entregar cada lote');
    expect(contexto).toContain('antes do aviso');
    expect(contexto).toContain('`Contexto por lote: ');
    expect(contexto).toContain('"O que atrapalhou"');
    expect(contexto).toContain('`get_session`');
    expect(contexto).toContain('sem chamar o dono');
  });

  it('TESTING-NUVEM: o aviso termina com "; contexto <mil> mil" nos três formatos', () => {
    expect(aviso).toContain('`; contexto <mil> mil`');
    expect(aviso).toContain('`; contexto sem medida (<motivo>)`');
    expect(aviso).toContain('19min32s; contexto ');
    expect(aviso).toMatch(/Grupo 2 de 3: [^"]*; contexto \d+ mil"/);
    expect(aviso).toMatch(/Bloco 2 de 5: [^"]*; contexto \d+ mil"/);
  });

  const porEtapa = section(fila, '## 3. Por etapa');
  const troca = section(fila, '## Troca de sessão');

  it('implementar-fila: a conferência de reserva mede com --max e cai no get_session sem medida', () => {
    const conferencia = between(
      porEtapa,
      '- Na conferência, o **primeiro passo** é o contexto',
      '- Depois, confira se o skill',
    );
    expect(conferencia).toContain(
      '`node scripts/ci/contextUsage.mjs --max <max_tokens>`',
    );
    expect(conferencia).toContain('`painel.py context <pasta> <pct>`');
    expect(conferencia).toContain('`pct`');
    expect(conferencia).toContain('`used_tokens`');
  });

  it('implementar-fila: a "Troca de sessão" mede com --max e o ctx do próprio custo vem do script', () => {
    expect(troca).toContain('`node scripts/ci/contextUsage.mjs --max <max_tokens>`');
    expect(troca).toContain('`painel.py context <pasta> <pct>`');
    const antiga = between(troca, '**Na sessão antiga:**', '2. Crie a sessão nova');
    expect(antiga).toContain('`ctx`');
    expect(antiga).toContain('`contexto` do script');
    expect(antiga).toContain('`usd`');
  });

  it('implementar-fila: "Custo" tem o ainda trabalhando e a sentinela com o log divergente', () => {
    const custo = between(porEtapa, '- **Custo:**', '- **Só se arquivam ids registrados');
    expect(custo).toContain('`status_bucket`');
    expect(custo).toContain('`working`');
    expect(custo).toContain('`ainda trabalhando`');
    expect(custo).toContain('Sentinela');
    expect(custo).toContain('0 ≤ ctx − n ≤ 15');
    expect(custo).toContain(
      '<rótulo>: medida de contexto divergente (aviso <n> mil, get_session <ctx> mil)',
    );
    expect(custo).toContain('A etapa não para');
  });

  it('implementar-fila: a mudança é pequena (a regra de skill grande é de 60 linhas)', () => {
    expect(fila.split('\n').length).toBeLessThan(540);
    expect(section(fila, '## Regras desta fila')).not.toContain('contextUsage');
  });

  it('supervisionar-fila: "Tamanho e base" mede pelo script, base no fim do primeiro turno e ~50% pelo pct', () => {
    const supTroca = section(supervisao, '## Troca de sessão');
    const tamanho = between(supTroca, '**Tamanho e base.**', '**Troca no retorno');
    expect(tamanho).toContain('`node scripts/ci/contextUsage.mjs`');
    expect(tamanho).toContain('`contexto`');
    expect(tamanho).toContain('--max <max_tokens>');
    expect(tamanho).toContain('`pct`');
    expect(tamanho).toContain('no fim do primeiro turno');
    expect(tamanho).toContain('~50%');
    expect(tamanho).toContain('`external_metadata.context_usage.used_tokens`');
  });
});
