import { AnalysisManager, BindingPromotionAnalysis, PreservedAnalyses } from "../analysis";
import { Operation } from "../core";
import { bindingPatternOperands, rewriteBindingPatternOperands } from "../core/DestructurePattern";
import { FunctionIR, FunctionParam } from "../core/FunctionIR";
import { DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { FunctionPass, PassResult } from "./Pass";

/**
 * Creates a pass that erases promotable JavaScript binding storage after SSA construction.
 *
 * SSA construction resolves each `LoadBindingOp` to the reaching binding SSA value.
 * This pass then removes eligible binding memory operations entirely:
 *
 * - `LoadBindingOp(x)` becomes direct use of the resolved reaching value.
 * - `InitializeBindingOp(x, value)` becomes direct use of `value`.
 * - `StoreBindingOp(x, value)` becomes direct use of `value`.
 */
export function createBindingPromotionPass(): FunctionPass {
  return {
    name: "binding-promotion",

    run(fn: FunctionIR, analyses: AnalysisManager): PassResult {
      const promotion = analyses.getFunction(BindingPromotionAnalysis, fn);
      return new BindingPromotionPass(fn, promotion.promotableDeclarations).run();
    },
  };
}

class BindingPromotionPass {
  readonly #replacements: Map<Value, Value> = new Map();
  readonly #operations: Set<Operation> = new Set();

  constructor(
    private readonly fn: FunctionIR,
    private readonly promotableDeclarations: ReadonlySet<DeclarationId>,
  ) {}

  public run(): PassResult {
    this.plan();

    if (this.#operations.size === 0) {
      return { changed: false };
    }

    this.flattenReplacements();
    this.removePromotedOperations();
    this.rewriteRemainingOperations();
    this.rewriteFunctionOperands();

    return { changed: true, preserved: PreservedAnalyses.none() };
  }

  /**
   * Computes all binding-operation removals and value rewrites before mutating IR.
   *
   * Planning first keeps promotion independent of operation-removal order: every
   * replacement edge is known before block operation arrays and def-use lists are
   * updated.
   */
  private plan(): void {
    for (const block of this.fn.blocks) {
      for (const op of block.operations) {
        if (op instanceof LoadBindingOp && this.promotableDeclarations.has(op.declarationId)) {
          this.planLoad(op);
          continue;
        }

        if (
          (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) &&
          this.promotableDeclarations.has(op.declarationId)
        ) {
          this.planWrite(op);
        }
      }
    }
  }

  private planLoad(op: LoadBindingOp): void {
    if (op.bindingValue === null) {
      throw new Error(
        `Cannot promote Declaration#${op.declarationId}: LoadBindingOp#${op.id} is not SSA-resolved`,
      );
    }

    this.#replacements.set(op.result, op.bindingValue);
    this.#operations.add(op);
  }

  private planWrite(op: InitializeBindingOp | StoreBindingOp): void {
    this.#replacements.set(op.bindingValue, op.value);
    this.#operations.add(op);
  }

  /**
   * Collapses replacement chains before any users are rewritten.
   *
   * Example:
   * `loadResult -> bindingValue -> runtimeValue` becomes
   * `loadResult -> runtimeValue`.
   */
  private flattenReplacements(): void {
    for (const from of this.#replacements.keys()) {
      this.#replacements.set(from, this.resolveReplacement(from));
    }
  }

  private removePromotedOperations(): void {
    for (const block of this.fn.blocks) {
      for (const op of Array.from(block.operations)) {
        if (this.#operations.has(op)) {
          block.removeOp(op);
        }
      }
    }
  }

  private rewriteRemainingOperations(): void {
    for (const block of this.fn.blocks) {
      for (const op of Array.from(block.operations)) {
        const operands = op.operands();
        const rewritten = operands.map((value) => this.resolveReplacement(value));

        if (sameValues(operands, rewritten)) {
          continue;
        }

        block.replaceOp(op, op.withOperands(rewritten));
      }
    }
  }

  private rewriteFunctionOperands(): void {
    let changed = false;

    const params = this.fn.params.map((param): FunctionParam => {
      if (param.kind === "capture") return param;

      const operands = bindingPatternOperands(param.target);
      const rewritten = operands.map((value) => this.resolveReplacement(value));
      if (sameValues(operands, rewritten)) return param;

      changed = true;
      return {
        ...param,
        target: rewriteBindingPatternOperands(param.target, rewritten),
      };
    });

    if (changed) {
      this.fn.setParams(params);
    }
  }

  private resolveReplacement(value: Value): Value {
    let current = value;
    const seen = new Set<Value>();

    while (this.#replacements.has(current)) {
      if (seen.has(current)) {
        throw new Error(`Binding promotion replacement cycle at Value#${current.id}`);
      }

      seen.add(current);
      current = this.#replacements.get(current)!;
    }

    return current;
  }
}

function sameValues(left: readonly Value[], right: readonly Value[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
