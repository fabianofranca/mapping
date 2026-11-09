# Roteiros que batem com a app — 2026-11-09 (épico `epic/roteiros-preparo`, PR #1244, MCP 0.28.12, schema v18)

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
- Correções da rodada dirigida do testador (RP3): o preparo do R1.20b usa **Adicionar no canvas: Nota** (a Nota é flutuante), sem a opção das Configurações, e manda voltar o painel com **Mostrar tudo** depois do R1.20a; o R1.21a ganha o preparo do (6) e do (7) e o R1.21b chama o botão da faixa de **Detalhes**; R15.3 e R15.4 contam o pedido ao Pages por `page.on('request')` (o log do servidor local só vale para o R15.7 a R15.11); R23.5 dá o ponto do rótulo perto da borda esquerda; R25.46 a R25.48 dizem que a Paleta não pede posição e dão os tamanhos com o `placement.scale`; R12.20a diz quando o selo "Em revisão" aparece; R0.1, R1.4a, R1.16, R1.22, R9.15, R12.3, R12.10f, R12.11, R12.11d, R12.12, R17.7 e R17.10 alinham o texto ao que a app mostra.
