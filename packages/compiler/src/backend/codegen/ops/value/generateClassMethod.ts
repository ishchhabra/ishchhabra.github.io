import * as t from "@babel/types";
import { ClassMethodOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

export function generateClassMethodOp(
  instruction: ClassMethodOp,
  generator: CodeGenerator,
): t.ClassMethod {
  const key = generator.values.get(instruction.key.id);
  if (key === undefined) {
    throw new Error(`Value ${instruction.key.id} not found`);
  }
  t.assertExpression(key);

  const { params, statements } = generateFunction(
    instruction.body,
    instruction.captures,
    generator,
  );

  const node = t.classMethod(
    instruction.kind,
    key,
    params,
    t.blockStatement(statements),
    instruction.computed,
    instruction.isStatic,
    instruction.generator,
    instruction.async,
  );

  generator.values.set(instruction.place.id, node);
  return node;
}
