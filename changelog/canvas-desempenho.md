# Desempenho do canvas — [Não lançado] (épico `epic/canvas-desempenho`, PR #1436, MCP 0.30.0, schema v18)

## Alterado

- Abrir mais rápido com o projeto grande: as partes de cada marcação (halo, selo, alerta, nome) e os desenhos de componente só são criados quando aparecem na tela.

- De longe, a seta curta (menos de 24 px na tela) aparece só com o traço, sem halo, ponta nem rótulo, e a que liga duas marcações invisíveis não aparece; a seta selecionada e as ligadas a uma marcação selecionada ou sob o mouse ficam inteiras. A seta fora da área visível também deixa de ser desenhada. Aproximado, nada muda.

- Projeto grande (2.000 marcações, 1.000 setas, Chromium): editar leva ~10 ms, pan ~21 ms e zoom ~31 ms por quadro; abrir em Enquadrar tudo leva ~128 ms. Números e metas em `docs/ARCHITECTURE.md`, "Desempenho".

## Corrigido

- Abrir e fechar projetos grandes várias vezes na mesma aba deixava formas do canvas na memória e deixava cada abertura mais lenta.
- A coluna do campo de referência (ex.: `item`) das tabelas de alvos não encolhe mais a 40 px com os Detalhes estreitos (900 px): o rótulo do alvo cabe em vez de quebrar em três linhas.
- O roteiro R12.30 esperava `data-arrows` menor que 1000 no zoom mínimo do projeto grande, mas nele todas as setas ligam ao menos uma marcação visível; o guia agora descreve o que a app faz.
