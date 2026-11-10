# Perspectivas no guia e no exemplo — [Não lançado] (épico `epic/guia-perspectivas`, PR #1419, MCP 0.28.2 sem mudança, schema v18)

## Adicionado

- Projeto de exemplo (`examples/exemplo-completo/` e o zip): duas perspectivas "Para todos", **Dados** (Cadastro, Login e a nota "Cadastro", com Componentes, Eventos e Dúvidas escondidas) e **Material 3** (Configurações e Detalhes do pedido), e uma chegada: a nota "Cadastro" aparece na Principal com o selo "Veio de Dados" e "Chegadas: 1" na barra de status. As contagens de imagens, marcações, anotações, camadas e especializações não mudam.
- Roteiro R11: o R11.4 cita o seletor e a chegada, e o passo novo R11.13 percorre Dados, Material 3 e o **Dispensar**.

## Corrigido

- O aviso benigno do navegador "ResizeObserver loop completed with undelivered notifications" deixa de ir para o Diagnóstico: com uma chegada na Principal (o exemplo agora tem uma) ele acendia o alerta da aba **Diagnóstico**, que ficava 8 px mais larga e apertava a faixa de abas da janela inferior.
