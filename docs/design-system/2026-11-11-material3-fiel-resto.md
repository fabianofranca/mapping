# Material 3 fiel, resto — 2026-11-11 (épico `epic/material3-fiel-resto`)

## Pendências

- `ComponentDrawing` (`src/canvas/components/renderScene.ts`, `screenRenderer.ts`, `src/model/components/strokeGaps.ts`, `provided.ts`): o desenho passa a seguir `font.align: justify`, a lista de até 4 sombras com `spread`, `stroke.gap`, os `fit` novos do nó `image`, `over` no `$token` de cor e `provide`/`$provided`. Sem token, ícone nem medida nova.
- `CatalogPage` (`src/ui/catalog/CatalogPage.tsx`, `src/theme/catalog.css`): a lista de parâmetros do código ganha a seta entre nome e valor (`.catalog-kv-params`) e as notas da plataforma são lidas como Markdown.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-11: versão 79 (`1794362725-9b46`), numa publicação só, com o índice por último e `lastChange` "Claude Code (épico material3-fiel-resto, fechamento)":

- `components/ComponentDrawing/README.md`: parágrafo novo "Texto, sombra, imagem e cor herdada (formato 4, Material 3 fiel)" e os arquivos novos em "No código".
- `components/CatalogPage/README.md`: parágrafo "Parâmetros do código" e a classe `.catalog-kv-params` em "No código".
- Nenhum token, ícone, `bundle.css` ou `tokens.json` muda: o épico não os toca.

## Ficou sem gravar

- Exemplo novo no `components/ComponentDrawing/preview.html` (sombras em lista, vão no contorno, justificado). Motivo: a prévia é uma rendição estática com formas e cores do tema (o Konva não renderiza fora do app), então não desenha os recursos do formato 4; a regra de cada um ficou escrita no README.
