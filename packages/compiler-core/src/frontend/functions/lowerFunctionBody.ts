import type { ArrowFunctionExpression, Function as OxcFunction } from "oxc-parser";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import { lowerExpression } from "../expressions/lowerExpression";
import { lowerStatement } from "../statements/lowerStatement";
import { lowerFunctionParameters } from "./lowerFunctionParameters";

/**
 * Lowers the executable body of a function.
 */
export function lowerFunctionBody(builder: FunctionIRBuilder, functionNode: OxcFunction): void {
  if (functionNode.body === null) {
    throw new Error("Function body is required");
  }

  lowerFunctionParameters(builder, functionNode);
  lowerDeclarationInstantiation(builder, functionNode);

  for (const statement of functionNode.body.body) {
    lowerStatement(builder, statement);
  }
}

/**
 * Lowers the executable body of an arrow function.
 */
export function lowerArrowFunctionBody(
  builder: FunctionIRBuilder,
  functionNode: ArrowFunctionExpression,
): void {
  lowerFunctionParameters(builder, functionNode);
  lowerDeclarationInstantiation(builder, functionNode);

  if (functionNode.body.type !== "BlockStatement") {
    const value = lowerExpression(builder, functionNode.body);
    builder.terminate(new ReturnTerminatorOp(builder.operationId(), value));
    return;
  }

  for (const statement of functionNode.body.body) {
    lowerStatement(builder, statement);
  }
}
