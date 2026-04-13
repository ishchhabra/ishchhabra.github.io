import { DeclareLocalOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateDeclareLocalOp(
  instruction: DeclareLocalOp,
  generator: CodeGenerator,
): void {
  generator.places.set(instruction.place.id, generator.getPlaceIdentifier(instruction.place));
}
