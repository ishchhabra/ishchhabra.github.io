import type { RegExpLiteral } from "oxc-parser";
import { Environment } from "../../../environment";
import { RegExpLiteralInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildRegExpLiteral(
  node: RegExpLiteral,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RegExpLiteralInstruction,
    place,
    node.regex.pattern,
    node.regex.flags,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(place, instruction);
  return place;
}
