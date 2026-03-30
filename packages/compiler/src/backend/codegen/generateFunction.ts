import * as t from "@babel/types";
import { BindingIdentifierInstruction } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Place } from "../../ir/core/Place";
import { CodeGenerator } from "../CodeGenerator";
import { generateBlock } from "./generateBlock";
import { generateBindingIdentifierInstruction } from "./instructions/generateBindingIdentifier";
import { generateInstruction } from "./instructions/generateInstruction";

/**
 * Generates the body of a function.
 *
 * @param captures - Outer-scope Places this function captures, aligned
 *   by index with `functionIR.captureParams`. When present, each
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
  // Save and restore generatedBlocks so each function gets a fresh scope.
  // This is necessary because function inlining can share FunctionIR
  // objects between the original definition and the inlined call site,
  // causing blocks to be incorrectly skipped on the second generation.
  const savedGeneratedBlocks = new Set(generator.generatedBlocks);

  // Bind capture parameters to outer captures so the function body
  // resolves captured variables through the indirection layer.
  for (let i = 0; i < functionIR.captureParams.length; i++) {
    if (i < captures.length) {
      const outerNode = generator.places.get(captures[i].id);
      if (outerNode !== undefined) {
        generator.places.set(functionIR.captureParams[i].id, outerNode);
      }
    }
  }

  // Pre-register all binding identifiers across ALL blocks of this function.
  // This ensures closures defined in earlier blocks can reference variables
  // declared in later blocks (e.g. phi variables in merge blocks).
  for (const instruction of functionIR.header) {
    if (instruction instanceof BindingIdentifierInstruction) {
      generateBindingIdentifierInstruction(instruction, generator);
    }
  }

  for (const [, block] of functionIR.blocks) {
    for (const instruction of block.instructions) {
      if (instruction instanceof BindingIdentifierInstruction) {
        generateBindingIdentifierInstruction(instruction, generator);
      }
    }
  }

  generateHeader(functionIR, generator);
  const params = generateFunctionParams(functionIR, generator);

  const statements = generateBlock(functionIR.entryBlockId, functionIR, generator);

  generator.generatedBlocks = savedGeneratedBlocks;

  return { params, statements };
}

function generateFunctionParams(
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Identifier | t.RestElement | t.Pattern> {
  return functionIR.params.map((param) => {
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
  for (const instruction of functionIR.header) {
    generateInstruction(instruction, functionIR, generator);
  }
}
