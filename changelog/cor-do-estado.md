# Cor do estado da conversa — [Não lançado] (épico `epic/cor-do-estado`, PR #1304, MCP 0.28.12, schema v18)

## Alterado

- O selo de estado da conversa tem a mesma cor do pino do canvas na janela **Comentários** e na seção **Conversas** dos Detalhes: laranja em "aguardando você", ciano em "aguardando agente" e cinza em "resolvida", nos temas claro e escuro, com texto acima de 4,5:1 sobre o fundo do selo.

## Corrigido

- Roteiro R22.6 (`docs/TESTING.md`): o clique do **Comentar** vai num ponto vazio que não depende do zoom, e o passo diz que o **Comentar** sobre um item ancora a conversa nele, sem pino tracejado nem `draft`.
- As opções do seletor **Modo do desenho** (**Configurações** e **Detalhes** do container) aparecem como "Claro" e "Escuro" em pt-BR (e "Light" e "Dark" em en-US), em vez de `light` e `dark`; o valor gravado no `mapping.json` continua o mesmo.
