import * as t from "@babel/types";
import { SuperCallOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSuperCallOp(
  instruction: SuperCallOp,
  generator: CodeGenerator,
): t.CallExpression {
  const args = instruction.args.map((arg) => {
    const node = generator.places.get(arg.id);
    if (node === undefined) {
      throw new Error(`Place ${arg.id} not found`);
    }
    t.assertExpression(node);
    return node;
  });

  const node = t.callExpression(t.super(), args);
  generator.places.set(instruction.place.id, node);
  return node;
}
