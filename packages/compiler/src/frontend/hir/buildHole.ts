import { Environment } from "../../environment";
import { HoleInstruction, Place } from "../../ir";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

export function buildHole(builder: FunctionIRBuilder, environment: Environment): Place {
  const identifier = environment.createIdentifier(undefined, builder.scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(HoleInstruction, place);
  builder.addInstruction(instruction);
  return place;
}
