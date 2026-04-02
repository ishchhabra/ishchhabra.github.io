import * as t from "@babel/types";
import { DeclareLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateDeclareLocalInstruction(
  instruction: DeclareLocalInstruction,
  generator: CodeGenerator,
): void {
  const identifier = t.identifier(instruction.place.identifier.name);
  generator.places.set(instruction.place.id, identifier);
  generator.declarationKinds.set(instruction.place.identifier.declarationId, instruction.kind);
}
