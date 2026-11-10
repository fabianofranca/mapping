# Textos da interface, linha de aviso e guia acertados — 2026-11-05 (épico `epic/textos-e-avisos`)

## Pendências

- **`NoticeBadge` (linha de aviso, `NoticeLine`):** a `.notice-line` passa a ser um grid de duas colunas (`auto 1fr`, `align-items: start`): o ícone fica na coluna da esquerda, alinhado à primeira linha, e a mensagem (com `since` e `ref`) quebra na coluna da direita. Antes era um flex com quebra, e o ícone ficava sozinho acima da mensagem longa. Só tokens (`--space-*`). Arquivo: `src/theme/details.css` (`.notice-line`). Atualizar a variante "linha" do `NoticeBadge` no artefato.
- **Textos:** a dica de Posição e Tamanho do painel da marcação e o texto da biblioteca em Especializações mudaram (sem impacto visual).

## Sincronização

Gravado no artefato **Mapping** em 2026-11-05: versão 35 (conteúdo) e versão 36 (índice, só com o `lastChange`).

- **`NoticeBadge`:** o guia (`README.md`) descreve o grid de duas colunas da linha de aviso (`auto 1fr`, vão `space-2`, `align-items: start`); o `bundle.css` ganhou a regra nova de `.notice-line` (e `.notice-origin` e `.notice-since` na coluna 2), igual a `src/theme/details.css`; a prévia ganhou um exemplo de mensagem longa em coluna estreita (`height` de 1700 para 1840).
- **Textos:** a dica de Posição e Tamanho ("Em pixels do container" na marcação de container, "Em unidades do canvas" na do canvas) nas prévias de `MarkingPanel`, `PropertyGrid` e `HelpTip`, e o texto da biblioteca ("`formatVersion` 4 em diante") na prévia de `SpecsDialog`.
- **Contraste:** sem impacto (nenhuma cor mudou).

## Ficou sem gravar

Nada. Fica só uma conferência visual:

- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência da prévia do `NoticeBadge` ("Linha do campo", exemplo de mensagem longa) nos dois temas.
