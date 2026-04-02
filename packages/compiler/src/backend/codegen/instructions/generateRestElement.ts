import * as t from "@babel/types";
import { RestElementInstruction } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateRestElementInstruction(
  instruction: RestElementInstruction,
  generator: CodeGenerator,
) {
  let argument = generator.places.get(instruction.argument.id);
  if (argument === undefined) {
    const name = instruction.argument.identifier.name ?? `$${instruction.argument.identifier.id}`;
    argument = t.identifier(name);
    generator.places.set(instruction.argument.id, argument);
  }
  t.assertLVal(argument);

  const node = t.restElement(argument as t.RestElement["argument"]);
  generator.places.set(instruction.place.id, node);
  return node;
}
