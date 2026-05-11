import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { DeclarationId, FunctionIR, Operation, Value } from "../core";
import { BasicBlock } from "../core/Block";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { ModuleIR } from "../core/ModuleIR";
import { OperationCloneContext } from "../core/OperationCloneContext";
import { sameValueList } from "../core/TerminatorOp";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { ArgumentListElement } from "../ops/calls/ArgumentListElement";
import { CallOp } from "../ops/calls/CallOp";
import { CreateClassOp } from "../ops/classes/CreateClassOp";
import { ReturnTerminatorOp } from "../ops/control/ReturnTerminatorOp";
import { CreateFunctionOp } from "../ops/functions/CreateFunctionOp";
import { ObjectLiteralOp } from "../ops/objects/ObjectLiteralOp";
import { DeleteOp } from "../ops/operators/DeleteOp";
import { ModulePass, PassResult } from "./Pass";

export interface FunctionInliningPassOptions {
  /**
   * Allocator used for cloned operations and cloned SSA result values.
   *
   * The pass inserts copies of callee operations into caller functions, so every
   * cloned operation and result must receive a fresh id from the compilation-wide
   * allocator.
   */
  readonly ids: IRIdAllocator;
}

/**
 * Creates a module pass that inlines statically-known local function calls.
 *
 * Function inlining is module-scoped because the calle object and calle body
 * are represented by separate IR facts: a `CreateFunctionOp` in one function
 * that points at a `FunctionIR` owned by the module. The pass rewrites caller bodies
 * but needs module-wide  visibility to identify safe callees.
 *
 * V1 intentionally handles only single-block callees with simple positional
 * parameters and a direct `return`. Multi-block CFG inlining needs continuation
 * blocks and return-edge rewriting, so it belongs in a later extension.
 *
 * @example
 * ```js
 * function increment(x) {
 *   return x + 1;
 * }
 *
 * const y = increment(2)
 * ```
 * The call can be rewritten as if the callee body appeared at the call site:
 *
 * ```js
 * const y = 2 + 1;
 * ```
 */
export function createFunctionInliningPass(options: FunctionInliningPassOptions): ModulePass {
  return {
    name: "function-inlining",

    run(moduleIR: ModuleIR, analyses: AnalysisManager) {
      return new FunctionInliningPass(moduleIR, analyses, options).run();
    },
  };
}

/**
 * Fully validated single-block inline candidate.
 *
 * A plan exists only after the call target, argument list, callee shape, and
 * parameter shape have all been checked. `bodyOps` excludes the return
 * terminator because inlining replaces the call result with the returned value
 * instead of cloning a function-level return into the caller.
 *
 * @example
 * ```txt
 * // Callee
 * entry:
 *   v1 = BinaryOp("+", x, one)
 *   ReturnTerminatorOp(v1)
 *
 * // InlinePlan:
 * bodyOps = [BinaryOp("+", x, one)]
 * returnValue = v1
 */
interface InlinePlan {
  readonly callee: FunctionIR;
  readonly args: readonly Value[];
  readonly bindingSubstitutions: ReadonlyMap<DeclarationId, Value>;
  readonly returnValue: Value | null;
  readonly bodyOps: readonly Operation[];
}

const MAX_BODY_OPS = 8;

class FunctionInliningPass {
  #changed = false;

  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly analyses: AnalysisManager,
    private readonly options: FunctionInliningPassOptions,
  ) {}

  public run(): PassResult {
    for (const fn of this.moduleIR.functions) {
      if (this.inlineFunction(fn)) {
        this.analyses.invalidateFunction(fn, PreservedAnalyses.none());
        this.#changed = true;
      }
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  private inlineFunction(fn: FunctionIR): boolean {
    let changed = false;

    for (const block of fn.blocks) {
      for (const op of Array.from(block.operations)) {
        if (!(op instanceof CallOp)) continue;

        const plan = this.planInline(op);
        if (plan === null) continue;

        this.inlineCall(block, op, plan);
        changed = true;
      }
    }

    return changed;
  }

  private planInline(call: CallOp): InlinePlan | null {
    if (call.target.kind !== "value") return null;
    if (call.args.some((arg) => arg.kind === "spread")) return null;

    const create = resolveInlineTarget(call);
    if (create === null) return null;

    const callee = create.functionIR;
    if (!isSimpleInlineCandidate(callee)) return null;
    const bindingSubstitutions = simpleParameterBindingSubstitutions(callee, call.args);
    if (bindingSubstitutions === null) return null;

    const terminator = callee.entryBlock.terminator;
    if (!(terminator instanceof ReturnTerminatorOp)) return null;

    const bodyOps = callee.entryBlock.operations.filter((op) => op !== terminator);
    if (bodyOps.length > MAX_BODY_OPS) return null;
    if (!hasCloneableBodyOps(bodyOps, bindingSubstitutions)) return null;

    return {
      callee,
      args: call.args.map((arg) => arg.value),
      bindingSubstitutions,
      returnValue: terminator.value,
      bodyOps,
    };
  }

  /**
   * Clones a validated single-block callee into the caller before `call`.
   *
   * Parameter values are seeded from call arguments. Callee operation results get
   * fresh SSA values. The callee return value is then mapped to the cloned value
   * and all uses of the original call result are rewritten to that value.
   *
   * The function deliberately does not clone terminators: a function-level
   * `return` cannot appear in the middle of the caller block.
   */
  private inlineCall(block: BasicBlock, call: CallOp, plan: InlinePlan): void {
    const insertionIndex = block.operations.indexOf(call);
    if (insertionIndex === -1) {
      throw new Error(`CallOp#${call.id} is not owned by bb${block.id}`);
    }

    const values = new Map<Value, Value>();
    const ids = this.options.ids;

    for (let i = 0; i < plan.callee.params.length; i++) {
      const param = plan.callee.params[i];
      if (param.kind !== "argument" || param.target.kind !== "binding") {
        throw new Error("Inline plan contains unsupported parameter");
      }

      values.set(param.value, plan.args[i]);
    }

    const context: OperationCloneContext = {
      ids,

      value(value: Value): Value {
        const replacement = values.get(value);
        if (replacement === undefined) {
          throw new Error(`No inline value for Value#${value.id}`);
        }

        return replacement;
      },

      result(value: Value): Value {
        let replacement = values.get(value);
        if (replacement === undefined) {
          replacement = new Value(ids.valueId(), value.declarationId);
          values.set(value, replacement);
        }

        return replacement;
      },

      block() {
        throw new Error("Single-block inlining cannot clone block targets");
      },
    };

    let index = insertionIndex;
    for (const sourceOp of plan.bodyOps) {
      const substitutedValue = resolveInlineBindingLoad(sourceOp, plan.bindingSubstitutions);
      if (substitutedValue !== null) {
        values.set(sourceOp.result, substitutedValue);
        continue;
      }

      const cloned = sourceOp.clone(context);
      block.insertOp(index, cloned);
      index++;
    }

    if (plan.returnValue === null) {
      if (call.result.users.size > 0) {
        throw new Error(`Cannot inline void return into used CallOp#${call.id}`);
      }
    } else {
      replaceUses(call.result, context.value(plan.returnValue));
    }

    block.removeOp(call);
  }
}

/**
 * Returns whether the callee can be cloned directly into a caller block.
 *
 * Single-block functions are the first safe subset because all cloned
 * operations can be inserted before the call in program order. Multi-block
 * callees require splitting the caller block and redirecting return terminators
 * to a continuation block.
 */
function isSimpleInlineCandidate(fn: FunctionIR): boolean {
  if (fn.isAsync || fn.isGenerator) return false;
  if (fn.blocks.length !== 1) return false;
  return fn.entryBlock.terminator instanceof ReturnTerminatorOp;
}

/**
 * Accepts only one-to-one positional bindings.
 *
 * Destructuring, default parameters, rest parameters, and missing arguments all
 * have JavaScript parameter-initialization semantics. Those should be lowered
 * or modeled explicitly before the inliner substitutes argument values.
 *
 * @example Inlineable
 * ```js
 * function add(x, y) {
 *   return x + y;
 * }
 * ```
 *
 * @example Not inlineable in V1
 * ```js
 * function read({ x } = fallback) {
 *   return x;
 * }
 * ```
 */
function simpleParameterBindingSubstitutions(
  fn: FunctionIR,
  args: readonly ArgumentListElement[],
): ReadonlyMap<DeclarationId, Value> | null {
  const params = fn.params.filter((param) => param.kind === "argument");

  if (params.length !== fn.params.length) return null;
  if (params.length !== args.length) return null;

  const bindingSubstitutions = new Map<DeclarationId, Value>();
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (param.target.kind !== "binding") return null;
    bindingSubstitutions.set(param.target.declarationId, args[i].value);
  }

  return bindingSubstitutions;
}

function hasCloneableBodyOps(
  bodyOps: readonly Operation[],
  bindingSubstitutions: ReadonlyMap<DeclarationId, Value>,
): boolean {
  return bodyOps.every((op) => {
    if (op instanceof LoadBindingOp && op.bindingValue === null) {
      return bindingSubstitutions.has(op.declarationId);
    }

    if (createsCapturingFunction(op)) return false;
    if (op instanceof InitializeBindingOp) return false;
    if (op instanceof StoreBindingOp) return false;
    if (op instanceof DeleteOp && op.target.kind === "binding") return false;

    return true;
  });
}

function createsCapturingFunction(op: Operation): boolean {
  if (op instanceof CreateFunctionOp) {
    return op.captures.length > 0 || hasCaptureParams(op.functionIR);
  }

  if (op instanceof ObjectLiteralOp) {
    return op.properties.some((property) => {
      if (property.kind !== "method" && property.kind !== "accessor") return false;
      return hasCaptureParams(property.functionIR);
    });
  }

  if (op instanceof CreateClassOp) {
    return op.elements.some((element) => {
      if (element.kind === "method") return hasCaptureParams(element.functionIR);
      return element.initializer !== null && hasCaptureParams(element.initializer);
    });
  }

  return false;
}

function hasCaptureParams(fn: FunctionIR): boolean {
  return fn.params.some((param) => param.kind === "capture");
}

/**
 * Resolves a callee binding read that should be replaced by a caller value.
 *
 * Single-block V1 inlining substitutes simple parameter bindings with call
 * arguments. If the callee body still contains an unresolved load of that
 * parameter declaration, cloning the load would emit a read of the callee-local
 * name in the caller. Instead, the load result is mapped to the substituted
 * caller value and no operation is cloned.
 */
function resolveInlineBindingLoad(
  op: Operation,
  bindingSubstitutions: ReadonlyMap<DeclarationId, Value>,
): Value | null {
  if (!(op instanceof LoadBindingOp)) return null;
  if (op.bindingValue !== null) return null;

  return bindingSubstitutions.get(op.declarationId) ?? null;
}

/**
 * Resolves calls whose callee is probably a local function object.
 *
 * The inliner only trusts function objects created in the current IR graph.
 * Unknown globals, property calls, aliases, and dynamically reassigned bindings
 * are rejected because JavaScript call identity could differ at runtime.
 *
 * @example Direct function value
 * ```txt
 * v0 = CreateFunctionOp(Function#1)
 * v1 = CallOp(v0)
 * ```
 *
 * @example Declaration call after SSA construction
 * ```txt
 * v0 = CreateFunctionOp(Function#1)
 * x0 = InitializeBindingOp(fn, v0)
 * v1 = LoadBindingOp(fn, bindingValue = x0)
 * v2 = CallOp(v1)
 * ```
 */
function resolveInlineTarget(call: CallOp): CreateFunctionOp | null {
  if (call.target.kind !== "value") return null;

  const callee = call.target.callee;
  const directDefiner = callee.definer;
  if (directDefiner instanceof CreateFunctionOp) return directDefiner;

  if (!(directDefiner instanceof LoadBindingOp)) return null;
  if (directDefiner.bindingValue === null) return null;

  const bindingDefiner = directDefiner.bindingValue.definer;
  if (!(bindingDefiner instanceof InitializeBindingOp)) return null;

  const functionDefiner = bindingDefiner.value.definer;
  return functionDefiner instanceof CreateFunctionOp ? functionDefiner : null;
}

/**
 * Rewrites operation users of one SSA value to another.
 *
 * This is a local helper for V1 inlining. It intentionally rejects
 * function-level users because rewriting captures or parameter-pattern operands
 * needs a function-boundary-aware API.
 */
function replaceUses(from: Value, to: Value): void {
  for (const user of [...from.users]) {
    if (user instanceof FunctionIR) {
      throw new Error(`Function-level value replacement is not supported for Value#${from.id}`);
    }

    const operands = user.operands();
    const rewritten = operands.map((operand) => (operand === from ? to : operand));

    if (sameValueList(operands, rewritten)) continue;

    const owner = user.ownerBlock;
    if (owner === null) {
      throw new Error(`${user.constructor.name}#${user.id} is detached`);
    }

    owner.replaceOp(user, user.withOperands(rewritten));
  }
}
