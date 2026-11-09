# Material 3 com estados de interação — [Não lançado] (épico `epic/material3-estados`, PR #1293, MCP 0.28.14, schema v18)

## Adicionado

- Biblioteca `material3-compose` (versão 4): o `button` ganha o campo `interaction` (Interação: `none`, `hovered`, `focused`, `pressed`; padrão `none`) que desenha a aparência parada do estado do Compose — a camada de estado na cor do conteúdo e a elevação por estado. Com `enabled` `false` o desabilitado vence. O campo fica fora do `code`.
- Tokens `state-hover` (0,08), `state-focus` (0,10), `state-pressed` (0,10) e `state-dragged` (0,16), do `StateTokens.kt` do Compose, e `state-disabled-container-filled` (0,1) e `corner-checkbox` (2), que substituem os últimos literais de opacidade e de raio.
- Skill `spec-author`, `docs/COMPONENT-FORMAT.md` e `docs/SPEC-FORMAT.md`: a regra "movimento fora do desenho, aparência de estado como campo `enum` opcional".
- Biblioteca `material3-compose`: tamanhos iniciais do Compose em cinco tipos — `top-app-bar` 412 × 152 (a altura da large; o medium e o large cabem sem sobrepor a linha de cima), `date-picker` 360 × 512 (a sexta linha da grade), `time-picker` 328 × 528 (a margem do relógio e a linha de ações do diálogo), `alert-dialog` 312 × 248 (linha de botões de 48) e `slider` 328 × 48 (a faixa de 44 fica centrada). Marcações já criadas guardam o próprio retângulo e não mudam; o tamanho novo vale para as próximas.
- Exemplos dos limites conhecidos: `button` "Rótulo longo", `time-picker` "24 horas, campos" e `date-picker` "Intervalo até o fim do mês"; a Fidelidade de cada um cita a roadmap que resolveria (#897, #898). O de três linhas do `snackbar` espera a #898 (hoje o motor avisa que o conteúdo passa da caixa).

## Alterado

- `slider` (`steps`), `tabs` (`style`) e `snackbar` (`actionOnNewLine`): as descrições dos campos passam a dizer o que o desenho faz (marcas de 1 a 9, indicador de 3 nos dois estilos, 92 com a ação embaixo).
- `docs/surface.md`: registra a decisão de manter a leitura do `Surface.kt` na elevação tonal.
- `docs/COMPONENT-FORMAT.md` e `docs/SPEC-FORMAT.md`: o modo do desenho segue o `drawingMode` do projeto e do container, e o MCP usa a Mapping Sans embutida (textos que ficaram desatualizados).
