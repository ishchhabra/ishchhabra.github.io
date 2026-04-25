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
} from "../../ir";
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

/**
 * Value Materialization: decide which SSA Values need a named
 * `const $tmp = expr;` binding for codegen. Everything else stays
 * inline at its use site.
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
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public run(): void {
    const env = this.moduleIR.environment;
    for (const block of this.funcOp.blocks) {
      const ops = block.operations;
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (!this.needsSpill(op)) continue;

        const lval = env.createValue();
        const init = env.createOperation(BindingInitOp, lval, "const", op.place!);
        block.insertOpAt(i + 1, init);
        this.rewriteUses(op, lval, init);
        i++; // skip inserted binding init
      }
    }
  }

  // ---------------------------------------------------------------
  // Decision
  // ---------------------------------------------------------------

  private needsSpill(op: Operation): boolean {
    if (op.place === undefined) return false;

    // A. Already named or emits non-Expression AST.
    if (op instanceof BindingDeclOp || op instanceof BindingInitOp || op instanceof StoreLocalOp) {
      return false;
    }
    if (emitsNonExpression(op)) return false;

    // B. Trivially duplicable.
    if (this.isTriviallyDuplicable(op)) return false;

    const useCount = op.place.users.size;
    if (useCount === 0) return false; // DCE leftover or standalone-emitted

    // C. Multi-use.
    if (useCount > 1) return true;

    // Single-use from here.
    const user = op.place.users.values().next().value as Operation;

    // D. Identifier-required operand.
    if (requiresIdentifierOperand(user, op.place)) return true;

    // D2. Method-call callee preservation. Spilling `obj.m` into
    //     `const t = obj.m; t(args)` detaches the `this` binding —
    //     JS only binds the receiver when the callee is a
    //     MemberExpression in the call expression itself. Keep the
    //     property-read inlined at the call site so codegen emits
    //     `obj.m(args)`. Applies regardless of order-sensitivity.
    if (isMethodCalleeOf(user, op.place) && isPropertyRead(op)) {
      return false;
    }

    // E. Order-sensitive + intervening effect.
    if (this.isOrderSensitive(op) && this.inliningWouldReorder(op, user)) {
      return true;
    }

    return false;
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
   * An op is order-sensitive if its evaluation has observable side
   * effects or reads state that another op may mutate. Conservative
   * approximation via `hasSideEffects` — CallExpression, property
   * reads (getters per CLAUDE.md), Await, etc.
   */
  private isOrderSensitive(op: Operation): boolean {
    return op.hasSideEffects(this.moduleIR.environment);
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
   * Cross-block is conservatively treated as "no reorder" — codegen
   * doesn't hoist an expression across a block boundary.
   */
  private inliningWouldReorder(definer: Operation, user: Operation): boolean {
    const block = definer.parentBlock;
    if (block === null || user.parentBlock !== block) return false;
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

  // ---------------------------------------------------------------
  // Rewriting
  // ---------------------------------------------------------------

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
 * Ops whose execution at a given position affects observable state
 * that other ops may depend on. If such an op sits between a
 * definer and its single user, inlining would reorder the definer
 * past it.
 *
 * We don't count pure construction (ObjectExpression, ArrowFunction,
 * BinaryExpression) — those don't affect observable state.
 */
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
 * True iff any op in `root`'s operand subtree (excluding `root`
 * itself) has direct side effects.
 */
function operandSubtreeHasSideEffects(
  root: Operation,
  env: Parameters<Operation["hasSideEffects"]>[0],
): boolean {
  const seen = new Set<Operation>();
  const stack: Operation[] = [];
  for (const operand of root.operands()) {
    const def = operand.def;
    if (def instanceof Operation) stack.push(def);
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (cur.hasSideEffects(env)) return true;
    for (const operand of cur.operands()) {
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
