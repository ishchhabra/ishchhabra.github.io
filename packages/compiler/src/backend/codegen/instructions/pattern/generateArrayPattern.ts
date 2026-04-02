import * as t from "@babel/types";
import { ArrayPatternInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateArrayPatternInstruction(
  instruction: ArrayPatternInstruction,
  generator: CodeGenerator,
): t.ArrayPattern {
  const elements = instruction.elements.map((element) => {
    if (element === null) {
      return null;
    }

    let node = generator.places.get(element.id);
    if (node === undefined) {
      const name = element.identifier.name ?? `$${element.identifier.id}`;
      node = t.identifier(name);
      generator.places.set(element.id, node);
    }

    t.assertLVal(node);
    return node;
  });

  const node = t.arrayPattern(elements as (t.PatternLike | null)[]);
  generator.places.set(instruction.place.id, node);
  return node;
}
