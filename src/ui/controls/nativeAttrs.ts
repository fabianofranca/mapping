import type {
  InputHTMLAttributes,
  LooseInputHTMLAttributes,
  LooseSelectHTMLAttributes,
  SelectHTMLAttributes,
} from 'preact';

// Preact 11 types the attributes of the native `<input>` and `<select>` as unions checked by
// `type` and `role` (for example, `type="search"` with `role="combobox"` needs a `list`). The
// controls pass `type` and `role` through from their callers and the combobox pickers keep
// `type="search"`, so they type their props with the `Loose*` variants and hand the attributes to
// the native element here, the only place that narrows them. The attributes are the same at
// runtime: only the check at the call site changes.

/** The attributes of a native `<input>` typed loosely, ready to spread on `<input>`. */
export function inputAttrs<T extends EventTarget = HTMLInputElement>(
  attrs: LooseInputHTMLAttributes<T>,
): InputHTMLAttributes<T> {
  return attrs as InputHTMLAttributes<T>;
}

/** The attributes of a native `<select>` typed loosely, ready to spread on `<select>`. */
export function selectAttrs<T extends EventTarget = HTMLSelectElement>(
  attrs: LooseSelectHTMLAttributes<T>,
): SelectHTMLAttributes<T> {
  return attrs as SelectHTMLAttributes<T>;
}
