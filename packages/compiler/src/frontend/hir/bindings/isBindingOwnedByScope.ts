import { type Binding, type Scope } from "../../scope/Scope";

export function isBindingOwnedByScope(scope: Scope, binding: Binding | undefined) {
  return binding?.scope === scope;
}
