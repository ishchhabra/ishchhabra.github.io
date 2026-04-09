import * as t from "@babel/types";
import { DeclareLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateDeclareLocalInstruction(
  instruction: DeclareLocalInstruction,
  generator: CodeGenerator,
): void {
  generator.places.set(instruction.place.id, generator.getPlaceIdentifier(instruction.place));
}
