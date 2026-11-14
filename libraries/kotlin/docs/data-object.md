# Data object

Data object: object with generated toString, equals and hashCode, useful as a case without data in a sealed class or interface (data object Loading).

## When to use

- Cases without data in a closed hierarchy (Loading, Empty, Idle).

## What not to confuse

- **Data object × object:** only the data object has generated `toString` and `equals`.
- **Data object × data class:** the data object is a single instance and has no constructor.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc).
- No constructor or type parameters.
- Points to the sealed one in `supertypes` (and, if nested in it, in Declared in).

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
sealed interface UiState {
    data object Loading : UiState
}
```
