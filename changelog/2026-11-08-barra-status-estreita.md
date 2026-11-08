# Barra de status estreita — 2026-11-08 (épico `epic/barra-status-estreita`, PR #999, MCP 0.28.4, schema v18)

## Corrigido

- A barra de status e o caminho do canvas a 900×720 não cortam mais texto no meio da letra. Salvo, o destino (Pasta ou Neste dispositivo) e Somente leitura aparecem sempre inteiros, junto com o cursor, o zoom e a versão do build. A perspectiva, "aguardando aplicação", "Alterações não exportadas", avisos, conversas, chegadas e o nome da seleção encolhem com reticências e dica ao passar o mouse. Em janelas com a barra abaixo de 1100 px, o schema e o canal somem; eles continuam em Configurações e no Diagnóstico. O caminho do canvas termina com reticências e dica antes dos controles da revisão.
- Na revisão a 900×720 com Árvore, Camadas, Propostas e Detalhes abertas, o caminho do canvas voltou a aparecer (com reticências) e o zoom não é mais cortado: nessa coluna estreita os botões Conversas e Enquadrar tudo da barra do canvas somem (Ctrl+0 enquadra; fechar uma janela devolve os botões).
