import type { MemberExpression, UpdateExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { BinaryExpressionOp, LiteralOp, Place, SuperPropertyOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { materializePlace } from "../materializePlace";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import {
  buildMemberReference,
  emitMemberReferenceStore,
  loadMemberReference,
} from "./buildMemberReference";

export function buildMemberExpression(
  node: MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // super.foo or super[expr] — emit a dedicated SuperPropertyOp.
  // `super` is not a value and must not be lowered to a Place.
  if (node.object.type === "Super") {
    return buildSuperPropertyAccess(node, scope, functionBuilder, moduleBuilder, environment);
  }

  const reference = buildMemberReference(node, scope, functionBuilder, moduleBuilder, environment);
  return loadMemberReference(reference, functionBuilder, environment);
}

function buildSuperPropertyAccess(
  node: MemberExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  let propertyPlace: Place;
  if (!node.computed && node.property.type === "Identifier") {
    // Non-computed key → emit as a LiteralOp so the name survives SSA.
    const keyId = environment.createIdentifier();
    propertyPlace = environment.createPlace(keyId);
    functionBuilder.addOp(
      environment.createOperation(LiteralOp, propertyPlace, node.property.name),
    );
  } else {
    const built = buildNode(node.property, scope, functionBuilder, moduleBuilder, environment);
    if (built === undefined || Array.isArray(built)) {
      throw new Error("Super property key must be a single place");
    }
    propertyPlace = built;
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    SuperPropertyOp,
    place,
    propertyPlace,
    node.computed,
  );
  functionBuilder.addOp(instruction);
  return place;
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
  updateNode: UpdateExpression,
  memberNode: MemberExpression,
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
  const oneInstruction = environment.createOperation(LiteralOp, onePlace, 1);
  functionBuilder.addOp(oneInstruction);

  // 5. Compute value +/- 1
  const isIncrement = updateNode.operator === "++";
  const resultIdentifier = environment.createIdentifier();
  const resultPlace = environment.createPlace(resultIdentifier);
  const binaryInstruction = environment.createOperation(
    BinaryExpressionOp,
    resultPlace,
    isIncrement ? "+" : "-",
    oldValLoadPlace,
    onePlace,
  );
  functionBuilder.addOp(binaryInstruction);

  // 5b. Materialize the computed value into a named local so codegen
  //     references an identifier rather than re-emitting the binary expression.
  const newValLoadPlace = materializePlace(resultPlace, functionBuilder, environment);

  // 6. Store the new value back to the property.
  emitMemberReferenceStore(reference, newValLoadPlace, functionBuilder, environment);

  // 8. Return old value (postfix) or new value (prefix)
  return updateNode.prefix ? newValLoadPlace : oldValLoadPlace;
}
