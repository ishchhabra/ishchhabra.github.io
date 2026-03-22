import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

/**
 * Extracts the value from a static property key node.
 * Returns `undefined` for dynamic/computed keys that cannot be resolved statically.
 */
export function getValueFromStaticKey(nodePath: NodePath<t.Node>): string | number | undefined {
  if (nodePath.isIdentifier()) {
    return nodePath.node.name;
  } else if (nodePath.isStringLiteral()) {
    return nodePath.node.value;
  } else if (nodePath.isNumericLiteral()) {
    return nodePath.node.value;
  }

  return undefined;
}
