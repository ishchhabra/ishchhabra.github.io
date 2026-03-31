import { NodePath } from "@babel/core";
import * as t from "@babel/types";

export type NamedDeclarationPath = NodePath<t.ClassDeclaration | t.FunctionDeclaration>;

/**
 * Babel gives named function/class declarations their own inner scope on the
 * declaration node, but the declaration binding itself is owned by the parent
 * lexical scope (program/block/export wrapper). Lowering and instantiation must
 * both resolve through that owning scope to avoid shadowing bugs.
 */
export function getDeclarationOwningPath(nodePath: NamedDeclarationPath): NodePath<t.Node> {
  const owningPath = nodePath.parentPath;
  if (owningPath == null) {
    throw new Error(`${nodePath.type} is missing an owning scope`);
  }

  return owningPath;
}
