import * as t from "@babel/types";
import { SuperCallOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSuperCallOp(
  instruction: SuperCallOp,
  generator: CodeGenerator,
): t.CallExpression {
  const args = instruction.args.map((arg) => {
    const node = generator.values.get(arg.id);
    if (node === undefined) {
      throw new Error(`Value ${arg.id} not found`);
    }
    t.assertExpression(node);
    return node;
  });

  const node = t.callExpression(t.super(), args);
  generator.values.set(instruction.place.id, node);
  return node;
}
