# Enum class

Enum class: conjunto fixo de constantes de uma mesma forma.

## Quando usar

- Conjuntos fixos e conhecidos: status, tipos, direções.
- Constantes que carregam dados simples (rótulo, código).

## O que não confundir

- **Enum × sealed class:** no enum todas as constantes têm a mesma forma; na sealed cada subtipo pode ter dados próprios.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc).
- As constantes ficam em `entries` (nome obrigatório, argumentos do construtor opcionais).
- Não herda classes e não tem parâmetros de tipo.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Sugestões de tipo

Ao digitar no **Tipo** das propriedades e o **Retorno** das funções, aparecem os tipos básicos do Kotlin (`String`, `Int`, `Boolean`, `List`, `Map`...). É só uma ajuda: qualquer texto continua valendo, como `String?` ou `List<Endereco>`.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function` e as constantes (`entries`), `kotlin-enum-entry`.

## Exemplo

```kotlin
enum class Status(val label: String) : HasLabel {
    ACTIVE("Ativo"),
    BLOCKED("Bloqueado"),
}
```
