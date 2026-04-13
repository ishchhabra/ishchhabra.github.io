import type { RegExpLiteral } from "oxc-parser";
import { Environment } from "../../../environment";
import { RegExpLiteralOp } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildRegExpLiteral(
  node: RegExpLiteral,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    RegExpLiteralOp,
    place,
    node.regex.pattern,
    node.regex.flags,
  );
  functionBuilder.addOp(instruction);
  environment.registerDeclarationOp(place, instruction);
  return place;
}
