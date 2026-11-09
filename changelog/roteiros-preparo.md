# Roteiros que batem com a app — [Não lançado] (épico `epic/roteiros-preparo`, PR #1244, MCP 0.28.11, schema v18)

## Corrigido

- R0.1 do `docs/TESTING.md` lista também **Abrir biblioteca** na tela inicial, na ordem da app.
- R1.8a lê o texto da dica no `span.tooltip` (o atributo `data-tooltip` é vazio).
- R1.20b prepara o próprio projeto no `principal` (opção **Mostrar componentes sobre fotos**, uma Nota e **Ligar a…**), com os valores esperados desse preparo (`data-arrows` 1, `data-components` 1); o R1.20c desfaz o preparo no fim, e a lista "Não gravam nada" e as `revision` de cada gravação batem com isso.
- R1.21a (2) e (3) esperam `aria-pressed` `false` depois de fechar pelo **X**; o R1.21b diz para onde vai o foco ao fechar a Incompletas (botão da faixa se aberta por ele, canvas se aberta por `Ctrl+Shift+5`).
- R9.12a não espera nome de marcação no `telas`; o R9.13 dá o `rect` do Top app bar e do Button, e o esperado confere o Top app bar como pai.
- R15.3 e R15.4 dizem que o foco fica em **URL da imagem** quando a faixa aparece, e contam os pedidos pela diferença do `grep -c foto.png` no log do servidor.
