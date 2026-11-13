# Direção de leitura (RTL) e âncora entre marcações — [Não lançado] (épico `epic/direcao-e-ancora`)

## Pendências

A fase R1 (direção no motor, no formato do componente, nas telas sem geometria e no visualizador) **não muda o design system da app**: nenhum componente, token ou ícone da app foi tocado. A R2 só monta a direção com controles existentes. As pendências do épico entram nas fases:

- **R2 (feito, sem token novo):** o campo **Direção** nos Detalhes do container (`ContainerDirectionField`, `Property` + `Select` no molde do Modo de desenho, mas sempre visível), a seção **Direção de leitura** nas Configurações do projeto (`ProjectDirectionSettings`, `Select` no molde do Modo do desenho) e a seção somente leitura do Diagnóstico (`DiagnosticsDirection`, só com `rtl`). Só controles e classes que já existem (`Select`, `Property`, `.repos`, `.diagnostics-modes`): nenhum componente, token ou ícone novo.
- **R4:** a seção **Âncora** nos Detalhes da marcação (Âncora, Lado, Alinhamento, Deslocamento e o botão Encostar na âncora) e a linha tracejada de ligação no canvas.

## Sincronização

Preenchida no fechamento do épico.

## Ficou sem gravar

Preenchido no fechamento do épico.
