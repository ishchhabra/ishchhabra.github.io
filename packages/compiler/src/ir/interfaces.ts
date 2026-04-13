/**
 * Structural interfaces for op capability dispatch.
 *
 * These replace `instanceof` chains in passes that want to ask "is
 * this a loop?" or "is this a call?" without enumerating every
 * concrete op class. Each interface is a duck-typed TypeScript shape
 * plus a runtime predicate (`isLoopLike`, `isCallLike`, ...) that
 * narrows correctly.
 *
 * An op automatically satisfies an interface at the type level if its
 * fields line up. For runtime dispatch use the predicates below —
 * they enumerate the concrete classes that participate.
 *
 * Adding a new op that fits an existing capability just means adding
 * it to the corresponding predicate; no class-hierarchy plumbing.
 */
import type { BlockId } from "./core/Block";
import type { FunctionIR } from "./core/FunctionIR";
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
import { BranchOp } from "./ops/control/Branch";
import { JumpOp } from "./ops/control/Jump";
import { ReturnOp } from "./ops/control/Return";
import { SwitchOp } from "./ops/control/Switch";
import { ThrowOp } from "./ops/control/Throw";
import { TryOp } from "./ops/control/Try";
import { CallExpressionOp } from "./ops/call/CallExpression";
import { NewExpressionOp } from "./ops/call/NewExpression";
import { SuperCallOp } from "./ops/call/SuperCall";
import { TaggedTemplateExpressionOp } from "./ops/call/TaggedTemplateExpression";

// ---------------------------------------------------------------------
// LoopLike — any op that represents a loop construct (for/while/...)
// ---------------------------------------------------------------------

/**
 * Loop-shaped op. Exposes the loop body as a block id (for now) and
 * optionally a labeled break/continue target.
 *
 * NOTE: after the region refactor, `body` will become a `Region` and
 * this interface will shift with it.
 */
export interface LoopLike {
  readonly body: BlockId;
  readonly fallthrough: BlockId;
  readonly label?: string;
}

/** Runtime predicate matching the {@link LoopLike} interface. */
export function isLoopLike(op: unknown): op is Operation & LoopLike {
  return op instanceof ForInOp || op instanceof ForOfOp;
}

// ---------------------------------------------------------------------
// BranchLike — any op that transfers control to ≥1 successor block
// ---------------------------------------------------------------------

/**
 * Branch-shaped op. Surfaces the list of target block ids uniformly.
 * Matches terminators with non-empty `getBlockRefs()`.
 */
export interface BranchLike {
  getBlockRefs(): BlockId[];
}

/** Runtime predicate matching the {@link BranchLike} interface. */
export function isBranchLike(op: unknown): op is Operation & BranchLike {
  return (
    op instanceof BranchOp || op instanceof JumpOp || op instanceof SwitchOp || op instanceof TryOp
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
// NestedFunctionOwner — ops that own an inner FunctionIR body
// ---------------------------------------------------------------------

/**
 * Owns a nested {@link FunctionIR}. Used by capture analysis, escape
 * analysis, closure-capture rewrites, and any pass that needs to
 * recurse into inner function bodies.
 *
 * Note: `ClassMethodOp` / `ClassPropertyOp` / `ObjectMethodOp` use
 * `body` as the field name rather than `functionIR`, so the
 * interface accepts either via a wider shape and the predicate
 * enumerates both forms.
 */
export interface NestedFunctionOwner {
  /** The nested function body. */
  readonly functionIR: FunctionIR;
}

/**
 * Runtime predicate matching the {@link NestedFunctionOwner} interface.
 * Narrows to a shape guaranteed to have `functionIR` or `body`.
 */
export function isNestedFunctionOwner(
  op: unknown,
): op is Operation & { readonly functionIR: FunctionIR } {
  return (
    op instanceof FunctionExpressionOp ||
    op instanceof ArrowFunctionExpressionOp ||
    op instanceof FunctionDeclarationOp
  );
}

/**
 * Broader predicate that also matches ops whose nested function is
 * exposed as a `body` field (class methods, object methods) or as a
 * `value` field (class properties whose initializer is a thunk).
 * Returns the nested FunctionIR, or `undefined` if not a nested
 * function owner.
 */
export function getNestedFunction(op: Operation): FunctionIR | undefined {
  if (
    op instanceof FunctionExpressionOp ||
    op instanceof ArrowFunctionExpressionOp ||
    op instanceof FunctionDeclarationOp
  ) {
    return op.functionIR;
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
// RegionTerminator — ops that terminate a region (return, yield, ...)
// ---------------------------------------------------------------------

/**
 * Marker interface for ops that terminate a region — they end
 * control flow either by leaving the function (`ReturnOp`,
 * `ThrowOp`) or by yielding out of the enclosing region with a
 * value. Under MLIR conventions a region's last op must carry this
 * marker.
 *
 * Currently just the function-exit terminators; once regions are
 * first-class we'll add explicit yield ops here.
 */
export interface RegionTerminator {
  readonly kind: "return" | "throw" | "yield";
}

/** Runtime predicate — true for ops that exit the enclosing region. */
export function isRegionTerminator(op: unknown): boolean {
  return op instanceof ReturnOp || op instanceof ThrowOp;
}
