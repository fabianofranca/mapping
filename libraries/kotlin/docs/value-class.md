# Value class

Value class (@JvmInline): wraps a single value with its own type, with no object cost at runtime.

## When to use

- Typed ids and values (UserId, Email, Meters) that must not be mixed up with String or Int.

## What not to confuse

- **Value class × data class:** the value class has exactly one property and disappears at runtime; the data class is an object with several.

## Main fields

- **Name** (required): simple name of the declaration; it carries the `kotlin-type` tag, so supertypes and property types of other markings can point to it.
- **Package**, **Visibility**, **Annotations** and **Description** (KDoc), **Type parameters**.
- Exactly one property (always `val`), in the constructor.
- Carries `@JvmInline` and does not inherit from classes.

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
@JvmInline
value class UserId(val value: String) : Comparable<UserId> {
    override fun compareTo(other: UserId): Int = value.compareTo(other.value)
}
```
