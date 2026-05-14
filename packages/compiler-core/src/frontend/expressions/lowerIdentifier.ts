import type { Value } from "../../ir/core/Value";
import { LoadBindingOp } from "../../ir/ops/bindings/LoadBindingOp";
import { LoadGlobalOp } from "../../ir/ops/globals/LoadGlobalOp";
import type { ScopeReferenceNode } from "../ast/types";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an identifier reference by reading its resolved binding.
 */
export function lowerIdentifier(builder: FunctionIRBuilder, identifier: ScopeReferenceNode): Value {
  if (builder.isGlobalReference(identifier)) {
    const result = builder.createValue();
    builder.emit(new LoadGlobalOp(builder.operationId(), identifier.name, result));
    return result;
  }

  const declaration = builder.declarationForReference(identifier);
  const result = builder.createValue();

  builder.emit(new LoadBindingOp(builder.operationId(), declaration.id, result));

  return result;
}
