# TextField

Campo de texto de uma linha, do `src/ui/controls/TextField.tsx`.

- Com `rotulo`, o campo vira `<label class="field">`: o texto vai em cima (12 px, `color-text-muted`) e a caixa embaixo.
- A caixa tem 28 px (24 px no `size="sm"`), fundo `color-bg` e borda `color-border-control`. O desenho troca a altura entre as duas conforme o `size`.
- `invalido`: fundo `color-danger-bg` e borda `color-danger`.

Hover, foco, somente leitura e desabilitado vêm do CSS. O placeholder não é desenhado. Para várias linhas, use o `TextArea` do mesmo arquivo.
