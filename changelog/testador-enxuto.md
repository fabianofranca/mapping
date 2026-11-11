# Testador enxuto — 2026-11-11 (épico `epic/testador-enxuto`, PR #1578, MCP sem mudança, schema v18)

## Mudou para quem conduz o fluxo

- O testador passa a ler o guia por partes (base obrigatória e seções sob demanda), a usar um navegador persistente com lotes de checks, a ficar abaixo de 300 mil de contexto, a refazer só os passos afetados no reteste e a subir o ambiente com retry no `apt-get`. Detalhes na etapa #1533.
