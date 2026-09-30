# Mapeador de Imagens — Plano da Etapa 1

> Nome provisório. Este documento é a fonte de verdade do desenvolvimento.
> Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

---

## 1. Objetivo

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações chave-valor**. Tudo é salvo num `mapping.json` ao lado das imagens, num formato pensado para ser lido por um **agente de IA no futuro**: o agente deve conseguir recortar, na imagem original, a área exata de cada marcação.

Exemplo de uso: fotos de um carro (frente, lateral, topo) posicionadas no mesmo canvas. A camada "Lataria" registra amassados, a camada "Vidros" registra trincas, sobre as mesmas marcações.

A **Etapa 2** (especialização: arquivo JSON que pré-define camadas e tipos de anotação) **não faz parte deste plano**, mas o modelo já se prepara para ela (`schemaVersion`, camadas globais, validação por schema).

---

## 2. Conceitos

| Conceito | Definição |
|---|---|
| Projeto | Uma pasta (ou um zip) com `mapping.json` e `images/`. Tem exatamente **um** canvas. |
| Canvas | Área infinita com pan e zoom onde as imagens são posicionadas. |
| Imagem | Arquivo em `images/`, posicionado no canvas. **Sem rotação. Não pode sobrepor outra imagem.** |
| Marcação | Retângulo alinhado aos eixos, **sempre dentro de uma única imagem**. Coordenadas em pixels da imagem original. Pode ter uma marcação pai (hierarquia **ilimitada**). Existe em todas as camadas. |
| Camada | **Global** do projeto. Tem nome e cor. |
| Anotação | Pertence ao par **(camada, marcação)**. Nome opcional + lista de pares chave-valor (valores só texto). Uma marcação pode ter várias anotações na mesma camada. |
| Camadas visíveis | Seleção múltipla. Filtra o que aparece no canvas, no painel e na lista. |
| Camada ativa | Uma só. É o destino padrão de novas anotações. Está sempre visível. |

---

## 3. Decisões já tomadas

- Stack: **Vite + TypeScript (strict) + Preact + @preact/signals + Konva.js + JSZip + zod + idb**.
- Entrega: **um único `index.html`** com tudo embutido (`vite-plugin-singlefile`). Funciona:
  - com **duplo clique no Chrome/Edge desktop** (`file://`), sem instalar nada;
  - hospedado no **GitHub Pages**, para uso no celular, como **PWA** instalável e offline.
- Uso **completo** no celular (desenhar, camadas, anotações). Interface pensada primeiro para o celular.
- Idiomas: **pt-BR e en-US**. Temas: **claro, escuro e seguir o sistema**.
- Desfazer/refazer na etapa 1.
- Transferência entre dispositivos é **manual**: a app só abre e salva arquivos.

---

## 4. Modelo de dados (`mapping.json`, schema v1)

```json
{
  "schemaVersion": 1,
  "app": "mapeador-imagens",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": {
    "name": "Vistoria Carro A",
    "createdAt": "2026-09-30T12:00:00.000Z",
    "updatedAt": "2026-09-30T12:30:00.000Z"
  },
  "layers": [
    { "id": "L1", "name": "Lataria", "color": "#E53935" },
    { "id": "L2", "name": "Vidros", "color": "#1E88E5" }
  ],
  "images": [
    {
      "id": "I1",
      "file": "images/lateral.jpg",
      "width": 4032,
      "height": 3024,
      "placement": { "x": 0, "y": 0, "scale": 0.25 }
    }
  ],
  "markings": [
    {
      "id": "M1",
      "imageId": "I1",
      "parentId": null,
      "name": "Porta dianteira esquerda",
      "rect": { "x": 1200, "y": 900, "width": 800, "height": 1100 },
      "needsReview": false
    },
    {
      "id": "M2",
      "imageId": "I1",
      "parentId": "M1",
      "name": "Maçaneta",
      "rect": { "x": 1650, "y": 1300, "width": 180, "height": 90 },
      "needsReview": false
    }
  ],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Amassado",
      "entries": [
        { "key": "tipo", "value": "amassado" },
        { "key": "gravidade", "value": "média" }
      ]
    },
    {
      "id": "A2",
      "markingId": "M1",
      "layerId": "L2",
      "name": null,
      "entries": [
        { "key": "tipo", "value": "trinca" },
        { "key": "local", "value": "canto superior" }
      ]
    }
  ]
}
```

### Regras do modelo

- **IDs**: `crypto.randomUUID()` (os do exemplo estão abreviados).
- **Coleções planas com referências** (`imageId`, `parentId`, `markingId`, `layerId`). Nada aninhado: fica mais fácil para o agente e para as migrações.
- **Ordem dos arrays = ordem de exibição** (camadas no seletor, anotações dentro de cada par camada/marcação, entradas dentro da anotação).
- `name` de marcação e de anotação: sempre presente, `null` quando vazio.
- **`rect`**: inteiros, em pixels da imagem original. `0 ≤ x`, `x + width ≤ image.width` (idem para y/height). Tamanho mínimo: 8 px em cada lado.
- **Hierarquia**: o pai precisa estar na mesma imagem, e o `rect` da filha precisa estar totalmente contido no do pai. Sem ciclos.
- **`entries`**: chaves não vazias (após trim) e únicas dentro da anotação. Valores são string (podem ser vazios).
- **`placement`**: `x`, `y` em unidades do canvas. `scale` = unidades do canvas por pixel da imagem. Os retângulos das imagens no canvas **não podem se sobrepor**.
- **`needsReview`**: `true` quando a marcação foi reescalada por uma troca de imagem com proporção diferente (ver 7.3).
- **`coordinateSystem`**: as coordenadas se referem à imagem **com a orientação EXIF aplicada** (como o navegador exibe). Imagens adicionadas pela app são normalizadas na importação (ver 5.3), então para elas os pixels do arquivo já coincidem com as coordenadas.
- JSON salvo com indentação de 2 espaços, UTF-8.
- Na leitura: validar com **zod** e checar os invariantes (integridade referencial, contenção, não sobreposição, chaves únicas). Se `schemaVersion` for maior que o suportado, avisar e abrir em modo somente leitura. Se for menor, rodar as migrações registradas.

---

## 5. Armazenamento

### 5.1 Estrutura em disco (pasta e zip são idênticos)

```
meu-projeto/
├── mapping.json
└── images/
    ├── frente.jpg
    └── lateral.jpg
```

Colisão de nome ao adicionar uma imagem: sufixo `-2`, `-3`…

### 5.2 Modos

Interface comum `ProjectStorage` (carregar projeto, salvar mapping, ler/gravar/remover imagem). Os recursos são detectados em runtime e a tela inicial mostra só as opções disponíveis.

**Modo Pasta** (desktop Chrome/Edge, inclusive em `file://`)
- File System Access API (`showDirectoryPicker`, `readwrite`).
- **Salvamento automático**: debounce de ~800 ms após cada alteração grava o `mapping.json`. As imagens são gravadas ao serem adicionadas e removidas ao serem excluídas.
- Indicador de status: "Salvo" / "Salvando…" / "Erro ao salvar" (com opção de tentar de novo).
- Pasta sem `mapping.json`: oferecer criar um projeto nela, importando e posicionando automaticamente as imagens que já existirem em `images/` (ou na raiz, movendo-as para `images/`).

**Modo Local + Zip** (celular e qualquer navegador na versão hospedada)
- Projeto guardado no **IndexedDB** (lib `idb`), com salvamento automático.
- **Abrir zip**: importa para o IndexedDB.
- **Exportar**: gera o zip. Usa a Web Share API (`navigator.canShare({ files })`); se não houver suporte, faz download.
- A tela inicial lista os "Projetos neste dispositivo" (abrir / excluir).
- Indicador "Alterações não exportadas" quando houver mudanças desde a última exportação.
- Chamar `navigator.storage.persist()`.
- Aviso no iOS: o Safari pode apagar dados de sites não instalados após alguns dias sem uso. Recomendar instalar a app na tela inicial e exportar com frequência.
- Em `file://` o IndexedDB pode não ser confiável: detectar e, nesse caso, esconder o modo ou avisar.

### 5.3 Importação de imagens

- Input `type="file" accept="image/*" multiple` (no celular oferece galeria e câmera).
- **Normalização EXIF**: se a orientação for diferente de 1, recodificar com a orientação aplicada (JPEG, qualidade 0.92) antes de gravar.
- `width` e `height` gravados já com a orientação aplicada.
- **Bitmap de exibição reduzido** (lado maior de até ~2048 px, via `createImageBitmap`) para o canvas. Fotos de 12 MP pesam demais no celular. As coordenadas continuam sempre em pixels da imagem original.

---

## 6. Arquitetura

```
src/
  main.tsx
  app/        # shell, navegação simples (Home ↔ Editor)
  model/      # tipos, schema zod, operações puras, invariantes, migrações
  store/      # signals do projeto e da UI, undo/redo
  storage/    # ProjectStorage, FolderStorage, LocalStorage (IndexedDB), zip
  canvas/     # CanvasController (Konva), renderização, gestos, hit-test
  ui/         # componentes Preact (barras, painéis, lista, diálogos)
  i18n/       # pt-BR.ts, en-US.ts, t()
  theme/      # tokens CSS light/dark
  utils/
tests/
```

Princípios:
- **`model/` é puro**: funções `(projeto, args) → novo projeto`, imutáveis, sem DOM. Tudo testado.
- **Toda mutação passa por uma action do store**, que aplica a operação pura e registra no histórico.
- **Estado do projeto** (vai para o JSON e entra no undo) separado do **estado da UI** (seleção, camadas visíveis, camada ativa, modo, viewport, aba), que não entra no JSON nem no undo.
- **Undo/redo**: pilha de snapshots imutáveis (limite de 100). **Um gesto = uma entrada** (arrastar ou redimensionar faz commit no fim do gesto).
- **Konva fica isolado** num `CanvasController` imperativo, montado por um `<CanvasHost/>`. Ele observa os signals e dispara actions. Não usar `react-konva`.
- **i18n**: nenhuma string de UI hardcoded. Dicionário tipado, e o TypeScript garante que en-US tenha as mesmas chaves de pt-BR.
- **Tema**: cores em variáveis CSS. O canvas lê os tokens via `getComputedStyle` e redesenha quando o tema muda.

---

## 7. Comportamento

### 7.1 Layout

**Celular (< 900 px)**
- Barra superior compacta: chip da camada ativa (cor + nome), que abre a folha de camadas; status de salvamento/exportação; menu.
- Barra inferior: modo **Navegar/Desenhar**, adicionar imagem, desfazer/refazer, abas **Canvas | Lista**.
- **Gaveta inferior** (bottom sheet) com os detalhes da seleção: estado recolhido e expandido.

**Desktop (≥ 900 px)**
- Barra superior com todas as ações.
- Canvas ao centro. Painel lateral direito com as abas **Detalhes** e **Árvore de marcações**.
- A lista pode ser aberta lado a lado com o canvas.
- Atalhos: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z e Ctrl+Y, Delete, Esc (cancelar/desselecionar), espaço + arrastar para pan.

### 7.2 Canvas

- Pan (arrastar em área vazia), zoom (roda do mouse e pinça), botão "enquadrar tudo".
- **Modo Navegar**: toque ou clique seleciona. Arrastar um item já selecionado move o item. Arrastar em outro lugar faz pan.
- **Modo Desenhar**: arrastar cria um retângulo na imagem sob o ponto inicial, limitado às bordas dela. Continua no modo até o usuário trocar.
- Alças de redimensionamento com área de toque de pelo menos 24 px de tela.

### 7.3 Imagens

- **Adicionar**: posicionada automaticamente à direita da imagem mais à direita, com espaçamento. Escala inicial: lado maior = 1000 unidades do canvas.
- **Mover e redimensionar** (proporcional, pelos cantos): se a nova posição sobrepuser outra imagem, mostrar contorno vermelho durante o gesto e voltar à última posição válida ao soltar. Sem rotação.
- **Excluir**: confirmação mostrando quantas marcações e anotações serão apagadas. Exclui em cascata.
- **Trocar imagem** (mantém as marcações):
  - calcular `sx = novaLargura / largura` e `sy = novaAltura / altura`;
  - **mesma proporção** (diferença ≤ 1%): reescalar todas as marcações, sem revisão;
  - **proporção diferente**: avisar antes. Se o usuário confirmar, reescalar com `sx` e `sy` e marcar `needsReview = true` em todas as marcações da imagem;
  - manter `placement.x/y` e ajustar `scale` para preservar a largura exibida. Se a nova altura causar sobreposição, reposicionar num espaço livre.
- **Imagem ausente**: exibir um espaço vazio do tamanho gravado, com aviso e ação **"Reapontar imagem"** (usa o fluxo de troca). As marcações continuam visíveis e editáveis.
- Marcação com `needsReview`: borda tracejada e ícone de alerta. O botão "Confirmar posição" no painel limpa a flag.

### 7.4 Marcações

- **Ao criar**, se o retângulo estiver totalmente dentro de marcações existentes, a mais interna vira pai. O usuário pode trocar ou remover o pai no painel.
- **Trocar pai**: lista só os candidatos válidos (mesma imagem, contém o retângulo, não é descendente), mais a opção "Nenhum".
- A filha não pode sair dos limites do pai (limitar ao mover e redimensionar). O pai não pode encolher menos que a caixa que envolve as filhas.
- **Mover o pai move todos os descendentes.**
- **Excluir**: confirmação com a contagem de descendentes e anotações. Exclui em cascata.
- **Seleção**: o toque seleciona a marcação mais interna sob o ponto. Tocar de novo no mesmo ponto sobe para o pai e, depois do topo, volta para a mais interna. Tocar na imagem fora das marcações seleciona a imagem.
- **Árvore de marcações** (imagem → marcações aninhadas): seleciona qualquer marcação e centraliza o canvas nela.
- **Painel de detalhes**: nome, campos numéricos `x, y, largura, altura` (em pixels da imagem) para ajuste fino, pai.

### 7.5 Camadas

- Criar, renomear, mudar cor (paleta de ~10 cores + seletor livre), reordenar (botões subir/descer) e excluir.
- Excluir: confirmação com a contagem de anotações. Apaga as anotações da camada.
- Projeto novo começa com uma camada ("Camada 1" / "Layer 1").
- Folha/painel de camadas: checkbox de visibilidade em cada uma, "mostrar todas", seleção da ativa. **Tornar uma camada ativa a torna visível.**

### 7.6 Anotações

- No painel da marcação selecionada: uma **seção por camada visível** (cabeçalho na cor da camada), com as anotações daquela camada.
- Cada seção tem "+ Anotação". O botão principal "+ Anotação" usa a camada ativa.
- Editor: nome opcional e lista de pares. No celular, **chave em cima e valor embaixo**; no desktop, lado a lado. Adicionar, remover e reordenar pares.
- Chave vazia ou duplicada: erro inline, e a entrada não é gravada até ser corrigida.
- Exclusões simples (anotação, par) **sem confirmação**, porque o undo cobre. Exclusões em cascata **com confirmação**.
- Anotação sem nome aparece como `chave: valor` do primeiro par.

### 7.7 Visualização

- **Borda da marcação** sempre na cor neutra do tema.
- **Indicadores**: bolinhas no canto superior esquerdo, uma para cada camada visível em que a marcação tem anotação, na cor da camada. Acima de 4, mostrar "+N".
- **Esmaecimento**: marcações sem anotação em nenhuma camada visível ficam com opacidade ~0.35 (a selecionada, nunca).
- **Seleção**: borda mais grossa. Hover no desktop destaca a marcação e esmaece as outras.
- **Zoom semântico** (liga/desliga nas configurações e na barra):
  - avaliado **por marcação**: o texto aparece quando o retângulo ocupa na tela pelo menos ~180 × 100 px (constantes ajustáveis);
  - marcação **folha**: mostra, dentro do retângulo e cortado nos limites, o nome e as linhas `chave: valor` de cada camada visível, na cor da camada;
  - marcação **com filhas**: mostra só uma linha de cabeçalho (nome + indicadores), para não cobrir as filhas.
- **Visão de Lista**:
  - agrupada por Imagem → Marcação (caminho completo, ex: "Porta › Maçaneta") → Camada → Anotações com seus pares;
  - respeita as camadas visíveis. Opção "mostrar marcações sem anotação";
  - tocar num item seleciona a marcação; no celular muda para a aba Canvas e centraliza nela;
  - no desktop, lado a lado com o canvas, com a seleção sincronizada nos dois sentidos.

### 7.8 Configurações (por dispositivo, em `localStorage` com try/catch)

- Tema: Sistema / Claro / Escuro.
- Idioma: pt-BR / en-US (padrão a partir de `navigator.language`).
- Texto no canvas (zoom semântico): ligado/desligado.

---

## 8. Build, PWA e deploy

- `vite-plugin-singlefile` → `dist/index.html` autocontido, com `base: './'` (funciona em `file://` e em `/<repo>/` no Pages).
- **PWA**: manifest, service worker e ícones publicados ao lado do `index.html`. **Registrar o service worker só quando `location.protocol === 'https:'`.**
  - Tentar `vite-plugin-pwa`. Se conflitar com o singlefile, escrever um `sw.js` simples em `public/` (cache-first do `index.html`, com versão).
  - Aviso "Nova versão disponível — atualizar".
- **GitHub Actions**:
  - em push na `main`: `npm ci` → `npm test` → `npm run build` → deploy no GitHub Pages;
  - `workflow_dispatch` permitindo escolher o branch, para testar um PR no celular antes do merge;
  - publicar `dist/index.html` também como artefato do workflow (versão para desktop).

---

## 9. Testes

- **Vitest** obrigatório para `model/`, `store/` (undo/redo, agrupamento de gestos) e `storage/` (com `fake-indexeddb` e mocks da FSA), incluindo o round-trip do zip.
- Casos obrigatórios: cascatas, contenção pai/filha, mover o pai com os descendentes, reescala na troca de imagem (mesma proporção e proporção diferente), não sobreposição de imagens, chaves duplicadas, migração, round-trip do JSON sem perdas.
- E2E com Playwright é opcional, se o ambiente permitir baixar os navegadores.
- Todo PR traz, na descrição, um roteiro **"Como testar no celular"** com passos manuais.

---

## 10. Fases

Cada fase = um branch + um PR, terminando com build verde e deploy funcional.

### Fase 0 — Fundação
- [x] Vite + TS strict + Preact + @preact/signals; ESLint + Prettier; Vitest
- [x] Build singlefile com `base: './'`
- [x] Workflow de deploy no Pages (+ `workflow_dispatch` + artefato)
- [x] Infra de i18n (pt-BR, en-US) e de tema (sistema/claro/escuro)
- [x] Tela inicial vazia com troca de idioma e tema

**Aceite**: `dist/index.html` abre com duplo clique no Chrome desktop; a URL do Pages abre no celular; tema e idioma trocam e persistem.

### Fase 1 — Modelo e estado
- [x] Tipos + schema zod v1 + registro de migrações
- [x] Operações puras: camadas, imagens (adicionar/mover/redimensionar/trocar/remover), marcações (criar/alterar/mover com descendentes/trocar pai/remover), anotações e pares
- [x] Validador de invariantes
- [x] Store com undo/redo e agrupamento por gesto
- [x] Serialização/desserialização

**Aceite**: testes cobrindo todas as operações e invariantes; round-trip do JSON idêntico.

### Fase 2 — Armazenamento e tela inicial
- [x] Interface `ProjectStorage`
- [x] FolderStorage com salvamento automático e indicador de status
- [x] LocalStorage (IndexedDB), abrir zip, exportar zip (Web Share / download), lista de projetos locais, `persist()`, indicador de não exportado
- [x] Importação de imagens com normalização EXIF e bitmap de exibição
- [x] Tela inicial: Novo projeto, Abrir pasta, Abrir zip, Projetos neste dispositivo (conforme os recursos detectados)
- [x] Pasta sem `mapping.json` → criar o projeto a partir das imagens existentes
- [x] Editor provisório listando as imagens do projeto (o canvas vem na fase 3)

**Aceite**: desktop — criar projeto numa pasta, adicionar imagens, fechar, reabrir e ver o mesmo estado. Celular — abrir um zip, adicionar imagem, fechar o navegador, reabrir, exportar; o zip exportado abre no desktop com o mesmo estado.

### Fase 3 — Canvas e imagens
- [x] Layout responsivo (barras, gaveta inferior no celular, painel lateral no desktop)
- [x] CanvasHost + CanvasController: pan, zoom, pinça, enquadrar tudo
- [x] Renderizar imagens e o espaço vazio de imagem ausente
- [x] Adicionar com posicionamento automático; selecionar, mover e redimensionar sem sobreposição
- [x] Excluir em cascata; trocar imagem com reescala e `needsReview`; reapontar imagem ausente
- [x] Desfazer/refazer na interface + atalhos

**Aceite**: montar o "carro" com 4 fotos no celular, reorganizar sem conseguir sobrepor, trocar uma foto, desfazer tudo.

### Fase 4 — Marcações
- [x] Modos Navegar/Desenhar; criar retângulo limitado à imagem
- [x] Alças de redimensionamento, mover, tamanho mínimo
- [x] Hierarquia: pai automático, trocar pai, limites pai/filha, mover o pai com os descendentes
- [x] Seleção da mais interna com ciclo para o pai; árvore de marcações
- [x] Painel de detalhes (nome, x/y/largura/altura, pai, confirmar revisão)
- [x] Excluir em cascata com confirmação

**Aceite**: criar Porta › Maçaneta › Fechadura no celular; mover a Porta arrasta as filhas; a Fechadura não sai da Maçaneta; selecionar cada nível pelo toque e pela árvore.

### Fase 5 — Camadas e anotações
- [x] Gestão de camadas (criar/renomear/cor/reordenar/excluir)
- [x] Camadas visíveis (múltiplas) × camada ativa
- [x] Painel de anotações agrupado por camada visível; editor de nome e pares; validação de chaves
- [x] Indicadores coloridos e esmaecimento no canvas

**Aceite**: com as camadas Lataria e Vidros, anotar a Porta nas duas; ligar e desligar camadas altera os indicadores e o painel; excluir Vidros apaga só as anotações dela.

### Fase 6 — Visualização
- [x] Zoom semântico por marcação (folha × com filhas) + liga/desliga
- [x] Visão de Lista com filtros e navegação para o canvas
- [x] Lista lado a lado no desktop com seleção sincronizada

**Aceite**: aproximando o zoom, os pares aparecem sem cobrir as filhas; pela lista, tocar numa anotação leva à marcação no canvas.

### Fase 7 — PWA e acabamento
- [x] Manifest, ícones, service worker, aviso de nova versão
- [x] Orientação para instalar no iOS/Android e aviso de retenção no iOS
- [x] Estados vazios, mensagens de erro, acessibilidade básica (foco, rótulos, contraste nos dois temas)
- [x] Teste de desempenho: 20 imagens e 500 marcações no celular (medido em Chromium com CPU 4× mais lenta; conferir no aparelho real)
- [x] Revisão de todas as strings nos dois idiomas

**Aceite**: instalar no celular, usar em modo avião, exportar e reabrir no desktop.

---

## 11. Fora do escopo da etapa 1

- Especialização / templates (etapa 2)
- Valores tipados (número, data, opções fixas)
- Vários canvas por projeto; rotação de imagens; marcações que não sejam retângulos
- Colaboração, sincronização em nuvem, contas de usuário
