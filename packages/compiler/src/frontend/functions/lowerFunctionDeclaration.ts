import type { FunctionIR } from "../../ir/core/FunctionIR";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { FunctionDeclaration } from "../scope/Declaration";
import { lowerFunctionBody } from "./lowerFunctionBody";

export function lowerFunctionDeclarationBody(
  builder: FunctionIRBuilder,
  declaration: FunctionDeclaration,
): FunctionIR {
  const nested = builder.createNestedFunctionIR({
    kind: "function",
    isAsync:
      declaration.functionKind === "async-function" ||
      declaration.functionKind === "async-generator",
    isGenerator:
      declaration.functionKind === "generator" || declaration.functionKind === "async-generator",
  });

  lowerFunctionBody(nested.builder, declaration.node);

  return nested.functionIR;
}
