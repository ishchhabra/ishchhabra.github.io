import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { BinaryExpressionInstruction, LiteralInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { materializePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import {
  buildMemberReference,
  emitMemberReferenceStore,
  loadMemberReference,
} from "./buildMemberReference";

export function buildMemberExpression(
  node: AST.MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const reference = buildMemberReference(node, scope, functionBuilder, moduleBuilder, environment);
  return loadMemberReference(reference, functionBuilder, environment);
}

/**
 * Handles UpdateExpression where the argument is a MemberExpression.
 * e.g. `++obj.prop`, `obj.prop--`, `++arr[i]`, `arr[i]--`
 *
 * Desugars to:
 *   1. Load the current property value
 *   2. Compute value +/- 1
 *   3. Store the new value back to the property
 *   4. Return old value (postfix) or new value (prefix)
 */
export function buildMemberExpressionUpdate(
  updateNode: AST.UpdateExpression,
  memberNode: AST.MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const reference = buildMemberReference(
    memberNode,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    {
      reusable: true,
    },
  );
  const loadPlace = loadMemberReference(reference, functionBuilder, environment);

  // 3. Materialize old value into a temporary so codegen doesn't
  //    re-read the property after it has been mutated by the store.
  const oldValLoadPlace = materializePlace(loadPlace, functionBuilder, environment);

  // 4. Create literal 1
  const oneIdentifier = environment.createIdentifier();
  const onePlace = environment.createPlace(oneIdentifier);
  const oneInstruction = environment.createInstruction(LiteralInstruction, onePlace, 1);
  functionBuilder.addInstruction(oneInstruction);

  // 5. Compute value +/- 1
  const isIncrement = updateNode.operator === "++";
  const resultIdentifier = environment.createIdentifier();
  const resultPlace = environment.createPlace(resultIdentifier);
  const binaryInstruction = environment.createInstruction(
    BinaryExpressionInstruction,
    resultPlace,
    isIncrement ? "+" : "-",
    oldValLoadPlace,
    onePlace,
  );
  functionBuilder.addInstruction(binaryInstruction);

  // 5b. Materialize the computed value into a named local so codegen
  //     references an identifier rather than re-emitting the binary expression.
  const newValLoadPlace = materializePlace(resultPlace, functionBuilder, environment);

  // 6. Store the new value back to the property.
  emitMemberReferenceStore(reference, newValLoadPlace, functionBuilder, environment);

  // 8. Return old value (postfix) or new value (prefix)
  return updateNode.prefix ? newValLoadPlace : oldValLoadPlace;
}
