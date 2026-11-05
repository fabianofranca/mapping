# Textos da interface, linha de aviso e guia acertados — 2026-11-05 (épico `epic/textos-e-avisos`)

## Pendências

- **`NoticeBadge` (linha de aviso, `NoticeLine`):** a `.notice-line` passa a ser um grid de duas colunas (`auto 1fr`, `align-items: start`): o ícone fica na coluna da esquerda, alinhado à primeira linha, e a mensagem (com `since` e `ref`) quebra na coluna da direita. Antes era um flex com quebra, e o ícone ficava sozinho acima da mensagem longa. Só tokens (`--space-*`). Arquivo: `src/theme/details.css` (`.notice-line`). Atualizar a variante "linha" do `NoticeBadge` no artefato.
- **Textos:** a dica de Posição e Tamanho do painel da marcação e o texto da biblioteca em Especializações mudaram (sem impacto visual).

## Sincronização

_(preenchida no fechamento do épico)_

## Ficou sem gravar

_(preenchida no fechamento do épico)_
