# Densidade da captura — 2026-11-12 (épico `epic/densidade-captura`)

## Pendências

- **Detalhes do container** — campo **Densidade** (D2, #1104): `Property` com um `Select` (**1x**, **1,5x**, **2x**, **3x**, **4x** e **Personalizada**, que abre um `TextField` de número de 0,5 a 8 ao lado, aceitando vírgula ou ponto, confirmado com Enter ou ao sair do campo), a dica da sugestão em `muted` ("Sugestão: 3x (Celular 360 × 800)") e o botão pequeno **Aplicar** quando a sugestão difere do valor; aviso "Use um número de 0,5 a 8." sob o campo. Fica depois do **Modo do desenho**. Sem token novo (`--space-*`, `--color-*` de sempre).
- **Novo container** — o mesmo campo **Densidade** (`Select` + número em "Personalizada", padrão 1x, sem a sugestão nem o Aplicar), depois da **Cor de fundo**, com a explicação em `muted` sob ele; o número inválido bloqueia **Criar container** com o mesmo aviso. Sem token novo.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-12: versão 82 (a 81 levou os dois guias e a 82 o índice, com `lastChange`). Gravados: o guia do `ContainerDialog` (campo **Densidade** depois da cor de fundo, `Select` + número em "Personalizada", padrão 1x, aviso de 0,5 a 8 que bloqueia **Criar container**, sem sugestão nem Aplicar) e o do `MarkingPanel` (campo **Densidade** nos Detalhes do container, depois do Modo do desenho, com a sugestão em `muted` e o **Aplicar**). Sem token novo, então o contraste não muda: o texto novo só usa `muted` e `field-error`, já conferidos nos temas claro e escuro. Nenhum arquivo do DS foi apagado.

## Ficou sem gravar

- Prévias `components/ContainerDialog/preview.html` e `components/MarkingPanel/preview.html` sem o campo **Densidade** (continuam estáticas, renderizadas do app antes do épico). Motivo: o fechamento mexeu só nos guias (curado à mão, só o que a entrega mudou); as prévias são HTML renderizado do app e regravá-las exige abrir a app num navegador, o que esta sessão não fez.
