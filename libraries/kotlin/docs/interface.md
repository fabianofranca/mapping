# Interface

Interface Kotlin: contrato com funções (abstratas por padrão, ou com corpo) e propriedades (abstratas ou com getter).

## Quando usar

- Contratos entre camadas (repositórios, casos de uso, callbacks).
- Tipos que várias classes implementam.

## O que não confundir

- **Interface × class abstract:** a interface não guarda estado nem tem construtor.
- **Interface × fun interface:** a fun interface tem exatamente uma função abstrata e aceita lambda.
- **Interface × sealed interface:** a sealed fecha os implementadores no módulo e no pacote.

## Campos principais

- **Nome** (obrigatório): nome simples da declaração; leva a etiqueta `kotlin-type`, então supertipos e tipos de propriedade de outras marcações podem apontar para ela.
- **Pacote**, **Visibilidade**, **Anotações** e **Descrição** (KDoc), **Parâmetros de tipo**.
- Função sem corpo é abstrata; propriedade sem `defaultValue` é abstrata.
- Um implementador aponta para ela em `supertypes.typeRef`.

## Como o subtipo se liga

Cada linha de `supertypes` traz o tipo como escrito no código e, em **Tipo mapeado** (`typeRef`), a declaração mapeada com a etiqueta `kotlin-type`. É assim que um subtipo se liga à sealed class ou interface: as subclasses são as declarações cujo `supertypes` aponta para ela.

## Declaração aninhada

Uma declaração aninhada (nested, inner ou companion) se liga à externa pelo campo **Declarada em** (`outer`, etiqueta `kotlin-type`). O agente lê a ligação em `refs` (na aninhada) e `backlinks` (na externa). Desenhar a marcação dentro da externa é só arrumação visual e opcional: o pertencimento do canvas (`parent`/`members`) não define o aninhamento no código.

## Referências às propriedades

- Outras anotações apontam para uma linha de `properties` por um campo `ref` que aceita `data-field` ou `kotlin-property`.
- Funções (`functions`) têm a etiqueta `kotlin-function`.

## Exemplo

```kotlin
interface UserRepository : Repository<User> {
    val count: Int

    suspend fun find(id: String): User?
}
```
