import { StoreLocalOp } from "../../ir";
import type { DeclarationId, Value } from "../../ir/core/Value";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { ModuleIR } from "../../ir/core/ModuleIR";
import { ArrayDestructureOp } from "../../ir/ops/pattern/ArrayDestructure";
import { ObjectDestructureOp } from "../../ir/ops/pattern/ObjectDestructure";
import { ExportSpecifierOp } from "../../ir/ops/module/ExportSpecifier";
import { ExportDefaultDeclarationOp } from "../../ir/ops/module/ExportDefaultDeclaration";

/**
 * Reasons a declaration cannot be promoted to SSA. Exposed for
 * diagnostics — pass `why(decl)` to a debug printer to explain why
 * reads didn't forward.
 */
export enum NonPromotableReason {
  Context = "context",
  Captured = "captured",
  Exported = "exported",
  ComplexWriter = "complex-writer",
  DestructureAssignmentTarget = "destructure-assignment-target",
}

/**
 * Static analysis of which source-level bindings can be promoted to
 * SSA form during `SSABuilder` rename. A declaration is promotable iff
 * all of the following hold:
 *
 *  1. Not captured by any nested function (rewriting to specific
 *     Values would embed stale values in the closure's capture list).
 *  2. Not a module-level context binding (closures/exports observe
 *     the cell; ECMA-262 §9.1 Environment Records).
 *  3. Not referenced by an `ExportSpecifierOp` /
 *     `ExportDefaultDeclarationOp` — exports are live bindings
 *     (ECMA-262 §16.2.1.7).
 *  4. Every writer is a simple `StoreLocalOp` (not destructure
 *     assignment / for-of iter target / try/catch handler param /
 *     other multi-def ops — those can't be SSA-named without
 *     multi-result IR infrastructure).
 *  5. No `StoreLocalOp` writer lives inside a structured op that
 *     lacks iter-arg lowering (switch/try/block) — those ops use
 *     snapshot/restore rename, which would lose the post-op value.
 *
 * Crucially, RHS purity is NOT considered here. Ordering of
 * side-effectful expressions is a materialization concern
 * (`ValueMaterializationPass`), not a promotion concern. A
 * `const x = arr[i]` with a subsequent mutation of `i` is perfectly
 * promotable — the read still evaluates at its IR position, and VMP
 * spills a named temp if inlining would reorder observable effects.
 *
 * References:
 * - Cytron et al. 1991, "Efficiently Computing Static Single
 *   Assignment Form and the Control Dependence Graph".
 * - LLVM `isAllocaPromotable` in PromoteMemoryToRegister.cpp.
 */
export class PromotabilityAnalysis {
  private readonly nonPromotable = new Map<DeclarationId, NonPromotableReason>();

  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {
    this.compute();
  }

  /** True iff mem2reg may promote this declaration. */
  isPromotable(declId: DeclarationId): boolean {
    return !this.nonPromotable.has(declId);
  }

  /** Why a decl is non-promotable, or undefined if it is. */
  reason(declId: DeclarationId): NonPromotableReason | undefined {
    return this.nonPromotable.get(declId);
  }

  private mark(declId: DeclarationId, reason: NonPromotableReason): void {
    if (!this.nonPromotable.has(declId)) this.nonPromotable.set(declId, reason);
  }

  private compute(): void {
    // Rule 1: captured by nested function.
    for (const block of this.funcOp.allBlocks()) {
      for (const op of block.getAllOps()) {
        const captures = (op as { captures?: readonly Value[] }).captures;
        if (captures === undefined) continue;
        for (const c of captures) this.mark(c.declarationId, NonPromotableReason.Captured);
      }
    }

    // Rule 2: context (captured-mutable, module-level live binding).
    for (const decl of this.moduleIR.environment.contextDeclarationIds) {
      this.mark(decl, NonPromotableReason.Context);
    }

    // Rule 3: referenced by an export specifier / default declaration.
    for (const block of this.funcOp.allBlocks()) {
      for (const op of block.getAllOps()) {
        if (op instanceof ExportSpecifierOp) {
          const d = op.localPlace.declarationId;
          if (d !== undefined) this.mark(d, NonPromotableReason.Exported);
        } else if (op instanceof ExportDefaultDeclarationOp) {
          const d = op.declaration.declarationId;
          if (d !== undefined) this.mark(d, NonPromotableReason.Exported);
        }
      }
    }

    // Rule 4: non-StoreLocal multi-def ops — destructure targets and
    // any other multi-result op — always mark their defs as
    // non-promotable.
    for (const block of this.funcOp.allBlocks()) {
      for (const op of block.operations) {
        if (op instanceof StoreLocalOp) {
          continue;
        }
        if (op instanceof ArrayDestructureOp || op instanceof ObjectDestructureOp) {
          // Assignment-kind destructure requires pre-existing named
          // bindings — targets must stay declared. Declaration-kind
          // carries its own `let` / `const`; codegen emits the
          // declaration inline, so targets are effectively
          // single-assignment and promotable.
          if (op.kind !== "assignment") continue;
          for (const def of op.getDefs()) {
            if (def === op.place || def.declarationId === undefined) continue;
            this.mark(def.declarationId, NonPromotableReason.DestructureAssignmentTarget);
          }
          continue;
        }
        for (const def of op.getDefs()) {
          if (def === op.place || def.declarationId === undefined) continue;
          this.mark(def.declarationId, NonPromotableReason.ComplexWriter);
        }
      }
    }
  }
}
