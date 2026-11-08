# Selo

As pílulas de texto do app, cada estilo uma classe do CSS:

| `estilo` | Classe | Onde |
| --- | --- | --- |
| `tag` | `.tag` | etiqueta de camada (borda de controle, texto cinza) |
| `agente` | `.thread-message-agent` | o "agente" ao lado do nome na mensagem |
| `estado-agente`, `estado-humano`, `estado-resolvida` | `.thread-state-*` | estado no cabeçalho da conversa |
| `contagem`, `contagem-info` | `.tab-badge`, `.tab-badge-info` | contador de aba (12 px) |
| `status`, `status-agente`, `status-resolvida` | `.comments-badge*` | coluna Status da janela Comentários |
| `preview` | `.badge-warning` | selo PREVIEW (raio 4, borda) |

O texto fica centralizado na marcação: dê a ela a largura do texto mais o respiro do estilo (6 a 8 px de cada lado).
