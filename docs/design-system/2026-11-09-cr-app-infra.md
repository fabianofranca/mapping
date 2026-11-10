# CR da app, armazenamento, visualizador, scripts e CI — 2026-11-09 (épico `epic/cr-app-infra`)

## Pendências

- **Botões avulsos:** `docs/DESIGN-SYSTEM.md` ganhou a seção "Botões avulsos (exceções ao `Button`)", com os itens de navegação da faixa lateral da tela inicial (`.home-nav-item`). Nada a gravar no artefato.
- **`Button` com `button-link` dentro de `.notice`:** os quatro botões de ação dos avisos sobre o canvas (`CanvasNotices`: Dispensar, Tentar de novo) passaram de `<button class="link">` para `Button` (`size="sm"`, `button-link`); a regra `.notice .button-link` (`src/theme/base.css`) mantém a cor herdada e o sublinhado. Conferir no preview do aviso (`CanvasNotices`/`StatusBar`) se o botão do aviso é desenhado como `Button` com `button-link`.
- Os diálogos "novo projeto" e "configurar pasta" da tela inicial agora são um componente só (`ProjectNameDialog`, `src/app/HomeDialogs.tsx`); a aparência é a mesma (`Dialog` com `TextField`, Cancelar e Criar).

- **Token novo `opacity-viewer-hover` (`0.8`):** opacidade do contorno de hover do visualizador embutível (antes um `rgba(26, 99, 204, 0.8)` fixo em `viewer/viewer.ts`); a cor continua `color-accent`. Gravar a opacidade na seção de opacidades do artefato (hoje 8 tokens; passa a 9).
- **Tokens novos do guia interativo (item 66):** `space-px` (`1px`, respiro fino de rótulos), `size-accent-bar` (`4px`, barra de cor da anotação) e `opacity-mark-fill` / `opacity-mark-fill-selected` (`0.07` / `0.28`, preenchimento da marcação). Gravar nas seções de espaço, tamanhos e opacidades do artefato (opacidades passam de 9 a 11).

## Sincronização

Gravado no artefato Mapping em 2026-11-09 (versão 66):

- `tokens.json`: `space-px` (1px), `size-accent-bar` (4px), `opacity-mark-fill` (0.07), `opacity-mark-fill-selected` (0.28) e `opacity-viewer-hover` (0.8); as opacidades passam de 7 a 10 (o épico `cr-i18n-tema` tinha removido dois tokens, por isso a contagem de partida era 7, não 8).
- `components/Home/README.md`: nota do `ProjectNameDialog` (novo projeto e nome da pasta, um componente só).
- Índice (`design-system.json`): `lastChange` atualizado.
- "Botões avulsos": já está em `docs/DESIGN-SYSTEM.md`; nada a gravar no artefato.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: botão `Button` `size="sm"` `button-link` dentro de `.notice` (Dispensar e Tentar de novo de `CanvasNotices`): guia do `Notice` e `bundle.css` (texto, DS3) e exemplo no preview do `Notice` (prévia, DS5).
