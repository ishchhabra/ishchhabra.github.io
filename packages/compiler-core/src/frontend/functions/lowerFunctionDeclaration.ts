import type { FunctionIR } from "../../ir/core/FunctionIR";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { FunctionDeclaration } from "../scope/Declaration";
import { lowerFunctionBody } from "./lowerFunctionBody";

export function lowerFunctionDeclarationBody(
  builder: FunctionIRBuilder,
  declaration: FunctionDeclaration,
): FunctionIR {
  const captures = builder.capturesForOwner(declaration.node);
  const nested = builder.createNestedFunctionIR({
    kind: "function",
    isAsync:
      declaration.functionKind === "async-function" ||
      declaration.functionKind === "async-generator",
    isGenerator:
      declaration.functionKind === "generator" || declaration.functionKind === "async-generator",
    captures,
  });

  lowerFunctionBody(nested.builder, declaration.node);

  return nested.functionIR;
}
