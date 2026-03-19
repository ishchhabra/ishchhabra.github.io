import * as t from "@babel/types";
import { BaseStructure, ForOfStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateForOfStructure } from "./generateForOfStructure";

export function generateStructure(
  structure: BaseStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (structure instanceof ForOfStructure) {
    return generateForOfStructure(structure, functionIR, generator);
  }

  throw new Error(`Unsupported structure type: ${structure.constructor.name}`);
}
