// @vitest-environment node
// Fase TR1 (etapa #359): os auxiliares da nuvem em `scripts/testing/` (decisão 2) existem, o
// `cloud.mjs` importa sem efeito colateral e exporta os nomes certos, o guia aponta para eles
// (decisão 4) e a parte pura de `cloud.mjs` (`mark`) tem teste unitário.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(file, 'utf8');

/** Linhas de código, sem as que são só comentário (`#`, `//` ou `"""`/`'''` de docstring). */
function codeLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/|"""|''')/.test(line))
    .join('\n');
}

const CLOUD_UP = 'scripts/testing/cloud-up.sh';
const CLOUD_MJS = 'scripts/testing/cloud.mjs';
const ATSPI_ALLOW = 'scripts/testing/atspi-allow.py';
const HELPERS = [CLOUD_UP, CLOUD_MJS, ATSPI_ALLOW];

const EXPECTED_EXPORTS = [
  'allowPermission',
  'cancelDialog',
  'clickNoWait',
  'connect',
  'makeCadastroPng',
  'mark',
  'openFile',
  'saveFile',
  'screenshot',
  'selectFolder',
  'windowShortcut',
].sort();

describe('scripts/testing/: auxiliares da nuvem (TR1)', () => {
  it('os três auxiliares existem', () => {
    for (const file of HELPERS) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('cloud.mjs importa sem efeito colateral e exporta os nomes da decisão 2', async () => {
    const mod: Record<string, unknown> = await import('../../scripts/testing/cloud.mjs');
    expect(Object.keys(mod).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it('nenhum auxiliar registra listener de filechooser nem usa setInputFiles (código, fora de comentário)', () => {
    for (const file of HELPERS) {
      const code = codeLines(read(file));
      expect(code, file).not.toMatch(/filechooser/i);
      expect(code, file).not.toContain('setInputFiles');
    }
  });

  it('cloud-up.sh nunca roda pkill -f chrome como comando (fecha pelo CDP, receita 3)', () => {
    expect(codeLines(read(CLOUD_UP))).not.toContain('pkill -f chrome');
    expect(read(CLOUD_UP)).toContain('Browser.close');
  });

  describe('mark (parte pura de cloud.mjs)', () => {
    let apoioDir: string;

    afterEach(() => {
      if (apoioDir) rmSync(apoioDir, { recursive: true, force: true });
    });

    it('acrescenta "<roteiro> <fase> <hora UTC ISO 8601>" a tempos.log', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      mark(apoioDir, 'ambiente', 'start');
      mark(apoioDir, 'ambiente', 'end');
      const lines = read(path.join(apoioDir, 'tempos.log')).trim().split('\n');
      expect(lines).toHaveLength(2);
      const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      const [roteiro1, fase1, hora1] = lines[0]!.split(' ');
      expect(roteiro1).toBe('ambiente');
      expect(fase1).toBe('start');
      expect(hora1).toMatch(iso);
      const [, fase2, hora2] = lines[1]!.split(' ');
      expect(fase2).toBe('end');
      expect(hora2).toMatch(iso);
      // Ordem cronológica: start antes de end.
      expect(Date.parse(hora1!)).toBeLessThanOrEqual(Date.parse(hora2!));
    });

    it('rejeita uma fase que não seja start/end', async () => {
      apoioDir = mkdtempSync(path.join(tmpdir(), 'mapping-cloud-mark-'));
      const { mark } = await import('../../scripts/testing/cloud.mjs');
      // Valor fora de "start" | "end" só é possível em runtime (ex.: argumento da CLI); o
      // `as unknown` imita isso sem usar `any`.
      const fase = 'meio' as unknown as 'start' | 'end';
      expect(() => mark(apoioDir, 'ambiente', fase)).toThrow();
      expect(existsSync(path.join(apoioDir, 'tempos.log'))).toBe(false);
    });
  });
});

describe('docs/TESTING.md e docs/TESTING-NUVEM.md apontam para os auxiliares (decisão 4)', () => {
  const guide = read('docs/TESTING.md');
  const cloud = read('docs/TESTING-NUVEM.md');
  const appendixA = guide.slice(
    guide.indexOf('## Apêndice A'),
    guide.indexOf('## Apêndice B'),
  );

  it('o apêndice A cita cloud-up.sh e cloud.mjs e cada receita 1 a 8 diz o que o auxiliar faz', () => {
    expect(appendixA).toContain('cloud-up.sh');
    expect(appendixA).toContain('cloud.mjs');
    // Índice da primeira menção de cada receita (1 a 9, a última como limite do bloco da 8ª);
    // o bloco de uma receita vai até a próxima, cobrindo as linhas "continuação" que algumas têm.
    const starts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
      appendixA.indexOf(`Receita ${n} (nuvem)`),
    );
    for (const [i, start] of starts.slice(0, 8).entries()) {
      const marker = `Receita ${i + 1} (nuvem)`;
      expect(start, marker).toBeGreaterThanOrEqual(0);
      const block = appendixA.slice(start, starts[i + 1]);
      expect(block, marker).toMatch(/o auxiliar faz isto: `/i);
    }
  });

  it('os "Primeiros 10 minutos" chamam o cloud-up.sh (itens 4 a 7)', () => {
    const start = cloud.indexOf('## Primeiros 10 minutos');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('cloud-up.sh');
  });

  it('"Como agir" diz que se usam os auxiliares e script próprio só para o que falta', () => {
    const start = cloud.indexOf('## Como agir');
    const end = cloud.indexOf('## ', start + 1);
    const section = cloud.slice(start, end);
    expect(section).toContain('scripts/testing/cloud');
    expect(section).toContain('O que atrapalhou');
  });
});

describe('scripts/testing/ listado no repositório', () => {
  it('só os três auxiliares novos e o cliente MCP por stdio existem na pasta', () => {
    const files = readdirSync('scripts/testing').sort();
    expect(files).toEqual(
      [
        'atspi-allow.py',
        'cloud-up.sh',
        'cloud.d.mts',
        'cloud.mjs',
        'mcp-stdio-client.mjs',
      ].sort(),
    );
  });
});
