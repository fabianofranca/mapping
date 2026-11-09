# Material 3: text-field com altura 84 — [Não lançado] (épico `epic/m3-text-field-84`, PR #1235, MCP 0.28.11 (sem versão nova), schema v18)

## Corrigido

- Biblioteca Material 3 (Compose), `version` 3: o `text-field` e o `secure-text-field` passam a ter 84 de altura no `size` e no `sizing` (eram 76). O campo `outlined` com texto de apoio, como o exemplo "Em erro", pede 84 no Compose (8 do rótulo + 56 do contorno + 4 + 16 do apoio) e passava 8 px da caixa. A largura e o tamanho mínimo não mudam.
- Efeito: o desenho sempre tem a altura do `size`, então o `filled` com apoio fica com 8 px vazios embaixo e o `filled` sem apoio com 28. Marcações já criadas não migram: guardam o próprio retângulo e passam a desenhar 84 dentro dele.
