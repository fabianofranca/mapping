# Acabamento e guia — [Não lançado] (épico `epic/acabamento-e-guia`, PR #593, MCP 0.18.1, schema v14)

## Corrigido

- Cabeçalho da anotação nos Detalhes: quando o campo do nome não cabe na linha com o resto, ele desce inteiro para a 2ª linha, com o placeholder "Rótulo da instância (opcional)" visível, e **Copiar referência** e a lixeira ficam juntos, à direita, na 1ª (antes o placeholder aparecia cortado e a lixeira podia ficar sozinha na linha de baixo).
- Cabeçalho de camada nos Detalhes: o nome da camada só encolhe depois de o texto do selo da especialização ter sumido (antes perdia frações de pixel e ganhava reticências com o selo ainda visível).
- Menus: o espaço entre o ícone (ou o check) e o rótulo voltou a ser o de antes (6 px, no menu da seta: **Reta**, **Curva**, **Canto**); só a entrada com atalho tem o espaço maior até o atalho, que continua à direita.
- Revisão: a legenda das marcas, quando aberta, fica por cima do minimapa a 900 px, inteira à vista.
- Revisão: o nome da marcação removida aparece riscado no canvas, a qualquer zoom, selecionada ou não, nas visões **Atual** e **Proposto** (antes o risco era branco e fino sobre o texto branco e sumia). A legenda e o R4.3 já diziam isso.
- **Especializações**: o projeto do zip `proposta-componentes.zip` lista "Material 3 (Compose)", não o id `material3-compose` (o zip de exemplo gravava o id como nome da especialização; o arquivo foi regerado).
