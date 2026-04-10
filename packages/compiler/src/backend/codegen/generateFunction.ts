import * as t from "@babel/types";
import { DeclareLocalInstruction } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Place } from "../../ir/core/Place";
import { CodeGenerator } from "../CodeGenerator";
import { generateBlock } from "./generateBlock";
import { generateDeclareLocalInstruction } from "./instructions/memory/generateDeclareLocal";
import { generateInstruction } from "./instructions/generateInstruction";

/**
 * Generates the body of a function.
 *
 * @param captures - Outer-scope Places this function captures, aligned
 *   by index with `functionIR.runtime.captureParams`. When present, each
 *   `captureParams[i]` is bound to `captures[i]`'s generated node so
 *   the function body can reference captured variables through the
 *   indirection layer.
 */
export function generateFunction(
  functionIR: FunctionIR,
  captures: Place[],
  generator: CodeGenerator,
): {
  params: Array<t.Identifier | t.RestElement | t.Pattern>;
  statements: Array<t.Statement>;
} {
  return generator.withFunctionState(() => {
    // Bind capture parameters to outer captures so the function body
    // resolves captured variables through the indirection layer.
    for (let i = 0; i < functionIR.runtime.captureParams.length; i++) {
      if (i < captures.length) {
        const outerNode = generator.places.get(captures[i].id);
        if (outerNode !== undefined) {
          generator.places.set(functionIR.runtime.captureParams[i].id, outerNode);
        }
      }
    }

    // Pre-register all binding identifiers across ALL blocks of this function.
    // This ensures closures defined in earlier blocks can reference variables
    // declared in later blocks (e.g. phi variables in merge blocks).
    for (const instruction of functionIR.source.header) {
      if (instruction instanceof DeclareLocalInstruction) {
        generateDeclareLocalInstruction(instruction, generator);
      }
    }

    for (const [, block] of functionIR.blocks) {
      for (const instruction of block.instructions) {
        if (instruction instanceof DeclareLocalInstruction) {
          generateDeclareLocalInstruction(instruction, generator);
        }
      }
    }

    generateHeader(functionIR, generator);
    const params = generateFunctionParams(functionIR, generator);

    const statements = generateBlock(functionIR.entryBlockId, functionIR, generator);
    return { params, statements };
  });
}

function generateFunctionParams(
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Identifier | t.RestElement | t.Pattern> {
  return functionIR.source.params.map((param) => {
    const node = generator.places.get(param.id);
    if (node === undefined) {
      throw new Error(`Place ${param.id} not found`);
    }

    if (node === null) {
      throw new Error(`Holes are not supported in function parameters.`);
    }

    if (!(t.isIdentifier(node) || t.isPattern(node) || t.isRestElement(node))) {
      throw new Error(`Unsupported function param: ${node.type}`);
    }
    return node;
  });
}

function generateHeader(functionIR: FunctionIR, generator: CodeGenerator) {
  for (const instruction of functionIR.source.header) {
    generateInstruction(instruction, functionIR, generator);
  }
}
