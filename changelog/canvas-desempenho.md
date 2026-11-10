# Desempenho do canvas — [Não lançado] (épico `epic/canvas-desempenho`, PR #1436, MCP 0.30.0, schema v18)

## Alterado

- Abrir mais rápido com o projeto grande: as partes de cada marcação (halo, selo, alerta, nome) e os desenhos de componente só são criados quando aparecem na tela.

## Corrigido

- Abrir e fechar projetos grandes várias vezes na mesma aba deixava formas do canvas na memória e deixava cada abertura mais lenta.
