import type { RegExpLiteral } from "oxc-parser";
import { Environment } from "../../../environment";
import { RegExpLiteralOp } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildRegExpLiteral(
  node: RegExpLiteral,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const place = environment.createValue();
  const instruction = environment.createOperation(
    RegExpLiteralOp,
    place,
    node.regex.pattern,
    node.regex.flags,
  );
  functionBuilder.addOp(instruction);
  return place;
}
