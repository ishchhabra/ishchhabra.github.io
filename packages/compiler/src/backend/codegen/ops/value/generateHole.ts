import { HoleOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateHoleOp(instruction: HoleOp, generator: CodeGenerator): null {
  const node = null;
  generator.places.set(instruction.place.id, node);
  return node;
}
