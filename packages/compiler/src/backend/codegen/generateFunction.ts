import * as t from "@babel/types";
import { DeclareLocalOp } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { CodeGenerator } from "../CodeGenerator";
import { generateBlock } from "./generateBlock";
import { generateOp } from "./ops/generateOp";
import { generateDeclareLocalOp } from "./ops/memory/generateDeclareLocal";
import { generateDestructureTarget } from "./ops/memory/generateDestructureTarget";

/**
 * Generates the body of a function.
 *
 * @param captures - Outer-scope Places this function captures, aligned
 *   by index with `funcOp.runtime.captureParams`. When present, each
 *   `captureParams[i]` is bound to `captures[i]`'s generated node so
 *   the function body can reference captured variables through the
 *   indirection layer.
 */
export function generateFunction(
  funcOp: FuncOp,
  captures: Value[],
  generator: CodeGenerator,
): {
  params: Array<t.Identifier | t.RestElement | t.Pattern>;
  statements: Array<t.Statement>;
} {
  return generator.withFunctionState(() => {
    // Bind capture parameters to outer captures so the function body
    // resolves captured variables through the indirection layer.
    for (let i = 0; i < funcOp.captureParams.length; i++) {
      if (i < captures.length) {
        const outerNode = generator.values.get(captures[i].id);
        if (outerNode !== undefined) {
          generator.values.set(funcOp.captureParams[i].id, outerNode);
        }
      }
    }

    // Pre-register all binding identifiers across ALL blocks of this function.
    // This ensures closures defined in earlier blocks can reference variables
    // declared in later blocks (e.g. phi variables in merge blocks).
    for (const instruction of funcOp.header) {
      if (instruction instanceof DeclareLocalOp) {
        generateDeclareLocalOp(instruction, generator);
      }
    }

    for (const block of funcOp.allBlocks()) {
      for (const instruction of block.operations) {
        if (instruction instanceof DeclareLocalOp) {
          generateDeclareLocalOp(instruction, generator);
        }
      }
    }

    generateHeader(funcOp, generator);
    const params = generateFunctionParams(funcOp, generator);

    const statements = generateBlock(funcOp.entryBlockId, funcOp, generator);
    return { params, statements };
  });
}

function generateFunctionParams(
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Identifier | t.RestElement | t.Pattern> {
  return funcOp.paramPatterns.map((param) => {
    const node = generateDestructureTarget(param, generator);
    if (!(t.isIdentifier(node) || t.isPattern(node) || t.isRestElement(node))) {
      throw new Error(`Unsupported function param: ${node.type}`);
    }
    return node;
  });
}

function generateHeader(funcOp: FuncOp, generator: CodeGenerator) {
  for (const instruction of funcOp.header) {
    generateOp(instruction, funcOp, generator);
  }
}
