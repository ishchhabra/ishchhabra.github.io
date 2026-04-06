import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { RegExpLiteralInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildRegExpLiteral(
  node: ESTree.RegExpLiteral,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier(undefined, functionBuilder.scope.allocateName());
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
