import * as t from "@babel/types";
import { LoadGlobalOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadGlobalOp(
  instruction: LoadGlobalOp,
  generator: CodeGenerator,
): t.Expression {
  const node = t.identifier(instruction.name);
  generator.values.set(instruction.place.id, node);
  return node;
}
