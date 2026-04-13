import * as t from "@babel/types";
import { LoadPhiOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadPhiOp(instruction: LoadPhiOp, generator: CodeGenerator): t.Expression {
  const node = t.identifier(instruction.value.identifier.name);
  generator.places.set(instruction.place.id, node);
  return node;
}
