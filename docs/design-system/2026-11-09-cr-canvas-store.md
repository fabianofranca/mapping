# CR do canvas e do store — 2026-11-09 (épico `epic/cr-canvas-store`)

## Pendências

Nenhuma aberta: as duas pendências do épico (tokens dos pinos e selos, fase 1; tokens do desenho dos componentes, fase 3) estão em `## Ficou sem gravar`.

## Sincronização

Nada foi gravado no artefato Mapping do Claude Design: o fechamento automatizado não grava no artefato curado à mão (as pessoas o editam ao vivo e a gravação pede a leitura prévia do índice). As duas pendências do épico passam para `## Ficou sem gravar`.

## Ficou sem gravar

- Tokens novos dos pinos de conversa e do selo de chegada, na seção `Canvas.md` (e na lista de tokens de tamanho): `size-cv-pin-height` (20px), `size-cv-pin-pad` (8px), `size-cv-pin-glyph` (12px), `size-cv-pin-glyph-gap` (2px), `size-cv-pin-char` (7px, largura estimada por letra do rótulo), `size-cv-arrival-height` (20px), `size-cv-arrival-pad` (8px), `size-cv-arrival-gap` (4px), `size-cv-arrival-gap-below` (10px), `size-cv-arrival-name-band` (24px) e `size-cv-arrival-char` (7px). Os valores são os de antes (nada muda na tela); vêm de `src/theme/tokens.ts` e são lidos por `src/canvas/theme.ts` (`CanvasTokens.pin` e `CanvasTokens.arrival`) (fase 1).
- Tokens novos do desenho dos componentes (seção `Canvas.md`, junto de `cv-component-placeholder` e `cv-component-unknown`): `cv-component-unknown-fill` (`rgba(216, 27, 96, 0.06)`, preenchimento da caixa de tipo sem componente, igual nos dois temas) e `opacity-slot` (`0.6`, contorno do slot). O texto da caixa usa `t-cv-image` e `font-sans`, e a cor, `cv-component-unknown`. Valores iguais aos que estavam fixos no código (nada muda na tela); lidos por `CanvasTokens.component` (fase 3).
