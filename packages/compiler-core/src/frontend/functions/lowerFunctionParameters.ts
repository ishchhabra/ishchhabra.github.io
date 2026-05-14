import type {
  ArrowFunctionExpression,
  BindingPattern,
  BindingRestElement,
  Function as OxcFunction,
} from "oxc-parser";

import type { FunctionParam } from "../../ir/core/FunctionIR";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";

/**
 * Lowers source-level function parameters.
 *
 * Parameter patterns stay in `FunctionIR.params` so codegen can emit them in
 * the function header. This preserves ECMAScript parameter-scope behavior for
 * defaults, rest parameters, and destructuring.
 */
export function lowerFunctionParameters(
  builder: FunctionIRBuilder,
  functionNode: OxcFunction | ArrowFunctionExpression,
): void {
  const captures = builder.params.filter((param) => param.kind === "capture");

  builder.setParams([
    ...functionNode.params.map((param): FunctionParam => {
      if (param.type === "TSParameterProperty") {
        throw new Error("Parameter properties are not valid JavaScript");
      }

      const value = builder.createValue();

      if (param.type === "RestElement") {
        return {
          kind: "rest",
          target: lowerParameterTarget(builder, param.argument),
          value,
        };
      }

      return {
        kind: "argument",
        target: lowerParameterTarget(builder, param),
        value,
      };
    }),
    ...captures,
  ]);
}

function lowerParameterTarget(
  builder: FunctionIRBuilder,
  param: BindingPattern | BindingRestElement,
) {
  return lowerBindingPatternTarget(builder, param);
}
