import { Environment } from "../../environment";
import { DeclarationId, Identifier, makeDeclarationId, makeIdentifierId } from "../../ir";

/**
 * Allocate a fresh identifier for a synthetic block parameter — the
 * SSA-merged value at a dominance frontier. The identifier gets a
 * unique declarationId by default so it codegens as a distinct JS
 * variable; the caller links it back to the source variable via
 * `identifier.originalDeclarationId`.
 */
export function createParamIdentifier(
  environment: Environment,
  declarationId?: DeclarationId,
): Identifier {
  declarationId ??= makeDeclarationId(environment.nextDeclarationId++);
  const identifierId = makeIdentifierId(environment.nextIdentifierId++);
  return new Identifier(identifierId, `blockparam_${identifierId}`, declarationId);
}
