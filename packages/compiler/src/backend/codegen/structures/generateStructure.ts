import * as t from "@babel/types";
import { BaseStructure, ForInStructure, ForOfStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateForInStructure } from "./generateForInStructure";
import { generateForOfStructure } from "./generateForOfStructure";

export function generateStructure(
  structure: BaseStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (structure instanceof ForInStructure) {
    return generateForInStructure(structure, functionIR, generator);
  }
  if (structure instanceof ForOfStructure) {
    return generateForOfStructure(structure, functionIR, generator);
  }

  throw new Error(`Unsupported structure type: ${structure.constructor.name}`);
}
