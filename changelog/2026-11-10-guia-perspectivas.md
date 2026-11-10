# Perspectivas no guia e no exemplo — 2026-11-10 (épico `epic/guia-perspectivas`, PR #1419, MCP 0.29.0 sem mudança, schema v18)

## Adicionado

- Guia interativo: o passo 14 **Perspectivas** (a Principal, **Nova perspectiva…** com **Todos do projeto** e **Só eu**, enviar e tirar itens, só a posição muda ao arrastar, camadas por perspectiva e a chegada com o selo "Veio de…" e o **Dispensar**) e o seletor **Perspectiva** acima das abas (Principal, Dados e Material 3): a escolha filtra as abas de containers e desliga os chips das camadas escondidas. As perspectivas e a chegada saem do `mapping.json` do exemplo. O texto da **Ajuda** passa a dizer 14 passos e a citar as perspectivas.
- Projeto de exemplo (`examples/exemplo-completo/` e o zip): duas perspectivas "Para todos", **Dados** (Cadastro, Login e a nota "Cadastro", com Componentes, Eventos e Dúvidas escondidas) e **Material 3** (Configurações e Detalhes do pedido), e uma chegada: a nota "Cadastro" aparece na Principal com o selo "Veio de Dados" e "Chegadas: 1" na barra de status. As contagens de imagens, marcações, anotações, camadas e especializações não mudam.
- Roteiro R11: o R11.4 cita o seletor e a chegada, o passo novo R11.13 percorre Dados, Material 3 e o **Dispensar**, e o R11.14 percorre o seletor do guia; o R11.2 e o R11.3 passam a 14 passos.

## Corrigido

- O aviso benigno do navegador "ResizeObserver loop completed with undelivered notifications" deixa de ir para o Diagnóstico: com uma chegada na Principal (o exemplo agora tem uma) ele acendia o alerta da aba **Diagnóstico**, que ficava 8 px mais larga e apertava a faixa de abas da janela inferior.
