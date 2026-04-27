import {
  BindingDeclOp,
  BindingInitOp,
  CallExpressionOp,
  LiteralOp,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  MetaPropertyOp,
  NewExpressionOp,
  Operation,
  RegExpLiteralOp,
  StoreLocalOp,
  ThisExpressionOp,
  TryTermOp,
} from "../../ir";
import type { BasicBlock } from "../../ir/core/Block";
import { JSXMemberExpressionOp } from "../../ir/ops/jsx/JSXMemberExpression";
import { JSXOpeningElementOp } from "../../ir/ops/jsx/JSXOpeningElement";
import { JSXClosingElementOp } from "../../ir/ops/jsx/JSXClosingElement";
import { JSXIdentifierOp } from "../../ir/ops/jsx/JSXIdentifier";
import { JSXNamespacedNameOp } from "../../ir/ops/jsx/JSXNamespacedName";
import { FunctionDeclarationOp } from "../../ir/ops/func/FunctionDeclaration";
import { ClassDeclarationOp } from "../../ir/ops/class/ClassDeclaration";
import { ObjectPropertyOp } from "../../ir/ops/object/ObjectProperty";
import { ObjectMethodOp } from "../../ir/ops/object/ObjectMethod";
import { ClassMethodOp } from "../../ir/ops/class/ClassMethod";
import { ClassPropertyOp } from "../../ir/ops/class/ClassProperty";
import { SpreadElementOp } from "../../ir/ops/prim/SpreadElement";
import { HoleOp } from "../../ir/ops/prim/Hole";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { isDCERemovable } from "../../ir/effects/predicates";
import type { PassResult } from "../PassManager";

type MaterializationDecision =
  | { readonly kind: "none" }
  | { readonly kind: "const-binding" }
  | { readonly kind: "hoisted-let-binding" };

/**
 * Value Materialization: decide which SSA Values need a named binding
 * for codegen. Most spills become `const $tmp = expr`; values defined
 * inside a protected region and consumed outside become
 * `let $tmp; ... $tmp = expr` so evaluation still happens in-region.
 *
 * Pipeline position: runs once after the late optimizer, before
 * codegen. The optimizer produces a pure SSA Value graph; codegen
 * needs variable names. This pass is the bridge.
 *
 * ## Decision rules (in order)
 *
 * For each op producing a Value `v` used by one or more operations:
 *
 *   A. **Already named** — `v`'s definer is a `StoreLocalOp` or a
 *      non-Expression-producing op (ObjectProperty, SpreadElement,
 *      JSX tag nodes, etc.). Skip.
 *
 *   B. **Trivially duplicable** — `v`'s definer emits a single token
 *      (literal, identifier, `this`, `import.meta`). Safe to share
 *      the AST node across uses. Skip.
 *
 *   C. **Multi-use** — `v` has 2+ users. Duplicating the expression
 *      at each would re-evaluate side effects and inflate code.
 *      Spill.
 *
 *   D. **Identifier-required operand** — the sole user requires an
 *      identifier in this operand slot (JSX tag position). If the
 *      definer would emit a non-identifier expression
 *      (ObjectExpression, Call, etc.), spill.
 *
 *   E. **Order-sensitive with intervening effect** — the definer has
 *      observable side effects AND moving its evaluation to the use
 *      site would cross a call / store / update / delete. Spill to
 *      pin evaluation at the definer's position.
 *
 * No other cases spill. Pure-expression single-use (BinaryExpression
 * + args, ArrowFunction captures, etc.) inline naturally at codegen
 * and are the cheapest representation.
 *
 * ## Why this belongs here, not in `SSABuilder` or `EIP`
 *
 * SSABuilder promotes memory-form bindings to pure SSA unconditionally.
 * After that, every SSA Value is a candidate for inlining at codegen;
 * "when to name" is purely a syntactic/ordering decision, not an
 * analysis of what can be promoted. ExpressionInliningPass does the
 * symmetric rewrite (forward-substitute a single-use StoreLocal into
 * its user) without ordering analysis — it relies on VMP to spill
 * anything that later becomes unsafe to inline.
 */
export class ValueMaterializationPass {
  private protectedRegionCache: readonly Set<BasicBlock>[] | undefined;

  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public run(): PassResult {
    let changed = false;
    for (const block of this.funcOp.blocks) {
      for (let i = 0; i < block.operations.length; ) {
        const op = block.operations[i];
        const decision = this.decideMaterialization(op);
        switch (decision.kind) {
          case "none":
            i++;
            break;
          case "const-binding":
            i = this.insertConstBinding(block, i, op);
            changed = true;
            break;
          case "hoisted-let-binding":
            i = this.insertHoistedLetBinding(block, i, op);
            changed = true;
            break;
        }
      }
    }
    return { changed };
  }

  // ---------------------------------------------------------------
  // Decision
  // ---------------------------------------------------------------

  private decideMaterialization(op: Operation): MaterializationDecision {
    if (!this.canMaterialize(op)) return { kind: "none" };

    if (!this.needsMaterializedName(op)) {
      return { kind: "none" };
    }

    if (this.materializedNameEscapesProtectedRegion(op)) {
      return { kind: "hoisted-let-binding" };
    }

    return { kind: "const-binding" };
  }

  private canMaterialize(op: Operation): boolean {
    if (op.place === undefined) return false;
    if (op instanceof BindingDeclOp || op instanceof BindingInitOp || op instanceof StoreLocalOp) {
      return false;
    }
    return !emitsNonExpression(op);
  }

  private needsMaterializedName(op: Operation): boolean {
    const place = op.place;
    if (place === undefined) return false;
    if (this.isTriviallyDuplicable(op)) return false;

    const useCount = place.users.size;
    if (useCount === 0) return false; // DCE leftover or standalone-emitted

    const singleUser = useCount === 1 ? (place.users.values().next().value as Operation) : undefined;

    // Spilling `obj.m` into `const t = obj.m; t(args)` detaches the
    // JS receiver. Keep property reads inline when they are a call's
    // callee so codegen can emit `obj.m(args)`.
    if (singleUser !== undefined && isMethodCalleeOf(singleUser, place) && isPropertyRead(op)) {
      return false;
    }

    if (useCount > 1) return true;

    const user = singleUser!;
    if (requiresIdentifierOperand(user, place)) return true;

    return this.isOrderSensitive(op) && this.inliningWouldReorder(op, user);
  }

  // ---------------------------------------------------------------
  // Predicates
  // ---------------------------------------------------------------

  /** Emits a single token; safe to duplicate at every use site. */
  private isTriviallyDuplicable(op: Operation): boolean {
    if (
      op instanceof LiteralOp ||
      op instanceof LoadGlobalOp ||
      op instanceof LoadContextOp ||
      op instanceof ThisExpressionOp ||
      op instanceof MetaPropertyOp ||
      op instanceof RegExpLiteralOp
    ) {
      return true;
    }
    if (op instanceof LoadLocalOp) {
      // Every LoadLocal that survived mem2reg reads a memory-form
      // binding (captured, exported, destructure target, iter var,
      // catch param) — all of which codegen emits as a named
      // identifier. Safe to duplicate at every use site.
      return true;
    }
    return false;
  }

  /**
   * An op is order-sensitive if moving its evaluation past an
   * intervening effectful op would change observable behavior.
   * Equivalent to "this op is not safely deletable in isolation":
   * it writes memory, may throw, or is externally observable.
   * Property reads qualify via `mayThrow=true` (the getter hazard
   * called out in `packages/compiler/CLAUDE.md`).
   */
  private isOrderSensitive(op: Operation): boolean {
    return !isDCERemovable(op, this.moduleIR.environment);
  }

  /**
   * True iff inlining `definer` into `user` would move `definer`'s
   * evaluation past an **observable standalone** effect.
   *
   * An intervening op is a hazard only if it will be emitted as its
   * own statement — e.g. a store, or a discarded call. Ops that are
   * operands of `user` (directly or transitively) will inline into
   * `user`'s expression at codegen, so they evaluate in operand
   * order alongside `definer`; no reorder.
   *
   * Cross-protected-region uses must spill. Leaving an
   * order-sensitive definer inline lets codegen emit it at the use
   * block, which can move a throw/call/getter out of a `try`.
   */
  private inliningWouldReorder(definer: Operation, user: Operation): boolean {
    const block = definer.parentBlock;
    if (block === null) return false;
    if (user.parentBlock !== block) return this.crossesProtectedRegion(block, user.parentBlock);
    const defIndex = block.operations.indexOf(definer);
    const userIndex = block.operations.indexOf(user);
    if (defIndex < 0 || userIndex < 0) return false;
    for (let i = defIndex + 1; i < userIndex; i++) {
      const op = block.operations[i];
      if (!isReorderingHazard(op)) continue;
      // Will this hazard inline into `user`? If yes, it's an operand
      // evaluated during `user`'s expression eval — no reorder
      // relative to `definer`. If no, it's a standalone statement
      // that runs before `user` — reorder risk.
      if (!flowsTo(op, user)) return true;
    }
    return false;
  }

  private materializedNameEscapesProtectedRegion(op: Operation): boolean {
    const place = op.place;
    const block = op.parentBlock;
    if (place === undefined || block === null) return false;
    for (const user of place.users) {
      if (this.crossesProtectedRegion(block, user.parentBlock)) return true;
    }
    return false;
  }

  private crossesProtectedRegion(defBlock: BasicBlock, useBlock: BasicBlock | null): boolean {
    if (useBlock === null) return false;
    for (const region of this.protectedRegions()) {
      if (region.has(defBlock) && !region.has(useBlock)) return true;
    }
    return false;
  }

  private protectedRegions(): readonly Set<BasicBlock>[] {
    if (this.protectedRegionCache !== undefined) return this.protectedRegionCache;

    const regions: Set<BasicBlock>[] = [];
    for (const block of this.funcOp.blocks) {
      const terminal = block.terminal;
      if (terminal instanceof TryTermOp) {
        regions.push(this.collectTryProtectedRegion(terminal));
      }
    }
    this.protectedRegionCache = regions;
    return regions;
  }

  private collectTryProtectedRegion(term: TryTermOp): Set<BasicBlock> {
    const region = new Set<BasicBlock>();
    const stack = [term.bodyBlock, term.handlerBlock, term.finallyBlock].filter(
      (block): block is BasicBlock => block !== null,
    );

    while (stack.length > 0) {
      const block = stack.pop()!;
      if (block === term.fallthroughBlock || region.has(block)) continue;
      region.add(block);

      const terminal = block.terminal;
      if (terminal === undefined) continue;
      for (let index = 0; index < terminal.targetCount(); index++) {
        stack.push(terminal.target(index).block);
      }
    }

    return region;
  }

  // ---------------------------------------------------------------
  // Rewriting
  // ---------------------------------------------------------------

  private insertConstBinding(block: BasicBlock, opIndex: number, op: Operation): number {
    const env = this.moduleIR.environment;
    const lval = env.createValue();
    const init = env.createOperation(BindingInitOp, lval, "const", op.place!);

    block.insertOpAt(opIndex + 1, init);
    this.rewriteUses(op, lval, init);
    return opIndex + 2;
  }

  private insertHoistedLetBinding(block: BasicBlock, opIndex: number, op: Operation): number {
    const env = this.moduleIR.environment;
    const lval = env.createValue();
    const decl = env.createOperation(BindingDeclOp, lval, "let");
    const storePlace = env.createValue(lval.declarationId);
    const store = env.createOperation(StoreLocalOp, storePlace, lval, op.place!);

    const declarationBlock = this.funcOp.entryBlock;
    const declarationIndex = this.hoistedDeclarationIndex(declarationBlock);
    declarationBlock.insertOpAt(declarationIndex, decl);

    const adjustedOpIndex =
      declarationBlock === block && declarationIndex <= opIndex ? opIndex + 1 : opIndex;
    block.insertOpAt(adjustedOpIndex + 1, store);
    this.rewriteUses(op, lval, store);
    return adjustedOpIndex + 2;
  }

  private hoistedDeclarationIndex(block: BasicBlock): number {
    const index = block.operations.findIndex((op) => !(op instanceof BindingDeclOp));
    return index < 0 ? block.operations.length : index;
  }

  private rewriteUses(op: Operation, newPlace: Value, spillOp: Operation): void {
    const oldPlace = op.place!;
    const map = new Map<Value, Value>([[oldPlace, newPlace]]);
    for (const block of this.funcOp.blocks) {
      for (const inner of block.getAllOps()) {
        if (inner === spillOp) continue;
        const rewritten = inner.rewrite(map);
        if (rewritten !== inner) block.replaceOp(inner, rewritten);
      }
    }
  }
}

// -----------------------------------------------------------------
// Free helpers
// -----------------------------------------------------------------

/**
 * Ops whose codegen output is not a JavaScript Expression — they
 * appear only in syntactically-specific positions (object property
 * lists, class bodies, JSX children, spread args). Spilling them
 * into `const X = expr;` would emit a non-Expression into the
 * VariableDeclarator init slot.
 */
function emitsNonExpression(op: Operation): boolean {
  return (
    op instanceof ObjectPropertyOp ||
    op instanceof ObjectMethodOp ||
    op instanceof ClassMethodOp ||
    op instanceof ClassPropertyOp ||
    op instanceof SpreadElementOp ||
    op instanceof HoleOp ||
    emitsJSXNamedNode(op)
  );
}

/**
 * JSX tag-name nodes + named declarations. Their output isn't an
 * Expression in AST terms; codegen has dedicated paths for them.
 */
function emitsJSXNamedNode(op: Operation): boolean {
  return (
    op instanceof JSXIdentifierOp ||
    op instanceof JSXMemberExpressionOp ||
    op instanceof JSXNamespacedNameOp ||
    op instanceof FunctionDeclarationOp ||
    op instanceof ClassDeclarationOp
  );
}

/**
 * Positions whose codegen requires an identifier-shaped operand
 * rather than an arbitrary Expression (JSX tag names).
 */
function requiresIdentifierOperand(user: Operation, operand: Value): boolean {
  if (user instanceof JSXIdentifierOp) return user.value === operand;
  if (user instanceof JSXMemberExpressionOp) return user.object === operand;
  if (user instanceof JSXOpeningElementOp) return user.tagPlace === operand;
  if (user instanceof JSXClosingElementOp) return user.tagPlace === operand;
  return false;
}

/**
 * True iff `op`'s output flows into `target` — i.e. `op.place` is
 * used (directly or transitively) as an operand of `target`. If so,
 * `op` will codegen-inline into `target`'s expression rather than as
 * a standalone statement.
 */
function flowsTo(op: Operation, target: Operation): boolean {
  const place = op.place;
  if (place === undefined) return false;
  // BFS over `target`'s operand tree.
  const seen = new Set<Operation>();
  const stack: Operation[] = [target];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const operand of cur.operands()) {
      if (operand === place) return true;
      const def = operand.def;
      if (def instanceof Operation) stack.push(def);
    }
  }
  return false;
}

/**
 * `op` is a property read — `obj.prop` or `obj[prop]`. Used by the
 * method-callee preservation rule: spilling one of these when it
 * flows as the callee of a call expression breaks JS's `this`
 * binding semantics.
 */
function isPropertyRead(op: Operation): boolean {
  return op instanceof LoadStaticPropertyOp || op instanceof LoadDynamicPropertyOp;
}

/**
 * `operand` is the callee of `user` (a CallExpression or
 * NewExpression). Matches MLIR-style operand-role inspection:
 * behavior depends on *where* the value flows, not just what it is.
 */
function isMethodCalleeOf(user: Operation, operand: Value): boolean {
  if (user instanceof CallExpressionOp) return user.callee === operand;
  if (user instanceof NewExpressionOp) return user.callee === operand;
  return false;
}

function isReorderingHazard(op: Operation): boolean {
  const name = op.constructor.name;
  return (
    name === "StoreLocalOp" ||
    name === "StoreContextOp" ||
    name === "StoreStaticPropertyOp" ||
    name === "StoreDynamicPropertyOp" ||
    name === "DeleteStaticPropertyOp" ||
    name === "DeleteDynamicPropertyOp" ||
    name === "UpdateExpressionOp" ||
    name === "CallExpressionOp" ||
    name === "NewExpressionOp" ||
    name === "SuperCallOp" ||
    name === "TaggedTemplateExpressionOp" ||
    name === "AwaitExpressionOp" ||
    name === "YieldExpressionOp" ||
    name === "ImportExpressionOp"
  );
}
