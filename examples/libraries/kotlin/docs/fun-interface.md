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

## Aninhamento

Uma declaração aninhada é uma marcação desenhada **dentro** da marcação da declaração externa; o pertencimento vem da geometria (o agente lê `parent` e `members`), não de um campo.

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
