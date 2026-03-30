import { Binding, NodePath } from "@babel/traverse";

export function isBindingOwnedByScope(bindingsPath: NodePath, binding: Binding | undefined) {
  return binding?.scope === bindingsPath.scope;
}
