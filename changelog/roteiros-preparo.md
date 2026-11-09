# Roteiros que batem com a app — [Não lançado] (épico `epic/roteiros-preparo`, PR #1244, MCP 0.28.11, schema v18)

## Corrigido

- R0.1 do `docs/TESTING.md` lista também **Abrir biblioteca** na tela inicial, na ordem da app.
- R1.8a lê o texto da dica no `span.tooltip` (o atributo `data-tooltip` é vazio).
- R1.20b prepara o próprio projeto no `principal` (opção **Mostrar componentes sobre fotos**, uma Nota e **Ligar a…**), com os valores esperados desse preparo (`data-arrows` 1, `data-components` 1); o R1.20c desfaz o preparo no fim, e a lista "Não gravam nada" e as `revision` de cada gravação batem com isso.
- R1.21a (2) e (3) esperam `aria-pressed` `false` depois de fechar pelo **X**; o R1.21b diz para onde vai o foco ao fechar a Incompletas (botão da faixa se aberta por ele, canvas se aberta por `Ctrl+Shift+5`).
- R9.12a não espera nome de marcação no `telas`; o R9.13 dá o `rect` do Top app bar e do Button, e o esperado confere o Top app bar como pai.
- R15.3 e R15.4 dizem que o foco fica em **URL da imagem** quando a faixa aparece, e contam os pedidos pela diferença do `grep -c foto.png` no log do servidor.
- R12.12 diz o tamanho do Button do canvas (136 × 40, uma pílula pequena no **Enquadrar tudo**); o R12.20a diz que se fica na revisão e o que a lista de **Propostas** mostra depois do `Ctrl+Z`.
- R12.22 e a nota do R12 dizem que dependem do R12.17 a R12.21 e listam a raiz do zip (`mapping.json`, `specs/` e `proposals/`).
- R12.15, R12.27, o Preparo do R12.23 a R12.28, R16.3, R18.3 e R25.45 passam `root` `design/mapeamentos` no `create_project` (sem ele, `root-required` com as duas raízes); o R25.54 usa `marking` no `update_marking`.
- R12.26 e a linha do `get_marking_image` no `docs/MCP.md` dizem `error.hint` (o `hint` vem direto em `error`).
- Preparo do R23 diz que roda uma só vez; R23.8 descreve a direção como ícone `img` com nome acessível; R23.16 corrige a contagem da Rascunho.
- R17.10 fala do `background` gravado e do Scaffold que cobre o container.
- R25.42 trata **icon** como grupo de botões; R25.47 e R25.48 usam os zooms que o teclado dá (26%, ≈51% e 381%) e a escala do container.
