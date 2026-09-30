# Formato do `mapping.json` (schema v3)

O projeto é uma pasta com `mapping.json` e `images/`. Todas as coordenadas das marcações
são **pixels inteiros da imagem original** (`images[].file`, com a orientação EXIF já aplicada).

```json
{
  "schemaVersion": 3,
  "app": "mapeador-imagens",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": { "name": "Carro", "createdAt": "…", "updatedAt": "…" },
  "layers": [{ "id": "L1", "name": "Componentes", "color": "#E53935" }],
  "images": [
    {
      "id": "I1",
      "name": "Tela Home",
      "file": "images/home.webp",
      "width": 1182,
      "height": 2560,
      "placement": { "x": 0, "y": 0, "scale": 0.4 },
      "markingColor": null
    }
  ],
  "markings": [
    {
      "id": "M1",
      "imageId": "I1",
      "parentId": null,
      "name": "Botão",
      "rect": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "needsReview": false
    }
  ],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Button",
      "inherit": false,
      "parentAnnotationId": null,
      "entries": [{ "key": "estilo", "value": "primário" }]
    }
  ]
}
```

## Campos da v2 e v3

- `images[].name`: rótulo opcional (`null` = use o nome do arquivo). Mudá-lo não renomeia o arquivo.
- `images[].markingColor` (v3): cor `#RRGGBB` da borda das marcações da imagem, ou `null` (cor neutra do tema). Só afeta a interface, não o recorte.
- `annotations[].inherit`: se `true`, a anotação também vale para **todos os descendentes** da marcação.
- `annotations[].parentAnnotationId`: anotação "dona" (ou `null`).
  - a dona está na **mesma marcação** e em **outra camada**;
  - não há ciclos (a cadeia pode atravessar várias camadas).
- `placement` e `needsReview` só importam para a interface; `placement` não afeta o recorte.

A herança **não é materializada** no JSON: é sempre calculada a partir de `parentId` e `inherit`.
Herança e vínculo são independentes: se a dona tem `inherit: true`, suas vinculadas só descem
para as marcações filhas se também tiverem `inherit: true`.

## Como um agente lê o `mapping.json`

1. **Recorte da marcação**: `rect` em pixels da imagem em `images[].file` (orientação EXIF aplicada).
2. **Anotações próprias**: `annotations` com o `markingId` da marcação, agrupadas por `layerId`.
3. **Herdadas**: subir por `parentId` e pegar as anotações dos ancestrais com `inherit: true`.
4. **Estrutura**: anotações com `parentAnnotationId` formam uma árvore; o nome da camada da
   vinculada é o nome da propriedade na dona. Ex.: `Button.Eventos = [onClick, onLongPress]`.

Em código TypeScript, `src/model/` oferece `getInheritedAnnotations(project, markingId)` e
`getLinkedAnnotations(project, annotationId)`.

## Migração

Arquivos v1 são migrados ao abrir: toda imagem recebe `name: null` e toda anotação recebe
`inherit: false` e `parentAnnotationId: null`. Arquivos v2 recebem `markingColor: null` em cada imagem. Ao salvar, o arquivo passa a ser v3.
Arquivos de versão mais nova abrem somente para leitura.
