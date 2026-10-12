import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// R2 (docs/redesign/HANDOFF.md): foco visível em tudo e altura dos controles pelos papéis.

const DIR = 'src/theme';
const css = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(`${DIR}/${f}`, 'utf8')]),
);

describe('foco visível', () => {
  it('nenhum CSS remove o contorno de foco', () => {
    for (const [file, text] of Object.entries(css)) {
      expect(text, file).not.toMatch(/outline\s*:\s*(none|0)\b/);
      expect(text, file).not.toMatch(/outline-style\s*:\s*none/);
    }
  });

  it('há um anel global em :focus-visible com o token de foco', () => {
    expect(css['base.css']).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/,
    );
  });
});

describe('altura dos controles', () => {
  it.each(['.button', '.icon-button', '.segmented-item', '.input', '.tab'])(
    '%s usa a altura do papel --control-height',
    (selector) => {
      const rule = new RegExp(
        `(?:^|[\\s,])${selector.replace('.', '\\.')}[^{]*\\{[^}]*min-height:\\s*var\\(--control-height\\)`,
        'm',
      );
      expect(css['controls.css']).toMatch(rule);
    },
  );
});

// R4 (seção Layouts e ToolStripButton do DS 2.0): a faixa é discreta e a janela sem
// foco esmaece a seleção.
describe('janelas de ferramenta', () => {
  it('o botão da faixa com a janela aberta usa a seleção fraca, não o azul de alternância', () => {
    expect(css['editor.css']).toMatch(
      /\.tool-strip \.icon-button\[aria-pressed='true'\][^{]*\{[^}]*background: var\(--color-selection-muted\)/,
    );
  });

  it('a janela sem foco esmaece a linha selecionada', () => {
    expect(css['editor.css']).toMatch(
      /\.tool-window:not\(:focus-within\)[^{]*\{[^}]*background: var\(--color-selection-muted\)/,
    );
  });
});

// Etapa 6 (6.4): regras de CSS por trás dos achados 2, 3, 5 e 6 (o e2e mede o layout).
describe('etapa 6.4: tooltips, camadas, tabela e Diagnóstico', () => {
  it('a dica fica fora do fluxo (posição fixa): oculta, não alarga nem rola o contêiner', () => {
    expect(css['controls.css']).toMatch(/\.tooltip\s*\{[^}]*position:\s*fixed/);
  });

  it('com o menu aberto (aria-expanded), a dica do botão não aparece por cima dele', () => {
    expect(css['controls.css']).toMatch(
      /\.tooltip-anchor:has\(\[aria-haspopup\]\[aria-expanded='true'\]\) \.tooltip[^{]*\{[^}]*display:\s*none/,
    );
  });

  it('o editor recorta em vez de rolar (overflow: clip): o foco não o desloca', () => {
    expect(css['layout.css']).toMatch(/\.editor\s*\{[^}]*overflow:\s*clip/);
  });

  it('as linhas da janela Camadas não encolhem: a lista rola', () => {
    expect(css['panels.css']).toMatch(/\.layer-row\s*\{[^}]*flex:\s*none/);
  });

  it('Diagnóstico: Hora e Contexto sem quebra no meio', () => {
    expect(css['panels.css']).toMatch(
      /\.diagnostics-nowrap\s*\{[^}]*white-space:\s*nowrap/,
    );
  });

  it('tabela: as linhas dividem as mesmas colunas (subgrid)', () => {
    expect(css['details.css']).toMatch(
      /\.data-grid \.grid-row\s*\{[^}]*grid-template-columns:\s*subgrid/,
    );
  });
});
