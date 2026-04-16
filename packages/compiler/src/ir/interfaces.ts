/**
 * Structural interfaces for op capability dispatch.
 *
 * These replace `instanceof` chains in passes that want to ask "is
 * this a loop?" or "is this a call?" without enumerating every
 * concrete op class. Each interface is a duck-typed TypeScript shape
 * plus a runtime predicate (`isLoopLike`, `isCallLike`, ...) that
 * narrows correctly.
 */
import type { FuncOp } from "./core/FuncOp";
import type { Operation } from "./core/Operation";
import type { Place } from "./core/Place";
import { ArrowFunctionExpressionOp } from "./ops/func/ArrowFunctionExpression";
import { FunctionDeclarationOp } from "./ops/func/FunctionDeclaration";
import { FunctionExpressionOp } from "./ops/func/FunctionExpression";
import { ClassMethodOp } from "./ops/class/ClassMethod";
import { ClassPropertyOp } from "./ops/class/ClassProperty";
import { ObjectMethodOp } from "./ops/object/ObjectMethod";
import { ForInOp } from "./ops/control/ForIn";
import { ForOfOp } from "./ops/control/ForOf";
import { ForOp } from "./ops/control/For";
import { WhileOp } from "./ops/control/While";
import { ReturnOp } from "./ops/control/Return";
import { ThrowOp } from "./ops/control/Throw";
import { YieldOp } from "./ops/control/Yield";
import { CallExpressionOp } from "./ops/call/CallExpression";
import { NewExpressionOp } from "./ops/call/NewExpression";
import { SuperCallOp } from "./ops/call/SuperCall";
import { TaggedTemplateExpressionOp } from "./ops/call/TaggedTemplateExpression";

// ---------------------------------------------------------------------
// LoopLike — any op that represents a loop construct
// ---------------------------------------------------------------------

/**
 * Loop-shaped op. All structured loop ops in the IR expose this
 * shape uniformly.
 */
export interface LoopLike {
  readonly label?: string;
}

/** Runtime predicate matching the {@link LoopLike} interface. */
export function isLoopLike(op: unknown): op is Operation & LoopLike {
  return (
    op instanceof ForInOp || op instanceof ForOfOp || op instanceof ForOp || op instanceof WhileOp
  );
}

// ---------------------------------------------------------------------
// CallLike — any op that invokes a callable with an argument list
// ---------------------------------------------------------------------

/**
 * Call-shaped op. Exposes a callee place and an argument list.
 * Covers normal calls, `new`, tagged templates, and super calls.
 */
export interface CallLike {
  readonly callee?: Place;
  readonly args: readonly Place[];
}

/** Runtime predicate matching the {@link CallLike} interface. */
export function isCallLike(op: unknown): op is Operation & CallLike {
  return (
    op instanceof CallExpressionOp ||
    op instanceof NewExpressionOp ||
    op instanceof SuperCallOp ||
    op instanceof TaggedTemplateExpressionOp
  );
}

// ---------------------------------------------------------------------
// NestedFunctionOwner — ops that own an inner FuncOp body
// ---------------------------------------------------------------------

export interface NestedFunctionOwner {
  readonly funcOp: FuncOp;
}

export function isNestedFunctionOwner(op: unknown): op is Operation & { readonly funcOp: FuncOp } {
  return (
    op instanceof FunctionExpressionOp ||
    op instanceof ArrowFunctionExpressionOp ||
    op instanceof FunctionDeclarationOp
  );
}

export function getNestedFunction(op: Operation): FuncOp | undefined {
  if (
    op instanceof FunctionExpressionOp ||
    op instanceof ArrowFunctionExpressionOp ||
    op instanceof FunctionDeclarationOp
  ) {
    return op.funcOp;
  }
  if (op instanceof ClassMethodOp || op instanceof ObjectMethodOp) {
    return op.body;
  }
  if (op instanceof ClassPropertyOp) {
    return op.value ?? undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------
// RegionTerminator — ops that terminate a region
// ---------------------------------------------------------------------

/**
 * Marker interface for ops that terminate a region. Every block in a
 * region must end in one of these. Normal region completion is
 * `YieldOp`; function exit is `ReturnOp` / `ThrowOp`; structural exit
 * from an enclosing loop / labeled block is handled by the dedicated
 * `BreakOp` / `ContinueOp` terminators.
 */
export function isRegionTerminator(op: unknown): boolean {
  return op instanceof ReturnOp || op instanceof ThrowOp || op instanceof YieldOp;
}
