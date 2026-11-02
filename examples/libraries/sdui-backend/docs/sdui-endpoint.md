# Endpoint

O endpoint que entrega uma tela ou um bloco. Só se aplica a marcações (não a setas): ele descreve o que a área mostra.

Tipo de anotação: `sdui-endpoint` (Endpoint).

## Campos

| Chave      | Rótulo           | Tipo   | Obrigatório | Opções | Padrão |
| ---------- | ---------------- | ------ | ----------- | ------ | ------ |
| `url`      | URL              | string | sim         |        |        |
| `typeName` | Tipo da resposta | string | não         |        |        |
| `typeRef`  | Declaração       | ref    | não         |        |        |
| `params`   | Parâmetros       | table  | não         |        |        |

## Exemplos

- **Tela de configurações**: url=/v1/screens/settings

## Quando usar

Só em marcações: o tipo declara `appliesTo: ["marking"]`, então a app não o oferece numa seta.
