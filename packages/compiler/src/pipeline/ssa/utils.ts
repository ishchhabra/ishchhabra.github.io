import { Environment } from "../../environment";
import { DeclarationId, Value } from "../../ir";

/**
 * Allocate a fresh SSA {@link Value} for a synthetic block parameter —
 * the SSA-merged value at a dominance frontier. The value gets a
 * unique declarationId by default so it codegens as a distinct JS
 * variable; the caller links it back to the source variable via
 * `value.originalDeclarationId`.
 */
export function createParamValue(environment: Environment, declarationId?: DeclarationId): Value {
  const value = environment.createValue(declarationId);
  value.name = `blockparam_${value.id}`;
  return value;
}
