import * as t from "@babel/types";
import { BaseStructure, ForInStructure, ForOfStructure, TernaryStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateForInStructure } from "./generateForInStructure";
import { generateForOfStructure } from "./generateForOfStructure";
import { generateTernaryStructure } from "./generateTernaryStructure";

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
  if (structure instanceof TernaryStructure) {
    return generateTernaryStructure(structure, functionIR, generator);
  }

  throw new Error(`Unsupported structure type: ${structure.constructor.name}`);
}
