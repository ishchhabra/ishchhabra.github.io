import { Environment } from "../../environment";
import { HoleOp, Place } from "../../ir";
import { FuncOpBuilder } from "./FuncOpBuilder";

export function buildHole(builder: FuncOpBuilder, environment: Environment): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(HoleOp, place);
  builder.addOp(instruction);
  return place;
}
