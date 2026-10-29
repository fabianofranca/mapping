# Fun interface

Fun interface (SAM): interface com exatamente uma função abstrata (sem corpo), o que permite criá-la com um lambda.

## Quando usar

- Callbacks e estratégias de uma operação só, criadas com lambda.

## O que não confundir

- **Fun interface × interface:** a fun interface exige exatamente uma função abstrata.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- Exatamente uma função abstrata (sem corpo); as demais têm corpo.
- Pode ter parâmetros de tipo.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Sugestões de tipo

Ao digitar no **Tipo** das propriedades e o **Retorno** das funções, aparecem os tipos básicos do Kotlin (`String`, `Int`, `Boolean`, `List`, `Map`...). No **Tipo** das propriedades e dos supertipos aparecem também as declarações mapeadas (com o tipo delas ao lado), e escolher uma preenche junto o **Tipo mapeado**. É só uma ajuda: qualquer texto continua valendo, como `String?` ou `List<Endereco>`.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
fun interface Validator {
    fun validate(input: String): Boolean
}

val notEmpty = Validator { it.isNotEmpty() }
```
