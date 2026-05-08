import type { Value } from "../../core/Value";

export type ArgumentListElement =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "spread"; readonly value: Value };

/**
 * Positional element supplied to an ECMAScript call or construct argument list.
 *
 * @example
 * ```js
 * fn(a, ...rest);
 * new C(a, ...rest);
 * ```
 */
export function argumentListElementValue(element: ArgumentListElement): Value {
  return element.value;
}

export function argumentListElementValues(
  elements: readonly ArgumentListElement[],
): readonly Value[] {
  return elements.map(argumentListElementValue);
}

export function argumentListElementsWithValues(
  elements: readonly ArgumentListElement[],
  values: readonly Value[],
): readonly ArgumentListElement[] {
  if (values.length !== elements.length) {
    throw new Error(`Expected ${elements.length} argument list values, got ${values.length}`);
  }

  return elements.map((element, index) => ({
    kind: element.kind,
    value: values[index],
  }));
}
