import * as t from "@babel/types";
import { RegExpLiteralOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateRegExpLiteralOp(
  instruction: RegExpLiteralOp,
  generator: CodeGenerator,
): t.Expression {
  const node = t.regExpLiteral(instruction.pattern, instruction.flags);
  generator.places.set(instruction.place.id, node);
  return node;
}
