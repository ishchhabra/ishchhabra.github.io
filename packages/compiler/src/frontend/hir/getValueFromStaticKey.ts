import type { Node, PrivateIdentifier } from "oxc-parser";
import { isIdentifier, isNumericLiteral, isStringLiteral } from "../estree";

/**
 * Extracts the value from a static property key node.
 * Returns `undefined` for dynamic/computed keys that cannot be resolved statically.
 */
export function getValueFromStaticKey(node: Node | PrivateIdentifier): string | number | undefined {
  if (isIdentifier(node)) {
    return node.name;
  } else if (isStringLiteral(node)) {
    return node.value;
  } else if (isNumericLiteral(node)) {
    return node.value;
  }

  return undefined;
}
