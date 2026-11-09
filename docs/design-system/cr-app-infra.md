# CR da app, armazenamento, visualizador, scripts e CI — [Não lançado] (épico `epic/cr-app-infra`)

## Pendências

- **Botões avulsos:** `docs/DESIGN-SYSTEM.md` ganhou a seção "Botões avulsos (exceções ao `Button`)", com os itens de navegação da faixa lateral da tela inicial (`.home-nav-item`). Nada a gravar no artefato.
- **`Button` com `button-link` dentro de `.notice`:** os quatro botões de ação dos avisos sobre o canvas (`CanvasNotices`: Dispensar, Tentar de novo) passaram de `<button class="link">` para `Button` (`size="sm"`, `button-link`); a regra `.notice .button-link` (`src/theme/base.css`) mantém a cor herdada e o sublinhado. Conferir no preview do aviso (`CanvasNotices`/`StatusBar`) se o botão do aviso é desenhado como `Button` com `button-link`.
- Os diálogos "novo projeto" e "configurar pasta" da tela inicial agora são um componente só (`ProjectNameDialog`, `src/app/HomeDialogs.tsx`); a aparência é a mesma (`Dialog` com `TextField`, Cancelar e Criar).

## Sincronização

A preencher no fechamento do épico.

## Ficou sem gravar

A preencher no fechamento do épico.
