import * as t from "@babel/types";
import { ForOfStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";

export function generateForOfStructure(
  structure: ForOfStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  throw new Error("Not implemented");
}
