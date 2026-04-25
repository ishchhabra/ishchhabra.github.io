import * as t from "@babel/types";
import { collectDestructureTargetBindingPlaces } from "../../ir";
import { FuncOp, FunctionParam } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { CodeGenerator } from "../CodeGenerator";
import { generateBlock } from "./generateBlock";
import { generateOp } from "./ops/generateOp";
import { generateDestructureTarget } from "./ops/memory/generateDestructureTarget";

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
        const outerNode =
          generator.values.get(captures[i].id) ?? generator.getPlaceIdentifier(captures[i]);
        if (outerNode !== undefined) {
          generator.values.set(captureParams[i].value.id, outerNode);
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
  return funcOp.params
    .filter((param): param is Extract<FunctionParam, { kind: "arg" }> => param.kind === "arg")
    .map((param) => {
      for (const place of collectDestructureTargetBindingPlaces(param.source.target)) {
        generator.getPlaceIdentifier(place);
        generator.declaredDeclarations.add(place.declarationId);
      }
      for (const op of param.source.ops) {
        generateOp(op, funcOp, generator);
      }
      return generateDestructureTarget(param.source.target, generator) as
        | t.Identifier
        | t.RestElement
        | t.Pattern;
    });
}
