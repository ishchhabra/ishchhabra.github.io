import { Environment } from "../environment";
import { InstructionId, makeInstructionId } from "./base/Instruction";

export function createInstructionId(environment: Environment): InstructionId {
  return makeInstructionId(environment.nextInstructionId++);
}
