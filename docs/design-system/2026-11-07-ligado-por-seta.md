# Ligado por seta — 2026-11-07 (épico `epic/ligado-por-seta`)

## Pendências

### LS1 — seção Ligado por seta nos Detalhes da marcação

- `MarkingPanel`: nova seção recolhível **Ligado por seta** (`Section` com contagem), depois de **Anotações** e antes de "Outras mudanças"; só existe com seta na marcação. Preview novo ou estado novo no guia do `MarkingPanel`.
- Linha da seta (`.arrow-link`, `li` de uma lista sem marcador): ícone de direção (`arrowRight` sai, `arrowLeft` chega, com nome acessível "Sai para" / "Chega de"), `Button` `sm` `ghost` com o nome da outra ponta (seleciona a ponta; encolhe com reticências), nome da seta em texto secundário e `IconButton` `sm` com o ícone `arrow` (**Selecionar a seta**, dica com o nome dela). Ponta removida vira texto neutro, sem botão.
- Conteúdo da linha, só leitura: grupo por camada sem cabeçalho de `LayerGroup` (`.arrow-link-layer`: bolinha `.layer-dot` com `--layer-color` e nome, nunca só a cor), com `AnnotationTitle` e `AnnotationLines` (`.arrow-link-annotation`, `.arrow-link-line`, `.arrow-link-key`); bloco **Na seta** (`.arrow-link-on-arrow`) com o mesmo grupo; estado vazio "Sem anotações nas camadas visíveis." (`.arrow-link-empty`). Nenhum `+`, nenhum campo.
- `AnnotationsPanel`: `PagedList` agora é exportada (a seção reaproveita a paginação da revisão); sem mudança visual.
- Ícones novos: nenhum (`arrow`, `arrowLeft`, `arrowRight`). Tokens novos: nenhum.

## Sincronização

Versões 51 (conteúdo) e 52 (índice) do artefato, de 2026-11-07. **`MarkingPanel`:** o guia (`README.md`) ganhou a seção **Ligado por seta** (linha de seta com direção, botão da ponta, **Selecionar a seta**, grupo por camada só de leitura, **Na seta** e o estado vazio) e o arquivo de código dela. Sem ícone nem token novo. O `preview.html` não foi alterado.

## Ficou sem gravar

- O `preview.html` do `MarkingPanel` não ganhou o estado com a seção **Ligado por seta**, nem o `bundle.css` as classes `.arrow-link*` (o preview tem 119 KB e a gravação ficou só no guia).
