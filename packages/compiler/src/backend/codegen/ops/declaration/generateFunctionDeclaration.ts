import * as t from "@babel/types";
import { FunctionDeclarationOp } from "../../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

export function generateFunctionDeclarationOp(
  instruction: FunctionDeclarationOp,
  generator: CodeGenerator,
): t.FunctionDeclaration {
  const { params, statements } = generateFunction(
    instruction.funcOp,
    instruction.captures,
    generator,
  );
  const name = instruction.place.name ?? `$${instruction.place.id}`;
  const node = t.functionDeclaration(
    t.identifier(name),
    params,
    t.blockStatement(statements),
    instruction.generator,
    instruction.async,
  );
  generator.values.set(instruction.place.id, node);
  return node;
}
