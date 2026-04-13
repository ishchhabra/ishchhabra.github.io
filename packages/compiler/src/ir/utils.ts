import { Environment } from "../environment";
import { OperationId, makeOperationId } from "./core/Operation";

export function createOperationId(environment: Environment): OperationId {
  return makeOperationId(environment.nextOperationId++);
}
