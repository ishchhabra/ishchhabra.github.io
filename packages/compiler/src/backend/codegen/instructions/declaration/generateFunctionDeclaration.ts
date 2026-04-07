import * as t from "@babel/types";
import { FunctionDeclarationInstruction } from "../../../../ir/instructions/declaration/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

export function generateFunctionDeclarationInstruction(
  instruction: FunctionDeclarationInstruction,
  generator: CodeGenerator,
): t.FunctionDeclaration {
  const { params, statements } = generateFunction(
    instruction.functionIR,
    instruction.captures,
    generator,
  );
  const name = instruction.place.identifier.name ?? `$${instruction.place.identifier.id}`;
  const node = t.functionDeclaration(
    t.identifier(name),
    params,
    t.blockStatement(statements),
    instruction.generator,
    instruction.async,
  );
  generator.places.set(instruction.place.id, node);
  return node;
}
