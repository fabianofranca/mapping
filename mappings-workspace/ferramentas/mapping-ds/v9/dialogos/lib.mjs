// Grupo "dialogos" da v9: os diálogos do editor e da tela inicial (Ajuda, Novo container, Especializações,
// confirmações, projeto inconsistente), o impacto de atualizar uma especialização e a lista de problemas
// de um pacote. Medidas de src/theme/dialogs.css, src/ui/Dialog.tsx e src/theme/tokens.ts (mcp-v0.25.0),
// conferidas no DOM do app 0.25.0 (cabeçalho de 44 px com a borda, rodapé de 53 px com a borda).
//
// Decisão: cada diálogo que tem componente próprio no código (HelpDialog, ContainerDialog, SpecsDialog,
// ConfirmDialog/ExternalChangeDialog, InconsistentProjectDialog) é a MOLDURA do diálogo, no lugar do Dialog
// genérico: o símbolo do `code` instancia o diálogo inteiro. O UpdateImpact é um fragmento (parágrafos e
// listas soltos no corpo de outro diálogo, sem caixa própria): tipo estrutural. O LibraryIssueList tem
// caixa própria (.library-issues: borda e raio 8): moldura dentro do corpo.
export function build(h) {
  const { C, fr, text, font, fieldText, base, NONE, eq, SHADOW_POPUP } = h;
  const COMPONENTS = {};
  const DOCS = {};
  const EXAMPLES = {};
  const NEW_FIELDS = {};

  // A moldura comum: cartão color-surface com borda color-border, raio 8 (radius-lg) e a sombra de popup;
  // por dentro da borda de 1 px, o cabeçalho (43 px + a divisória = os 44 px de size-touch, título t-title
  // a 16 px da esquerda e o fechar de 28 px a 4 px da direita), o corpo e o rodapé (a divisória e 52 px:
  // 12 px de respiro em volta dos botões de 28 px). Os botões do rodapé e o conteúdo são marcações filhas.
  const chrome = (name, titulo, { closable = 'sempre', side = false, slot }) =>
    fr(name, { cornerRadius: 8, fill: C.surface, stroke: { color: C.border, width: 1 }, shadow: SHADOW_POPUP, layout: { type: 'column', padding: 1 } }, [
      fr('cabeçalho', { width: 'fill', height: 43, layout: { type: 'row', padding: [0, 4, 0, 16], gap: 8, align: 'center', justify: 'space-between' } }, [
        text('título', fieldText('titulo', titulo), C.text, font(15, 600, 22), { width: 'fill' }),
        fr('fechar', { width: 28, height: 28, layout: NONE, ...(closable === 'campo' ? { visible: { $not: eq('fechavel', 'não') } } : {}) }, [
          h.iconNode('close', C.text, { anchors: { centerX: true, centerY: true } }),
        ]),
      ]),
      { type: 'rect', name: 'divisória do cabeçalho', width: 'fill', height: 1, fill: C.border },
      fr('corpo', { width: 'fill', height: 'fill', layout: NONE }, [
        { type: 'slot', name: slot.name, label: slot.label, layout: slot.layout },
        ...(side ? [{ type: 'rect', name: 'divisória do índice', width: 1, anchors: { left: 199, top: 0, bottom: 0 }, fill: C.border }] : []),
      ]),
      { type: 'rect', name: 'divisória do rodapé', width: 'fill', height: 1, fill: C.border },
      { type: 'rect', name: 'rodapé', width: 'fill', height: 52, fill: C.none },
    ]);
  const TITULO = (def) => ({ key: 'titulo', label: 'título', type: 'string', default: def });
  const BODY = { name: 'conteúdo', label: 'Conteúdo', layout: { type: 'column', gap: 16, padding: 16 } };
  const NAO_DESENHA = 'O fundo escurecido (`color-backdrop`), o foco e o hover dos botões não são desenhados.';

  // ---- HelpDialog
  COMPONENTS['help-dialog'] = base(
    'help-dialog',
    'HelpDialog',
    'Diálogo Ajuda (820 × 640): cabeçalho de 44 px com o título e o fechar, o corpo sem margem dividido em índice de 200 px e conteúdo, e o rodapé com a divisória.',
    { width: 820, height: 640 },
    { width: 480, height: 240 },
    { width: 820, height: 640 },
    { titulo: 'Ajuda' },
    chrome('ajuda', 'Ajuda', { side: true, slot: { name: 'índice e conteúdo', label: 'Índice e conteúdo', layout: NONE } }),
  );
  NEW_FIELDS['help-dialog'] = [TITULO('Ajuda')];
  DOCS['help-dialog'] = `# HelpDialog

Diálogo **Ajuda** (\`src/ui/HelpDialog.tsx\`), aberto pelo botão de ajuda da barra, por F1 ou pelas Configurações (direto na seção Atalhos). É um \`Dialog\` \`size="lg"\` (\`size-dialog-lg\` 820 × \`size-dialog-lg-height\` 640) com o corpo \`flush\` (sem margem nem rolagem própria).

## O que o desenho mostra

- O cartão: fundo \`color-surface\`, borda \`color-border\`, raio 8 e a sombra de popup.
- O cabeçalho de 44 px (\`size-touch\`, com a divisória) com o \`titulo\` (\`t-title\`) e o fechar.
- O corpo dividido pela divisória do índice: à esquerda o índice de 200 px (\`size-help-nav\`, \`.help-side\`), à direita o conteúdo que rola (\`.help-content\`, 16 px de margem).
- O rodapé: a divisória de cima e 52 px para o botão **Fechar**.

## Filhos esperados

- No índice: o campo **Buscar na ajuda** (TextField) e um Texto por assunto; o assunto atual tem a Caixa \`selection\` atrás (\`aria-current\`).
- No conteúdo: os títulos das seções (Texto \`t-title\`), os parágrafos e itens de lista (Texto, com o marcador como Texto), as teclas (\`.kbd\`, Caixa e Texto \`t-kbd\`), os blocos de código (Caixa \`bg\` e Texto \`t-code\`) e as linhas da tabela de atalhos (Caixa com a borda de cima).
- No rodapé: o Button **Fechar**.

## O que fica de fora

${NAO_DESENHA} O conteúdo que passa da área visível (o resto da rolagem) não é desenhado.
`;

  // ---- ContainerDialog
  COMPONENTS['container-dialog'] = base(
    'container-dialog',
    'ContainerDialog',
    'Diálogo Novo container (480 px): cabeçalho de 44 px com o título e o fechar, o corpo com 16 px de margem e o rodapé com a divisória.',
    { width: 480, height: 463 },
    { width: 320, height: 160 },
    { width: 480, height: 463 },
    { titulo: 'Novo container' },
    chrome('novo container', 'Novo container', { slot: { name: 'formulário', label: 'Formulário', layout: { type: 'column', gap: 12, padding: 16 } } }),
  );
  NEW_FIELDS['container-dialog'] = [TITULO('Novo container')];
  DOCS['container-dialog'] = `# ContainerDialog

Diálogo **Novo container** (\`src/ui/ContainerDialog.tsx\`, formulário em \`src/ui/containerForm.ts\`), aberto pelo botão Novo container da barra. Cria um container sem arquivo de imagem no centro da vista. \`Dialog\` \`size="sm"\` (480 px).

## O que o desenho mostra

A moldura do diálogo: cartão \`color-surface\` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o \`titulo\` e o fechar; o corpo (slot *Formulário*, 16 px de margem e 12 px entre os campos, \`.container-form\`); o rodapé com a divisória de cima.

## Filhos esperados

- O texto de apoio (Texto \`muted\`, parágrafo).
- **Nome** (TextField), **Tamanho predefinido** (Select: Personalizado, Tamanho da seleção e os tamanhos prontos das especializações), **Largura** e **Altura** lado a lado (TextField, 8 px entre eles) e **Cor de fundo** (TextField), cada um com o rótulo como Texto \`t-small\` \`muted\`.
- A dica *No formato #RRGGBB.* (Texto \`muted\`) e, depois de um erro, a mensagem \`.field-error\` (Texto \`danger\`); o campo com erro fica \`invalido\`.
- No rodapé: **Cancelar** e **Criar container** (Button \`primary\`).

## O que fica de fora

${NAO_DESENHA}
`;

  // ---- SpecsDialog
  COMPONENTS['specs-dialog'] = base(
    'specs-dialog',
    'SpecsDialog',
    'Diálogo Especializações (560 px) e os que ele abre por cima (pacote, atualizar, remover, aviso): cabeçalho de 44 px com o título e o fechar, o corpo com 16 px de margem e o rodapé com a divisória.',
    { width: 560, height: 605 },
    { width: 320, height: 160 },
    { width: 560, height: 605 },
    { titulo: 'Especializações' },
    chrome('especializações', 'Especializações', { slot: BODY }),
  );
  NEW_FIELDS['specs-dialog'] = [TITULO('Especializações')];
  DOCS['specs-dialog'] = `# SpecsDialog

Diálogo **Especializações** (\`src/ui/SpecsDialog.tsx\`, importação de pacote em \`src/ui/specPackageImport.ts\`): aplicar, atualizar e remover as especializações do projeto. \`Dialog\` \`size="md"\` (\`size-dialog-md\` 560 px). O mesmo componente abre os diálogos de cada etapa, por cima dele, com a mesma moldura e outro \`titulo\`: **Pacote "…"** (revisão de um pacote lido), **Atualizar "…"?** (arquivo único), **Remover "…"?** e os avisos (*Arquivo de especialização inválido*, *Nada a fazer*).

## O que o desenho mostra

A moldura: cartão \`color-surface\` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o \`titulo\` e o fechar; o corpo (slot *Conteúdo*, 16 px de margem e de espaço entre os blocos); o rodapé com a divisória de cima.

## Filhos esperados

- Os textos de apoio (Texto \`muted\`) e o resultado da última operação (\`.notice\`: Caixa \`success-bg\` ou \`danger-bg\` e Texto).
- A fileira **Aplicar especialização…** (Button \`primary\`), **Aplicar pasta…** e **Aplicar zip…**.
- Uma Caixa por especialização aplicada (\`.spec-item\`: borda \`color-border\`, raio 8) com o nome (Texto \`t-body-strong\`), a versão e as camadas (Texto \`muted\`), as plataformas (Texto \`t-small\`, o marcador, o link do repositório sublinhado em \`accent\` e a referência) e os botões **Atualizar versão…**, **Atualizar de pasta…**, **Atualizar de zip…** e **Remover** (Button \`danger\`).
- Na revisão de um pacote: o resumo, o UpdateImpact (numa atualização), a contagem de erros e avisos e o LibraryIssueList; no rodapé, **Cancelar** e **Atualizar** ou **Aplicar** (desabilitado com erros).
- No rodapé da lista: **Fechar**.

## O que fica de fora

${NAO_DESENHA} O diálogo de baixo, quando outro abre por cima, é outro container.
`;

  // ---- ConfirmDialog e ExternalChangeDialog
  COMPONENTS['confirm-dialogs'] = base(
    'confirm-dialogs',
    'ConfirmDialogs',
    'Diálogo de confirmação do editor (480 px): cabeçalho de 44 px com o título e o fechar (sem o fechar no "Projeto alterado fora da app"), o corpo com 16 px de margem e o rodapé com a divisória.',
    { width: 480, height: 171 },
    { width: 320, height: 120 },
    { width: 480, height: 171 },
    { titulo: 'Excluir container?', fechavel: 'sim' },
    chrome('confirmação', 'Excluir container?', { closable: 'campo', slot: BODY }),
  );
  NEW_FIELDS['confirm-dialogs'] = [TITULO('Excluir container?'), { key: 'fechavel', label: 'fechável', type: 'enum', options: ['sim', 'não'], default: 'sim' }];
  DOCS['confirm-dialogs'] = `# ConfirmDialogs

Os diálogos de confirmação do editor (\`src/app/EditorDialogs.tsx\`; o estado de abertura vem de \`src/app/useEditorDialogs.ts\`), todos \`Dialog\` \`size="sm"\` (480 px):

- **ConfirmDialog**: Cancelar e uma ação, destrutiva (\`danger\`, com o papel de alerta) ou principal (\`primary\`). Usos: *Excluir container?*, *Excluir marcação?*, *Excluir seta?*, *Excluir N itens?*, *Fechar sem salvar?* e *Proporção diferente* (troca de imagem).
- **ExternalChangeDialog**: *Projeto alterado fora da app*, quando o \`mapping.json\` mudou por fora com alterações locais não gravadas. Sem o fechar (\`fechavel\` \`não\`): Esc e o toque fora não fazem nada; é preciso escolher **Recarregar** ou **Manter as minhas** (\`primary\`).

## O que o desenho mostra

A moldura: cartão \`color-surface\` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o \`titulo\` e, com \`fechavel\` \`sim\`, o fechar; o corpo (slot *Conteúdo*, 16 px de margem); o rodapé com a divisória de cima.

## Filhos esperados

- A mensagem do impacto (Texto, parágrafo): o que é removido, quantas marcações, anotações e setas; o aviso de marcações trancadas é um Texto em negrito.
- No rodapé: **Cancelar** e a ação (Button \`danger\` ou \`primary\`).

## O que fica de fora

${NAO_DESENHA} O papel de alerta (\`alertdialog\`) não tem efeito visual.
`;
  EXAMPLES['confirm-dialogs'] = [
    { name: 'Excluir', values: { titulo: 'Excluir marcação?', fechavel: 'sim' } },
    { name: 'Projeto alterado fora da app', values: { titulo: 'Projeto alterado fora da app', fechavel: 'não' } },
  ];

  // ---- InconsistentProjectDialog
  COMPONENTS['inconsistent-project-dialog'] = base(
    'inconsistent-project-dialog',
    'InconsistentProjectDialog',
    'Diálogo "Projeto com dados inconsistentes" (560 px), na abertura de um projeto: cabeçalho de 44 px com o título e o fechar, o corpo com 16 px de margem e o rodapé com a divisória.',
    { width: 560, height: 360 },
    { width: 320, height: 160 },
    { width: 560, height: 360 },
    { titulo: 'Projeto com dados inconsistentes' },
    chrome('projeto inconsistente', 'Projeto com dados inconsistentes', { slot: BODY }),
  );
  NEW_FIELDS['inconsistent-project-dialog'] = [TITULO('Projeto com dados inconsistentes')];
  DOCS['inconsistent-project-dialog'] = `# InconsistentProjectDialog

Diálogo **Projeto com dados inconsistentes** (\`src/ui/InconsistentProjectDialog.tsx\`), aberto pela tela inicial (\`src/app/Home.tsx\`) quando a abertura de um projeto é recusada por dados que quebram as invariantes (pai inexistente, retângulo fora da imagem, id repetido…). \`Dialog\` \`size="md"\` (560 px).

## O que o desenho mostra

A moldura: cartão \`color-surface\` com borda, raio 8 e sombra de popup; cabeçalho de 44 px com o \`titulo\` e o fechar; o corpo (slot *Conteúdo*, 16 px de margem); o rodapé com a divisória de cima.

## Filhos esperados

- O resumo (Texto, parágrafo): quantos problemas e se todos têm reparo automático.
- **Problemas** (Texto \`t-title\`) e uma linha por problema (Texto, parágrafo, com o marcador da lista como Texto), por exemplo *Marcação "Nome" (id): pai inexistente (id)*.
- Com reparo: **O que o reparo faz** e uma linha por reparo (*vira raiz da imagem*, *recortada aos limites da imagem*…).
- No rodapé: o estado da cópia (Texto \`t-small\` \`muted\`, *Lista copiada.*), **Copiar**, **Fechar** e, com reparo, **Reparar e abrir** (Button \`primary\`).

## O que fica de fora

${NAO_DESENHA}
`;

  // ---- UpdateImpact: fragmento dentro do corpo de outro diálogo (estrutural).
  DOCS['update-impact'] = `# UpdateImpact

O impacto de atualizar uma especialização aplicada (\`src/ui/UpdateImpact.tsx\`), dentro do diálogo **Atualizar "…"?** (arquivo único) ou **Pacote "…"** (atualização por pacote) do SpecsDialog.

É um **agrupador** (tipo estrutural, sem desenho): no app ele não tem caixa própria, são parágrafos e listas soltos no corpo do diálogo. A marcação envolve os filhos:

- *Da versão N para a M.* e as camadas criadas, liberadas ou *Nenhuma camada criada ou removida.* (Texto, parágrafo);
- **Passos da migração** (Texto \`t-body-strong\`) e, por passo, o rótulo (*Remover o campo titulo em tabela*), as contagens (Texto \`t-small\` \`muted\`, *5 anotação(ões), 5 valor(es)*) e até 5 perdas (Texto, com o marcador da lista como Texto);
- o total das perdas e as referências quebradas (\`.notice-error\`: Caixa \`danger-bg\` raio 8 e Texto \`danger\`);
- recusada: o aviso do que falta migrar, na mesma Caixa.

O resumo do pacote, a contagem de erros e avisos e o LibraryIssueList ficam fora dele (são do SpecsDialog).
`;

  // ---- LibraryIssueList
  COMPONENTS['library-issue-list'] = base(
    'library-issue-list',
    'LibraryIssueList',
    'Lista de problemas de uma biblioteca: a caixa com borda color-border e raio 8 que rola sozinha (até 40% da altura da janela); os grupos por arquivo são marcações filhas.',
    { width: 526, height: 180 },
    { width: 120, height: 40 },
    { width: 'fill', height: 'hug' },
    {},
    fr('problemas', { cornerRadius: 8, stroke: { color: C.border, width: 1 }, layout: NONE }, [
      { type: 'slot', name: 'grupos', label: 'Grupos', layout: { type: 'column', gap: 8, padding: 8 } },
    ]),
  );
  DOCS['library-issue-list'] = `# LibraryIssueList

Os problemas de uma biblioteca (erros e avisos da validação), em lista compacta (\`src/ui/LibraryIssueList.tsx\`): na revisão de um pacote do SpecsDialog e no Diagnóstico. A lista rola sozinha (\`max-height: 40vh\`), então 42 avisos não esticam o diálogo.

## O que o desenho mostra

A caixa \`.library-issues\`: borda \`color-border\`, raio 8 (\`radius-lg\`) e 8 px de margem (slot *Grupos*). Sem fundo próprio.

## Filhos esperados

Um grupo por arquivo, na ordem em que o arquivo aparece:

- o nome do arquivo (Texto \`t-code\`; *pacote* quando o problema é do pacote) e a contagem entre parênteses (Texto \`muted\`);
- uma linha por problema: o selo da gravidade, o caminho dentro do arquivo (Texto \`t-code\`) e a mensagem (Texto, parágrafo, com o lugar do selo e do caminho no começo da primeira linha). O selo de aviso é o Selo \`preview\` (\`.badge-warning\`); o de erro (\`.library-issue-error\`) é uma Caixa \`danger-bg\` com borda \`danger\` e raio 4 e o Texto \`t-micro\` \`danger\`.

## O que fica de fora

A barra de rolagem não é desenhada; o que passa da altura fica cortado.
`;

  return { COMPONENTS, DOCS, EXAMPLES, NEW_FIELDS, STRUCTURAL: ['update-impact'] };
}
