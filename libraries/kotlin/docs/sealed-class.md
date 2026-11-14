# Sealed class

Sealed class: closed, abstract hierarchy; the direct subtypes are known at compile time, which allows an exhaustive when.

## When to use

- Results with different shapes (success, error, loading) and closed hierarchies with state.
- When the subtypes need a constructor or properties of their own.

## What not to confuse

- **Sealed × enum:** the enum has fixed instances of the same shape; the sealed one has subtypes with their own data.
- **Sealed class × sealed interface:** use the interface when the subtypes do not share state or need another superclass.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc), **Type parameters**.
- It is abstract; the constructor is protected or private.
- The subtypes are the declarations whose `supertypes` points to it (`typeRef` column).

## How a subtype is linked

Each line of `supertypes` holds the type as written in the code and, in **Mapped type** (`typeRef`), the mapped declaration with the `kotlin-type` tag. This is how a subtype is linked to the sealed class or interface: the subclasses are the declarations whose `supertypes` points to it.

## Nested declaration

A nested declaration (nested, inner or companion) is linked to its outer declaration through the **Declared in** field (`outer`, tag `kotlin-type`). The agent reads the link in `refs` (on the nested one) and `backlinks` (on the outer one). Drawing the marking inside the outer one is only an optional visual tidy-up: the canvas membership (`parent`/`members`) does not define the nesting in the code.

## Type suggestions

When typing in the **Type** of properties and the **Return type** of functions, the basic Kotlin types appear (`String`, `Int`, `Boolean`, `List`, `Map`...). In the **Type** of properties and supertypes the mapped declarations appear too (with their kind next to them), and choosing one also fills in the **Mapped type**. It is only a help: any text is still valid, such as `String?` or `List<Address>`.

## References to properties

- Other annotations point to a line of `properties` through a `ref` field that accepts `data-field` or `kotlin-property`.
- Functions (`functions`) carry the `kotlin-function` tag.

## Example

```kotlin
sealed class Resultado<out T> {
    val timestamp: Long = System.currentTimeMillis()

    data class Sucesso<T>(val valor: T) : Resultado<T>()
    data class Falha(val erro: Throwable) : Resultado<Nothing>()
}
```
