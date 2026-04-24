import { Environment } from "../../environment";
import {
  ArrowFunctionExpressionOp,
  ClassMethodOp,
  FunctionExpressionOp,
  LoadContextOp,
  LoadLocalOp,
  ObjectMethodOp,
  Operation,
  StoreContextOp,
  StoreLocalOp,
} from "../../ir";
import { isValueOp } from "../../ir/categories";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { TermOp } from "../../ir/core/Operation";
import { isClaimedByExportDeclaration } from "../../ir/exportClaim";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { MutabilityAnalysis, MutabilityInfo } from "../analysis/MutabilityAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

/**
 * Single-use forward substitution.
 *
 * Rewrites
 *     const t = expr
 *     use(t)
 * into
 *     use(expr)
 * when the store is a true SSA binding (const, single definition,
 * single use) and removing it preserves observable semantics.
 *
 * This is the JS analogue of GCC's `tree-ssa-forwprop` and LLVM's
 * forwarding combine: it fires only for exactly-one-use values within
 * a single block and leaves everything else to DCE and copy propagation.
 *
 * Stores are processed back-to-front so that inner single-use chains
 * collapse before outer ones, exposing new candidates within the same
 * fixpoint iteration.
 */
export class ExpressionInliningPass extends BaseOptimizationPass {
  /** Cached for the current {@link step}; refreshed on each iteration. */
  private mutability: MutabilityInfo = new MutabilityInfo(new Map());

  constructor(
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    this.mutability = this.AM.get(MutabilityAnalysis, this.funcOp);

    let changed = false;
    for (const block of this.funcOp.allBlocks()) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const store = block.operations[i];
        if (!(store instanceof StoreLocalOp)) continue;

        const user = this.findInliningCandidate(block, i, store);
        if (user === undefined) continue;

        if (!this.rewriteUser(user, this.buildRewriteMap(store))) continue;

        block.removeOpAt(i);
        changed = true;
      }
    }

    return { changed };
  }

  // --------------------------------------------------------------------
  // Candidate selection
  // --------------------------------------------------------------------

  private findInliningCandidate(
    block: BasicBlock,
    storeIndex: number,
    store: StoreLocalOp,
  ): Operation | undefined {
    if (!this.isSsaStore(store)) return undefined;

    const user = this.getSingleUser(store);
    if (user === undefined) return undefined;

    // Terminator user: only safe when the store is the last
    // non-terminator op — no gap ⇒ no intervening side effects.
    if (user instanceof TermOp) {
      return user.parentBlock === block && storeIndex === block.operations.length - 1
        ? user
        : undefined;
    }

    if (user.parentBlock !== block) return undefined;

    // Only ops that embed operands as expressions can absorb an inlined
    // expression. Declaration / module / JSX ops need a named binding.
    if (!this.isInlinableUser(user)) return undefined;

    // Function-forming ops capture by closure. Inlining would move
    // evaluation from definition time to call time, changing semantics.
    if (this.isFunctionFormingOp(user)) return undefined;

    // `const snapshot = i` where `i` is mutable must stay materialized:
    // inlining would let later mutations of `i` be seen by the read.
    if (user instanceof LoadLocalOp && this.readsMutableState(store.value)) {
      return undefined;
    }

    const userIndex = block.operations.indexOf(user);
    if (this.hasInterveningSideEffect(block, storeIndex, userIndex)) return undefined;

    return user;
  }

  private isSsaStore(store: StoreLocalOp): boolean {
    if (store.bindings.length > 0) return false;
    // Canonical "true SSA binding" query: a single store to the
    // declarationId anywhere in the function body. The IR-level
    // `type === "const"` flag is neither necessary nor sufficient —
    // reassignments can share a declarationId and frontend builders
    // may emit `type: "const"` on assignment stores.
    return this.mutability.isSingleAssignment(store.lval.declarationId);
  }

  private getSingleUser(store: StoreLocalOp): Operation | undefined {
    const uses = new Set<Operation>();
    for (const u of store.place.users) {
      if (u instanceof Operation) uses.add(u);
    }
    for (const u of store.lval.users) {
      if (u instanceof Operation) uses.add(u);
    }
    if (uses.size !== 1) return undefined;
    return uses.values().next().value;
  }

  private isInlinableUser(user: Operation): boolean {
    return isValueOp(user) || user instanceof StoreLocalOp || user instanceof LoadLocalOp;
  }

  private isFunctionFormingOp(op: Operation): boolean {
    return (
      op instanceof ArrowFunctionExpressionOp ||
      op instanceof FunctionExpressionOp ||
      op instanceof ObjectMethodOp ||
      op instanceof ClassMethodOp
    );
  }

  private readsMutableState(place: Value): boolean {
    const declarationId = place.declarationId;
    if (place.def instanceof LoadContextOp) return true;
    if (this.environment.contextDeclarationIds.has(declarationId)) return true;
    return this.mutability.getStoreCount(declarationId) > 1;
  }

  private hasInterveningSideEffect(
    block: BasicBlock,
    storeIndex: number,
    userIndex: number,
  ): boolean {
    for (let j = storeIndex + 1; j < userIndex; j++) {
      const op = block.operations[j];

      // Unclaimed StoreLocals lower to declaration statements.
      if (op instanceof StoreLocalOp && !isClaimedByExportDeclaration(op)) return true;

      // Context stores mutate captured bindings — inlining a read
      // across one risks observing the post-mutation value.
      if (op instanceof StoreContextOp) return true;

      // Zero-use value ops with side effects flush as expression statements.
      if (isValueOp(op) && op.place.users.size === 0 && op.hasSideEffects(this.environment)) {
        return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------
  // Rewriting
  // --------------------------------------------------------------------

  private buildRewriteMap(store: StoreLocalOp): Map<Value, Value> {
    return new Map<Value, Value>([
      [store.place, store.value],
      [store.lval, store.value],
    ]);
  }

  private rewriteUser(user: Operation, values: Map<Value, Value>): boolean {
    const block = user.parentBlock;
    if (block === null) return false;

    const rewritten = user.rewrite(values);
    if (rewritten === user) return false;

    block.replaceOp(user, rewritten);
    return true;
  }
}
