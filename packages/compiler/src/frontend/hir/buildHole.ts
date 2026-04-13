import { Environment } from "../../environment";
import { HoleOp, Place } from "../../ir";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

export function buildHole(builder: FunctionIRBuilder, environment: Environment): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(HoleOp, place);
  builder.addOp(instruction);
  return place;
}
