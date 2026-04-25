import * as t from "@babel/types";
import { DeclareLocalOp } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { CodeGenerator } from "../CodeGenerator";
import { generateBlock } from "./generateBlock";
import { generateOp } from "./ops/generateOp";
import { generateDestructureTarget } from "./ops/memory/generateDestructureTarget";
import { generateDeclareLocalOp } from "./ops/memory/generateDeclareLocal";

/**
 * Generates the body of a function.
 *
 * @param captures - Outer-scope Places this function captures, aligned
 *   by index with the function's capture params. When present, each
 *   capture param is bound to `captures[i]`'s generated node so
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
    const captureParams = funcOp.params.filter((param) => param.kind === "capture");
    for (let i = 0; i < captureParams.length; i++) {
      if (i < captures.length) {
        const outerNode = generator.values.get(captures[i].id);
        if (outerNode !== undefined) {
          generator.values.set(captureParams[i].value.id, outerNode);
        }
      }
    }

    // Pre-register all binding identifiers across ALL blocks of this function.
    // This ensures closures defined in earlier blocks can reference variables
    // declared in later blocks (e.g. phi variables in merge blocks).
    for (const block of funcOp.blocks) {
      for (const instruction of block.operations) {
        if (instruction instanceof DeclareLocalOp) {
          generateDeclareLocalOp(instruction, generator);
        }
      }
    }

    const params = generateFunctionParams(funcOp, generator);

    const statements = generateBlock(funcOp.entryBlock.id, funcOp, generator);
    return { params, statements };
  });
}

function generateFunctionParams(
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Identifier | t.RestElement | t.Pattern> {
  return funcOp.params.filter((param) => param.kind === "arg").map((param) => {
    if (param.kind === "arg") {
      for (const op of param.source.ops) {
        generateOp(op, funcOp, generator);
      }
      return generateDestructureTarget(param.source.target, generator) as
        | t.Identifier
        | t.RestElement
        | t.Pattern;
    }
    return generator.getPlaceIdentifier(param.value);
  });
}
