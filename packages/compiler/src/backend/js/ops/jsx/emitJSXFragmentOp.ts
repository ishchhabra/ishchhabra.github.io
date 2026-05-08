import type { JSXFragmentOp } from "../../../../ir/ops/jsx/JSXFragmentOp";
import { expressionStatement, jsxFragment, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitJSXChild } from "./emitJSXElementOp";

export function emitJSXFragmentOp(context: CodegenContext, op: JSXFragmentOp): ESTreeStatement[] {
  const expression = jsxFragment(op.children.map((child) => emitJSXChild(context, child)));

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
