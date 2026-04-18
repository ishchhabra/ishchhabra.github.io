import { Environment } from "../../environment";
import { HoleOp, Value } from "../../ir";
import { FuncOpBuilder } from "./FuncOpBuilder";

export function buildHole(builder: FuncOpBuilder, environment: Environment): Value {
  const place = environment.createValue();
  const instruction = environment.createOperation(HoleOp, place);
  builder.addOp(instruction);
  return place;
}
